"""Validation. Nothing reaches a student without passing through here.

Two rules govern this whole module:

* **A model never validates its own output.** `validated=True` is set by these functions
  and by nothing else. Asking a model whether its mission is correct gets you a
  confident yes, which is worth nothing.
* **A failed check is a rejected mission, not a warning.** A mission with tests that
  disagree with its solution is unsolvable, and an unsolvable mission in front of a child
  who is already unsure is the worst thing this system can do.

## What gets checked

    solvable          the reference solution passes every test
    not-already-done  the starter code fails at least one test
    in-bounds         every identifier comes from the manifest
    complete          no unfilled {placeholders}, enough tests
    no-leak           the starter does not contain the answer

The last one is subtle and the reason `starter_fails` exists: a starter that already
passes is not a mission, it is a screenshot.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field

from typing import Final

from app.ai import sandbox
from app.manifests.models import World
from app.schemas.common import HintRung
from app.rules.mission_builder import ComposedMission

#: Python builtins and keywords a generated solution may legitimately use. Anything else
#: has to come from the manifest or the parameters.
_ALLOWED_NAMES = {
    # keywords and structure
    "def", "return", "if", "elif", "else", "for", "while", "in", "and", "or", "not",
    "is", "None", "True", "False", "pass", "break", "continue",
    # types used in signatures
    "int", "str", "list", "bool", "float", "dict",
    # the small set of builtins these missions need
    "len", "range", "sum", "max", "min", "abs", "round", "sorted", "append", "print",
    # conventional locals the templates themselves introduce
    "total", "count", "result", "value", "item", "largest", "busy", "passenger",
    "self", "f",
}

_IDENTIFIER = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\b")
_PLACEHOLDER = re.compile(r"<<(\w+)>>")


@dataclass
class ValidationReport:
    ok: bool = True
    failures: list[str] = field(default_factory=list)
    #: Non-fatal. Worth looking at, not worth rejecting a mission over.
    warnings: list[str] = field(default_factory=list)
    checks_run: list[str] = field(default_factory=list)

    def fail(self, message: str) -> None:
        self.ok = False
        self.failures.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def as_dict(self) -> dict:
        """Stored on `generated_missions` so a rejection can be explained later."""
        return {
            "ok": self.ok,
            "failures": self.failures,
            "warnings": self.warnings,
            "checks_run": self.checks_run,
        }


def validate(mission: ComposedMission, world: World) -> ValidationReport:
    """Run every check. Returns the report; also sets `mission.validated`."""
    report = ValidationReport()

    for problem in mission.problems:
        report.fail(problem)

    _check_completeness(mission, world, report)
    _check_solution_solves_it(mission, report)
    _check_starter_does_not(mission, report)
    _check_identifiers_in_bounds(mission, world, report)
    _check_scene_exists(mission, world, report)

    mission.validated = report.ok
    return report


# ------------------------------------------------------------------------- checks


def _check_completeness(mission: ComposedMission, world: World, report: ValidationReport) -> None:
    report.checks_run.append("completeness")

    for label, text in (
        ("starter code", mission.starter_code),
        ("solution", mission.solution_code),
        ("signature", mission.signature),
    ):
        if not text.strip():
            report.fail(f"{label} is empty")
        # An unfilled placeholder means a param the manifest declared and nothing
        # supplied. Visible in the mission as a literal {like_this}.
        for ph in _PLACEHOLDER.findall(text):
            report.fail(f"{label} still contains an unfilled placeholder {{{ph}}}")

    if len(mission.tests) < 2:
        report.fail(
            f"only {len(mission.tests)} test(s); a single test almost always passes "
            "for the wrong reason"
        )

    limit = world.constraints.max_starter_lines
    lines = len([ln for ln in mission.starter_code.splitlines() if ln.strip()])
    if lines > limit:
        report.fail(f"starter code is {lines} lines; this world allows {limit}")


def _check_solution_solves_it(mission: ComposedMission, report: ValidationReport) -> None:
    """The reference solution must pass every test. Otherwise nothing can."""
    report.checks_run.append("solution_passes")
    if not mission.tests:
        report.fail("no tests to run the solution against")
        return

    ok, failures = sandbox.passes(mission.solution_code, mission.tests)
    if not ok:
        for f in failures:
            report.fail(f"the reference solution fails its own test: {f}")


def _check_starter_does_not(mission: ComposedMission, report: ValidationReport) -> None:
    """The starter must fail at least one test, or there is nothing to do.

    Also catches the worse version of the same bug: a template where the scaffold was
    generous enough to leave the whole answer in place.
    """
    report.checks_run.append("starter_fails")
    if not mission.tests:
        return

    ok, _ = sandbox.passes(mission.starter_code, mission.tests)
    if ok:
        report.fail(
            "the starter code already passes every test — the mission is already solved"
        )


def _locally_bound(code: str) -> set[str]:
    """Every name the code binds itself: parameters, assignments, `for` targets, defs.

    Parsed rather than pattern-matched. A regex cannot distinguish `orders` (a world
    noun) from `order` (how you walk it), and rejecting the second is how a perfectly
    good mission gets thrown away.
    """
    bound: set[str] = set()
    try:
        tree = ast.parse(code)
    except SyntaxError:
        # A solution that will not parse fails the "solution passes its tests" check
        # already, with a far clearer message than this one would give.
        return bound

    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            bound.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            bound.add(node.name)
            args = node.args
            for arg in [*args.posonlyargs, *args.args, *args.kwonlyargs]:
                bound.add(arg.arg)
            if args.vararg:
                bound.add(args.vararg.arg)
            if args.kwarg:
                bound.add(args.kwarg.arg)
        elif isinstance(node, ast.Attribute):
            # `result.append` — the method name is Python's, not the manifest's.
            bound.add(node.attr)

    return bound


def _signature_params(code: str) -> list[str]:
    """Parameter names of the last function defined — the one the student writes.

    The last, not the first: a template may hand the student a helper to build on, and
    the exercise is about the function that comes after it.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return []

    funcs = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]
    if not funcs:
        return []
    args = funcs[-1].args
    return [a.arg for a in [*args.posonlyargs, *args.args, *args.kwonlyargs]]


def _check_identifiers_in_bounds(
    mission: ComposedMission, world: World, report: ValidationReport
) -> None:
    """Every free name in the solution must trace back to the manifest.

    This is what enforces "generation is selection, never invention". A solution that
    reaches for `profit_margin` in a bakery nobody modelled would pass every other check
    and still be wrong — the child is asked about a quantity that does not exist.

    Names the code binds itself are fine: a loop variable is not an invented noun.
    """
    report.checks_run.append("identifiers_in_bounds")

    allowed = set(_ALLOWED_NAMES)
    allowed |= set(world.vocabulary)
    allowed |= {str(v) for v in mission.params.values() if isinstance(v, str)}
    allowed |= set(mission.params)
    allowed |= _locally_bound(mission.solution_code)
    allowed |= set(_IDENTIFIER.findall(mission.signature))

    unknown = {
        name
        for name in _IDENTIFIER.findall(mission.solution_code)
        if name not in allowed and not name.startswith("_")
    }
    if unknown:
        report.fail(
            f"the solution uses identifiers that are not in the manifest and are not "
            f"bound anywhere in the code: {sorted(unknown)}"
        )

    # The stricter half, and the one that actually keeps a mission inside its world.
    #
    # Locals may be called anything — `order`, `total`, `i` — and rejecting those throws
    # away good missions. But PARAMETERS are what the exercise is *about*. A function
    # taking `profit_margin` is asking a child about a quantity this bakery does not
    # have, however well the code runs.
    # Deliberately NOT `allowed` — that set includes every locally bound name, and a
    # parameter is bound by definition, which would make this check vacuous.
    generic = {"n", "x", "y", "i", "items", "values", "data", "numbers", "text", "name"}
    param_ok = (
        set(world.vocabulary)
        | generic
        | {str(v) for v in mission.params.values() if isinstance(v, str)}
    )
    for param in _signature_params(mission.solution_code):
        if param in param_ok:
            continue
        report.fail(
            f"the function takes a parameter '{param}' that is not a noun in the "
            f"{world.id} world — the exercise is about something that does not exist there"
        )


def _check_scene_exists(mission: ComposedMission, world: World, report: ValidationReport) -> None:
    report.checks_run.append("scene_exists")
    scene = world.scene(mission.scene_id)
    if scene is None:
        report.fail(f"scene '{mission.scene_id}' is not in the {world.id} manifest")
    elif not scene.asset:
        report.warn(f"scene '{mission.scene_id}' has no artwork; it will render blank")


# ------------------------------------------------------------------- prose guards


#: Phrases that mean a hint has stopped nudging and started answering.
_ANSWER_MARKERS = ("الحل هو", "الإجابة", "اكتب بالظبط", "الكود الصح", "the answer is")


def hint_leaks_blank(hint: str, blanks: list[str] | None) -> tuple[bool, str | None]:
    """Does this hint state what belongs in the blank?

    Separate from `hint_leaks_answer`, and the one that actually matters during guided
    coding. That function looks for whole solution *lines*; in a fill-in-the-blank the
    line never appears, and the model can hand over the answer with a single token.

    A real rung-4 hint that got through the line check:

        "كل اللي ناقصك دلوقتي تكتبي رقم `12`"

    The blank was `12`. Nothing was left for the student to work out, and it was cached
    and served to everyone who hit the same step.

    Matched on token boundaries so a hint may still say "the second tray" when the
    answer happens to be 2, and short answers are checked more strictly than long ones.
    """
    if not blanks:
        return False, None

    # Strip formatting the model wraps answers in, so `12` and 12 compare the same.
    cleaned = re.sub(r"[`’“”\"']", " ", hint)

    for answer in blanks:
        token = str(answer).strip().strip("\"'`")
        if not token:
            continue

        # A bare digit or a very short name can appear innocently in prose, so require
        # it to stand alone rather than merely occur.
        pattern = rf"(?<![\w.]){re.escape(token)}(?![\w.])"
        if re.search(pattern, cleaned):
            return True, f"the hint states the blank's answer ({token!r}) outright"

    return False, None


def hint_leaks_answer(hint: str, solution_code: str) -> tuple[bool, str | None]:
    """Does this hint hand over the solution?

    The single most important safety property in the product, and the reason the hint
    ladder exists at all. Checked in Python because a model asked "did you just give away
    the answer" will say no.

    Compares against the solution's own body lines rather than looking for keywords: a
    hint may absolutely say the word `if`, and must not contain the student's actual
    missing line.
    """
    body = [
        line.strip()
        for line in solution_code.splitlines()
        # Skip the def line — naming the function is fine and often necessary.
        if line.strip() and not line.strip().startswith(("def ", "#"))
    ]

    for line in body:
        # Short lines like `pass` or `return` are common vocabulary, not the answer.
        if len(line) > 12 and line in hint:
            return True, f"the hint contains a solution line verbatim: {line!r}"

    lowered = hint.lower()
    for marker in _ANSWER_MARKERS:
        if marker in hint or marker in lowered:
            return True, f"the hint announces an answer: {marker!r}"

    return False, None


# ===========================================================================================
# From `ai/foundations` — the AI teammate's hint guards, taken because they are better than
# what we had. `contains_runnable_python_line` parses the hint with `ast` and asks whether it
# contains a runnable statement, instead of matching strings the way our first version did.
#
# Three things of theirs are deliberately NOT here:
#
#   the manifest sandbox   `ManifestPropMock`, `create_manifest_sandbox`,
#                          `extract_manifest_allowed_apis`, `validate_manifest_and_solution`
#                          validate the props-and-verbs world model (`gate.open()`,
#                          `station.passengers`). That model was replaced when the real
#                          content turned out to be plain Python functions, so those ~350
#                          lines check a schema nothing produces any more. Not their fault —
#                          nobody told them the world changed.
#   `execution_timeout`    SIGALRM, which is Unix-only by their own docstring and raises on
#                          Windows. `app/ai/sandbox.py` runs generated code in a subprocess
#                          instead, which is cross-platform and survives a C-level hang.
#   `SAFE_BUILTINS`        belongs to that same in-process sandbox.
#
# One change to what is below: rung 4 now also runs our `hint_leaks_blank`. Their runnable-line
# check would not have caught the leak that actually reached a student.
# ===========================================================================================

MIN_RUNG: Final[int] = 1
MAX_RUNG: Final[int] = 4
MIN_HINT_LENGTH: Final[int] = 10

FENCED_CODE_BLOCK_PATTERN: Final[re.Pattern[str]] = re.compile(r"```", re.DOTALL)


@dataclass(frozen=True, slots=True)
class GuardResult:
    """Result of hint output validation."""

    passed: bool
    violations: list[str]


def contains_fenced_code_block(text: str) -> bool:
    """Detect markdown-style triple-backtick fenced code blocks (```)."""
    return bool(FENCED_CODE_BLOCK_PATTERN.search(text))


def contains_any_term(text: str, terms: list[str]) -> bool:
    """Case-insensitive word-boundary check against a list of forbidden terms.

    Uses word boundaries (\\b) where practical to avoid false positives like
    matching 'x' inside 'next' or 'text'.
    """
    if not terms:
        return False

    for term in terms:
        term = term.strip()
        if not term:
            continue
        prefix = r"\b" if re.match(r"^\w", term) else r"(?:^|\W)"
        suffix = r"\b" if re.search(r"\w$", term) else r"(?:$|\W)"
        pattern = re.compile(rf"{prefix}{re.escape(term)}{suffix}", re.IGNORECASE)
        if pattern.search(text):
            return True

    return False


def _is_non_trivial_statement(stmt: ast.stmt) -> bool:
    """Determine whether an AST statement is non-trivial executable code.

    Excludes:
      - Bare identifiers (e.g. `x`, `condition`)
      - Bare literals / constants (e.g. `12`, `"open"`, `True`)
      - Unary operations on constants (e.g. `-1`)
      - Bare tuples/lists of literals or identifiers
    """
    if isinstance(stmt, ast.Expr):
        val = stmt.value
        if isinstance(val, (ast.Name, ast.Constant)):
            return False
        if isinstance(val, ast.UnaryOp) and isinstance(val.operand, ast.Constant):
            return False
        if isinstance(val, (ast.Tuple, ast.List)):
            if all(isinstance(elt, (ast.Name, ast.Constant)) for elt in val.elts):
                return False
        return True
    return True


def _is_runnable_line(line: str) -> bool:
    """Attempt to parse a single line as an executable Python statement."""
    line = line.strip()
    if not line or line.startswith("#"):
        return False

    try:
        tree = ast.parse(line)
        if tree.body and any(_is_non_trivial_statement(s) for s in tree.body):
            return True
    except SyntaxError:
        # Check if it is a compound statement header (e.g. `if waiting > 30:`)
        if line.endswith(":"):
            try:
                tree = ast.parse(line + " pass")
                if tree.body and any(_is_non_trivial_statement(s) for s in tree.body):
                    return True
            except SyntaxError:
                pass

    return False


def contains_runnable_python_line(text: str) -> bool:
    """Check whether text contains any complete runnable lines of Python code.

    HEURISTIC IMPLEMENTATION:
        Splits text into lines, strips markdown fencing/backticks and leading
        bullet/comment markers (*, -, 1.), and attempts ast.parse() on each
        remaining non-empty line individually, excluding bare identifiers,
        bare literals, and bare comments. Also inspects inline backticked snippets.

    KNOWN LIMITATIONS:
        - False negatives: Multi-line statements broken across multiple lines
          evade single-line AST parsing.
        - False positives: Rare short natural-language sentences that happen to be
          syntactically valid Python (e.g. 'check x' or 'del x').
        This is why this heuristic serves as a defense-in-depth *guard*, not the
        sole defense — the versioned prompt instructions from tico_persona.py
        are the primary prevention layer.
    """
    for raw_line in text.splitlines():
        line = raw_line.strip()
        # Strip markdown bullets, blockquotes, numbered list prefixes
        line = re.sub(r"^[>\s*\-+0-9.)]+", "", line).strip()
        # Strip enclosing backticks
        line = line.strip("`").strip()

        if _is_runnable_line(line):
            return True

        # Check if line has a natural-language label before a colon (e.g. "اكتب السطر ده: gate.open()")
        if ":" in line:
            suffix = line.split(":", 1)[1].strip()
            if suffix and _is_runnable_line(suffix):
                return True

        # Also inspect inline code segments inside backticks
        for snippet in re.findall(r"`([^`]+)`", raw_line):
            if _is_runnable_line(snippet):
                return True

    return False


def validate_hint_output(
    rung: HintRung | int,
    hint_text: str,
    *,
    solution_identifiers: list[str] | None = None,
    target_values: list[str] | None = None,
) -> GuardResult:
    """Validate model-generated hint prose against rung-specific pedagogical constraints.

    Args:
        rung: Hint rung (1 to 4).
        hint_text: The prose generated by the model.
        solution_identifiers: Optional identifiers from the mission solution (e.g.
                              ['gate', 'open', 'waiting']). When None, this specific
                              check is skipped (leak coverage is partial until services/
                              wires mission metadata).
        target_values: Optional concrete literal targets from the mission (e.g.
                       ['30', 'open']). When None, this specific check is skipped.

    Returns:
        GuardResult with boolean passed status and list of human-readable violation reasons.

    Raises:
        ValueError: If rung is not between 1 and 4.
    """
    rung_int = int(rung)
    if rung_int < MIN_RUNG or rung_int > MAX_RUNG:
        raise ValueError(f"Invalid rung: {rung}. Expected an integer in {MIN_RUNG}..{MAX_RUNG}.")

    # FIX B: Universal check for empty or trivially short hint text
    stripped = hint_text.strip()
    if len(stripped) < MIN_HINT_LENGTH:
        return GuardResult(
            passed=False,
            violations=["hint text is empty or too short to be useful"],
        )

    violations: list[str] = []

    if rung_int == 1:
        if contains_fenced_code_block(hint_text):
            violations.append("rung 1: contains a fenced code block")
        if solution_identifiers and contains_any_term(hint_text, solution_identifiers):
            violations.append("rung 1: contains solution identifiers")

    elif rung_int == 2:
        # FIX A: Rung 2 forbids fenced code, solution identifiers, AND solution values
        if contains_fenced_code_block(hint_text):
            violations.append("rung 2: contains a fenced code block")
        if solution_identifiers and contains_any_term(hint_text, solution_identifiers):
            violations.append("rung 2: contains solution identifiers")
        if target_values and contains_any_term(hint_text, target_values):
            violations.append("rung 2: contains solution values")

    elif rung_int == 3:
        if target_values and contains_any_term(hint_text, target_values):
            violations.append("rung 3: contains student target values")
        if solution_identifiers and contains_any_term(hint_text, solution_identifiers):
            violations.append("rung 3: contains student's mission identifiers")

    elif rung_int == 4:
        if contains_runnable_python_line(hint_text):
            violations.append("rung 4: contains a complete runnable line of Python code")
        # Ours. The leak that actually got served said "تكتبي رقم `12`" and contained no
        # runnable line at all, so the check above passes it. See
        # tests/test_hint_ladder.py::test_the_real_leak_that_got_through.
        if target_values:
            leaked, why = hint_leaks_blank(hint_text, target_values)
            if leaked:
                violations.append(f"rung 4: {why}")

    return GuardResult(passed=len(violations) == 0, violations=violations)


# ---------------------------------------------------------------------------


def contains_dunder_reference(code: str) -> bool:
    """Detect references to double-underscore (dunder) attributes or identifiers in AST.

    Mitigates sandbox escape gadget chains (e.g. `().__class__.__bases__[0].__subclasses__()`
    or `x.__globals__`) in curriculum code. Legitimate reference solutions for Python
    curriculum concepts (variables, conditionals, loops, functions) have zero reason
    to reference dunder attributes or names.
    """
    if not code or not code.strip():
        return False

    try:
        tree = ast.parse(code)
    except SyntaxError:
        # Let the existing syntax-error inspection report unparseable code
        return False

    for node in ast.walk(tree):
        # Attribute access: e.g. obj.__class__, obj.__bases__, obj.__subclasses__
        if isinstance(node, ast.Attribute):
            attr = node.attr
            if attr.startswith("__") and attr.endswith("__"):
                return True
        # Name lookup: e.g. __builtins__, __import__
        elif isinstance(node, ast.Name):
            name_id = node.id
            if name_id.startswith("__") and name_id.endswith("__"):
                return True

    return False


# ===========================================================================================
# LEGACY — the props-and-verbs manifest sandbox, from `ai/foundations`.
#
# This validates a world model where a mission's solution drove game objects: `gate.open()`,
# `station.passengers`, a manifest listing which props and verbs a mission was allowed to
# touch. The real content turned out to be plain Python functions — `calculate_loaves(trays)`
# — so the six-phase generator in `app/ai/chains/mission_gen.py` validates against a world
# vocabulary and a runnable reference solution instead, and never calls anything below.
#
# It is kept because `app/ai/graphs/mission_gen.py` and ~590 lines of their tests still use
# it, and because deleting a teammate's working code over a change on our side of the project
# is a decision for the team, not for this merge. If the props-and-verbs generator goes, this
# section and that module go with it in one commit.
#
# Note for anyone running this on Windows: `execution_timeout` is SIGALRM-based and
# fail-closed by design — it raises `TimeoutGuaranteeUnavailableError` rather than run code
# it cannot interrupt. That is the correct behaviour, and it is why `app/ai/sandbox.py` runs
# generated code in a subprocess instead.
# ===========================================================================================

import contextlib
import signal
from typing import Any, Callable

EXECUTION_TIMEOUT_SECONDS: Final[int] = 2

# Explicit allowlist of safe builtins based on curriculum requirements
# (variables, conditionals, loops, functions). Excludes __import__, open,
# exec, eval, compile, input, and dunders.
SAFE_BUILTINS: Final[dict[str, object]] = {
    # Constants
    "True": True,
    "False": False,
    "None": None,
    # Core types and constructors
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "list": list,
    "dict": dict,
    "set": set,
    "tuple": tuple,
    # Sequence and iteration utilities
    "len": len,
    "range": range,
    "enumerate": enumerate,
    "zip": zip,
    "min": min,
    "max": max,
    "sum": sum,
    "abs": abs,
    "round": round,
    "isinstance": isinstance,
    "all": all,
    "any": any,
    # Standard exceptions
    "Exception": Exception,
    "ValueError": ValueError,
    "TypeError": TypeError,
    "IndexError": IndexError,
    "KeyError": KeyError,
}


class TimeoutGuaranteeUnavailableError(RuntimeError):
    """Raised when the execution sandbox cannot guarantee a hard timeout.

    Enforces fail-closed security: if SIGALRM cannot be installed (e.g. running
    in a worker thread, or unsupported platform), execution is refused rather
    than run unprotected against unbounded execution / infinite loops.
    """


class ExecutionTimeoutError(TimeoutError):
    """Raised when sandbox execution exceeds the allowed time limit."""


def _sigalrm_handler(signum: int, frame: Any) -> None:
    raise ExecutionTimeoutError("solution execution exceeded time limit — possible infinite loop")


@contextlib.contextmanager
def execution_timeout(seconds: int = EXECUTION_TIMEOUT_SECONDS):
    """Execution timeout context manager using SIGALRM on Unix.

    FAIL-CLOSED ARCHITECTURAL DESIGN:
    `signal.alarm()` is a Unix process timer that fires SIGALRM.
    Python enforces that `signal.signal()` and `signal.alarm()` can ONLY
    be registered and handled from the main thread of the main Python interpreter.
    If this function is executed where a real alarm cannot be guaranteed
    (e.g., inside an asynchronous FastAPI threadpool worker, unsupported OS,
    or non-main thread), it raises `TimeoutGuaranteeUnavailableError` immediately.
    We strictly refuse to execute student/model solutions unprotected against
    infinite loops.
    """
    has_alarm = hasattr(signal, "SIGALRM") and hasattr(signal, "alarm")
    if not has_alarm:
        raise TimeoutGuaranteeUnavailableError(
            "SIGALRM is unavailable on this platform; cannot guarantee execution timeout"
        )

    old_handler = None
    try:
        old_handler = signal.signal(signal.SIGALRM, _sigalrm_handler)
        signal.alarm(seconds)
    except (ValueError, AttributeError) as exc:
        raise TimeoutGuaranteeUnavailableError(
            f"Cannot install SIGALRM handler (must run in main thread): {exc}"
        ) from exc

    try:
        yield
    finally:
        signal.alarm(0)
        if old_handler is not None:
            try:
                signal.signal(signal.SIGALRM, old_handler)
            except (ValueError, AttributeError):
                pass


class ManifestPropMock:
    """Dynamic mock object representing an in-game prop in the execution sandbox.

    Derived dynamically from the world manifest's declared verbs, reads, and states.
    Zero-argument mutating verbs (e.g. `gate.open()`), state updates, and parameterized
    setters/calls are dynamically bound per manifest declaration without hardcoded
    classes.
    """

    def __init__(self, name: str):
        self._name = name

    def __repr__(self) -> str:
        return f"<ManifestPropMock '{self._name}'>"


def _create_mock_method(
    obj: ManifestPropMock,
    method_name: str,
    param_names: list[str],
    states: list[str],
) -> Callable[..., Any]:
    """Create a dynamic method on a prop mock reflecting manifest semantics."""

    def method(*args: Any, **kwargs: Any) -> Any:
        setattr(obj, f"{method_name}_called", True)

        # 1. State transitions: open() / close() or verbs matching declared states
        if method_name in ("open", "close"):
            setattr(obj, "state", method_name)
        elif method_name in states:
            setattr(obj, "state", method_name)
        # 2. Setters: set_<attr>(val) -> sets obj.<attr> = val
        elif method_name.startswith("set_") and len(method_name) > 4:
            target_attr = method_name[4:]
            if args:
                setattr(obj, target_attr, args[0])
            elif kwargs and target_attr in kwargs:
                setattr(obj, target_attr, kwargs[target_attr])
        # 3. Display / message verbs: show(text), display(msg)
        elif method_name in ("show", "display", "print"):
            val = args[0] if args else (kwargs.get("text", kwargs.get("message", "")))
            setattr(obj, "message", str(val))
            setattr(obj, "text", str(val))
        # 4. Generic parameterized verbs: bind passed values to attribute names
        else:
            for p_name, arg in zip(param_names, args):
                setattr(obj, p_name, arg)
            for k, v in kwargs.items():
                setattr(obj, k, v)
        return None

    return method


def create_manifest_sandbox(manifest: dict | None = None) -> dict[str, object]:
    """Create a simulated Python execution environment driven entirely by the manifest.

    Dynamically populates prop mock objects for every prop declared in manifest['props'],
    binding their declared reads, states, and verbs, and attaches a strictly restricted
    safe `__builtins__` dictionary.
    """
    manifest_data = manifest or {}
    props_list = manifest_data.get("props", [])

    # Global environment dict starting with restricted safe builtins
    sandbox: dict[str, object] = {
        "__builtins__": dict(SAFE_BUILTINS),
    }

    # Helper mapping to reuse mock objects if multiple verbs/reads refer to the same object
    mocks: dict[str, ManifestPropMock] = {}

    def get_or_create_mock(obj_name: str) -> ManifestPropMock:
        if obj_name not in mocks:
            mock = ManifestPropMock(obj_name)
            mocks[obj_name] = mock
            sandbox[obj_name] = mock
        return mocks[obj_name]

    for prop in props_list:
        prop_id = prop.get("id", "")
        states = [str(s) for s in prop.get("states", [])]

        # Ensure prop id itself is represented
        if prop_id:
            primary_mock = get_or_create_mock(prop_id)
            if states:
                # Default initial state: 'closed' if present, else first state
                default_state = "closed" if "closed" in states else states[0]
                setattr(primary_mock, "state", default_state)
                setattr(primary_mock, "states", list(states))

        # 1. Reads: e.g. "station.passengers -> int", "train.is_arriving -> bool"
        for read in prop.get("reads", []):
            read_match = re.match(
                r"^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)(?:\s*->\s*([a-zA-Z_]\w*))?",
                read.strip(),
            )
            if read_match:
                obj_name, attr_name, type_str = (
                    read_match.group(1),
                    read_match.group(2),
                    read_match.group(3) or "",
                )
                target_mock = get_or_create_mock(obj_name)

                # Set initial attribute based on declared type
                if type_str == "int":
                    default_val = 0
                elif type_str == "bool":
                    default_val = False
                elif type_str == "float":
                    default_val = 0.0
                elif type_str == "str":
                    default_val = ""
                else:
                    default_val = 0
                setattr(target_mock, attr_name, default_val)

        # 2. Verbs: e.g. "gate.open()", "machine.set_price(value)", "board.show(text)"
        for verb in prop.get("verbs", []):
            verb_match = re.match(
                r"^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*(?:\((.*?)\))?",
                verb.strip(),
            )
            if verb_match:
                obj_name, method_name, param_str = (
                    verb_match.group(1),
                    verb_match.group(2),
                    verb_match.group(3) or "",
                )
                param_names = [p.strip() for p in param_str.split(",") if p.strip()]
                target_mock = get_or_create_mock(obj_name)

                # If verb is set_<attr>, also initialize <attr> = 0 on target_mock
                if method_name.startswith("set_") and len(method_name) > 4:
                    attr_name = method_name[4:]
                    if not hasattr(target_mock, attr_name):
                        setattr(target_mock, attr_name, 0)
                elif method_name in ("show", "display", "print"):
                    if not hasattr(target_mock, "message"):
                        setattr(target_mock, "message", "")
                    if not hasattr(target_mock, "text"):
                        setattr(target_mock, "text", "")

                method_fn = _create_mock_method(target_mock, method_name, param_names, states)
                setattr(target_mock, method_name, method_fn)

    return sandbox


def extract_manifest_allowed_apis(manifest: dict) -> set[tuple[str, str]]:
    """Extract set of (object_name, attribute_name) strictly declared in manifest props.

    Closed-manifest principle (docs/08): Unknown IDs, reads, and verbs are fatal validation
    errors. Only pairs explicitly declared under `verbs` and `reads` in the manifest props
    are returned. Zero hardcoded pairs.

    NOTE: If a prop requires an implicit state read (such as `gate.state` or `machine.price`)
    to be directly accessed by student code, it must be declared by Content in `cairo_metro.yaml`
    under that prop's `reads` list.
    """
    allowed: set[tuple[str, str]] = set()

    for prop in manifest.get("props", []):
        for verb in prop.get("verbs", []):
            # Format e.g. "gate.open()" or "machine.set_price(value)"
            call_match = re.match(r"^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)", verb.strip())
            if call_match:
                allowed.add((call_match.group(1), call_match.group(2)))

        for read in prop.get("reads", []):
            # Format e.g. "station.passengers -> int"
            read_match = re.match(r"^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)", read.strip())
            if read_match:
                allowed.add((read_match.group(1), read_match.group(2)))

    return allowed


def validate_manifest_and_solution(
    draft: dict | object,
    manifest: dict,
) -> GuardResult:
    """Validate a generated mission against the closed world manifest.

    Asserts:
      1. World ID matches the manifest.
      2. Scene ID exists in manifest scenes.
      3. Target concept matches one of the manifest's mechanics.
      4. Parameter values satisfy the mechanic's param_schema constraints.
      5. Only legal manifest prop verbs and reads are called in student starter/solution code.
      6. Reference solution executes within sandbox timeout and passes all test assertions.
      7. Starter code does not prematurely leak the complete solution.
    """
    if hasattr(draft, "model_dump"):
        draft_data = draft.model_dump()
    elif isinstance(draft, dict):
        draft_data = draft
    else:
        draft_data = dict(getattr(draft, "__dict__", {}))

    violations: list[str] = []

    # 1. World check
    world_info = manifest.get("world", {})
    expected_world_id = world_info.get("id")
    draft_world_id = draft_data.get("world_id")
    if draft_world_id and draft_world_id != expected_world_id:
        violations.append(
            f"world_id mismatch: draft has '{draft_world_id}', manifest defines '{expected_world_id}'"
        )

    # 2. Scene check
    valid_scene_ids = {s.get("id") for s in manifest.get("scenes", [])}
    draft_scene_id = draft_data.get("scene_id")
    if draft_scene_id not in valid_scene_ids:
        violations.append(
            f"unknown scene_id '{draft_scene_id}'. Valid scenes: {sorted(valid_scene_ids)}"
        )

    # 3. Mechanic and Target Concept check
    mechanics = manifest.get("mechanics", [])
    valid_concepts = {m.get("target_concept") for m in mechanics}
    draft_concept = draft_data.get("target_concept_id")
    if draft_concept not in valid_concepts:
        violations.append(
            f"target_concept_id '{draft_concept}' not supported in manifest mechanics: {sorted(valid_concepts)}"
        )

    # Find matching mechanic
    matching_mechanic = next(
        (m for m in mechanics if m.get("target_concept") == draft_concept),
        None,
    )

    # 4. Parameter validation against param_schema
    if matching_mechanic and "param_schema" in matching_mechanic:
        param_schema = matching_mechanic["param_schema"]
        draft_params = draft_data.get("params", {})
        for p_name, p_rules in param_schema.items():
            if p_name in draft_params:
                val = draft_params[p_name]
                p_type = p_rules.get("type")
                if p_type == "int":
                    if not isinstance(val, int) or isinstance(val, bool):
                        violations.append(f"parameter '{p_name}' must be an int, got {type(val).__name__}")
                    else:
                        p_min = p_rules.get("min")
                        p_max = p_rules.get("max")
                        if p_min is not None and val < p_min:
                            violations.append(f"parameter '{p_name}' value {val} is below minimum {p_min}")
                        if p_max is not None and val > p_max:
                            violations.append(f"parameter '{p_name}' value {val} exceeds maximum {p_max}")
                elif p_type == "enum":
                    options = p_rules.get("options", [])
                    if val not in options:
                        violations.append(f"parameter '{p_name}' value '{val}' is not in allowed options: {options}")

    # 5. Verbs and reads validation (AST inspection of starter and solution code)
    allowed_apis = extract_manifest_allowed_apis(manifest)
    known_prop_objects = {obj for obj, _ in allowed_apis}

    starter_code = draft_data.get("starter_code", "")
    solution_code = draft_data.get("solution_code", "")
    tests = draft_data.get("tests", [])

    codes_to_inspect = [starter_code, solution_code]

    for snippet in codes_to_inspect:
        if not snippet or not snippet.strip():
            continue
        try:
            tree = ast.parse(snippet)
            for node in ast.walk(tree):
                if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                    obj_name = node.value.id
                    attr_name = node.attr
                    if obj_name in known_prop_objects and (obj_name, attr_name) not in allowed_apis:
                        violations.append(
                            f"illegal API call: '{obj_name}.{attr_name}' is not declared in manifest for prop '{obj_name}'"
                        )
        except SyntaxError as syn_err:
            violations.append(f"code snippet syntax error: {syn_err}")

    # 6. Dunder safety check: reject sandbox escape attempts (e.g. __class__, __bases__)
    dunder_snippets = [("starter_code", starter_code), ("solution_code", solution_code)]
    for idx, test in enumerate(tests):
        t_name = test.get("name", f"test_{idx}") if isinstance(test, dict) else getattr(test, "name", f"test_{idx}")
        t_setup = test.get("setup", "") if isinstance(test, dict) else getattr(test, "setup", "")
        t_call = test.get("call", "") if isinstance(test, dict) else getattr(test, "call", "")
        dunder_snippets.append((f"test '{t_name}' setup", t_setup))
        dunder_snippets.append((f"test '{t_name}' call", t_call))

    has_dunder_violation = False
    for label, snippet in dunder_snippets:
        if contains_dunder_reference(snippet):
            violations.append(
                f"{label} references a restricted dunder identifier — rejected as a precaution"
            )
            has_dunder_violation = True

    # 7. Solution execution against tests in sandboxed mock environment
    if has_dunder_violation:
        # Pre-execution security check failed: skip exec/eval entirely as a safety precaution
        pass
    elif not solution_code or not solution_code.strip():
        violations.append("solution_code is empty")
    elif not tests:
        violations.append("mission defines no tests")
    else:
        for idx, test in enumerate(tests):
            t_name = test.get("name", f"test_{idx}") if isinstance(test, dict) else getattr(test, "name", f"test_{idx}")
            t_setup = test.get("setup", "") if isinstance(test, dict) else getattr(test, "setup", "")
            t_call = test.get("call", "") if isinstance(test, dict) else getattr(test, "call", "")
            t_expected = test.get("expected", "") if isinstance(test, dict) else getattr(test, "expected", "")

            sandbox = create_manifest_sandbox(manifest)
            try:
                with execution_timeout(EXECUTION_TIMEOUT_SECONDS):
                    # 1. Run setup if provided
                    if t_setup and t_setup.strip():
                        exec(t_setup, sandbox)

                    # 2. Run solution code
                    exec(solution_code, sandbox)

                    # 3. Evaluate test call
                    result = eval(t_call, sandbox)

                actual_str = str(result).strip()
                expected_str = str(t_expected).strip()

                if actual_str != expected_str:
                    violations.append(
                        f"test '{t_name}' failed: call '{t_call}' produced '{actual_str}', expected '{expected_str}'"
                    )
            except TimeoutGuaranteeUnavailableError:
                violations.append(
                    f"test '{t_name}' solution execution could not be safely time-limited in this context — rejected as a precaution"
                )
            except ExecutionTimeoutError:
                violations.append(
                    f"test '{t_name}' execution exceeded time limit — possible infinite loop"
                )
            except (ImportError, NameError) as import_err:
                if "__import__" in str(import_err):
                    violations.append(
                        f"test '{t_name}' attempted unauthorized import or blocked builtin: {import_err}"
                    )
                else:
                    violations.append(f"test '{t_name}' raised runtime exception: {import_err}")
            except Exception as test_exc:
                violations.append(f"test '{t_name}' raised runtime exception: {test_exc}")

    # 7. Leak check: starter code must not be identical to solution code
    if starter_code.strip() and starter_code.strip() == solution_code.strip():
        violations.append("starter_code is identical to solution_code (premature answer leak)")

    return GuardResult(passed=len(violations) == 0, violations=violations)
