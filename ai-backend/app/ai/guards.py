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
# Their manifest sandbox is not here. It validated the props-and-verbs world model
# (`gate.open()`, `station.passengers`) that was replaced when the real content turned out
# to be plain Python functions, and it was deleted with the generator that used it. Its
# SIGALRM-based timeout went too: `app/ai/sandbox.py` runs generated code in a subprocess,
# which is cross-platform and survives a C-level hang.
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
