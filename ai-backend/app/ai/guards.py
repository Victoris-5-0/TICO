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

from app.ai import sandbox
from app.manifests.models import World
from app.rules.composer import ComposedMission

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
