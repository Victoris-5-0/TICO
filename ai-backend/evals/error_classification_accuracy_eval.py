"""Error Classification Accuracy Evaluation Suite (M3 Analysis).

CSV Task:
    "30 hand-labelled wrong submissions, accuracy measured | M3 Analysis |
     AI teammate | P2 | Notes: Good demo material: most teams cannot show they
     measure their AI."

Pedagogical & Architectural Contract:
    Measures the classification accuracy of student code failures against a
    ground-truth dataset of 30 hand-labelled synthetic submissions spanning all
    7 ErrorFamily enum values (syntax, name, type, logic, incomplete, runtime, unknown)
    and the STANDARD_KNOWN_TAGS vocabulary across the launch curriculum
    (docs/02-python-curriculum.md: variables, conditionals, loops, functions, lists, dicts).

Dual-Mode Architecture:
    a) Default / CI-safe Mode (live=False):
       Evaluates app.ai.chains.classify_error._deterministic_fallback — the pure-Python,
       zero-model fallback path executed in production when Gemini is unavailable or rate-limited.
       Zero API key requirement, zero network cost, fully reproducible and deterministic.
    b) Live Opt-in Mode (live=True):
       Evaluates the full classify_error() pipeline with Gemini structured output.
       Requires a valid GOOGLE_API_KEY. Never invoked in CI or default test runs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path
import sys
import time
from typing import Final

# Ensure ai-backend root is in sys.path when executed as a standalone script
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

# Ensure required environment settings exist before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://test:test@localhost:5432/test")
os.environ.setdefault("ENVIRONMENT", "development")

from app.ai.chains.classify_error import _deterministic_fallback, classify_error
from app.ai.prompts.error_analysis import STANDARD_KNOWN_TAGS, normalize_tag
from app.schemas.common import ErrorFamily
from app.schemas.submissions import AnalyzeResponse

# NEEDS DECISION: 80.0% (0.80) minimum family accuracy threshold is a reasonable
# CI regression baseline for the deterministic fallback heuristic, not sourced from
# AGENTS.md or tico-ai-tasks.csv. The full LLM pipeline achieves higher nuance,
# while the fallback handles clear-cut syntax, name, type, and common runtime errors.
MINIMUM_FAMILY_ACCURACY_THRESHOLD: Final[float] = 0.80


@dataclass(frozen=True, slots=True)
class ClassificationCase:
    """Hand-labelled wrong code submission case."""

    case_id: str
    curriculum_concept: str
    mission_context: str
    code: str
    error_text: str | None
    expected_output: str | None
    actual_output: str | None
    ground_truth_family: ErrorFamily
    ground_truth_tag: str
    justification: str


@dataclass(frozen=True, slots=True)
class CaseResult:
    """Evaluation result for a single case."""

    case: ClassificationCase
    actual_family: ErrorFamily
    actual_tag: str
    family_match: bool
    tag_match: bool
    confidence: float
    misconception: str


@dataclass(slots=True)
class EvalReport:
    """Structured evaluation report containing summary metrics and confusion analysis."""

    total_cases: int
    family_matches: int
    tag_matches: int
    family_accuracy: float
    tag_accuracy: float
    elapsed_seconds: float
    mode: str
    threshold: float
    results: list[CaseResult] = field(default_factory=list)
    per_family_stats: dict[str, dict[str, int | float]] = field(default_factory=dict)
    confusion_cases: list[CaseResult] = field(default_factory=list)
    tag_mismatch_cases: list[CaseResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return self.family_accuracy >= self.threshold


def get_hand_labelled_cases() -> list[ClassificationCase]:
    """Return the authoritative suite of 30 hand-labelled wrong student submissions."""
    return [
        # -------------------------------------------------------------------
        # Group 1: SYNTAX (5 cases)
        # -------------------------------------------------------------------
        ClassificationCase(
            case_id="SYNTAX_01_MISSING_COLON_IF",
            curriculum_concept="conditionals",
            mission_context="Cairo Metro: Gate Control",
            code="if passengers > 30\n    gate.open()",
            error_text="SyntaxError: expected ':'",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.SYNTAX,
            ground_truth_tag="missing_colon",
            justification="Student omitted trailing colon on if header line.",
        ),
        ClassificationCase(
            case_id="SYNTAX_02_INDENTATION_BLOCK",
            curriculum_concept="functions",
            mission_context="El Forn: Bakery Calculator",
            code="def calculate_price(loaves):\ntotal = loaves * 3\nreturn total",
            error_text="IndentationError: expected an indented block after function definition on line 1",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.SYNTAX,
            ground_truth_tag="indentation_error",
            justification="Student failed to indent function body under def header.",
        ),
        ClassificationCase(
            case_id="SYNTAX_03_UNTERMINATED_STRING",
            curriculum_concept="strings",
            mission_context="El Forn: Opening Message",
            code='print("Ahlan wa sahlan! Welcome to El Forn)',
            error_text="SyntaxError: unterminated string literal (detected at line 1)",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.SYNTAX,
            ground_truth_tag="syntax_error",
            justification="Missing closing double quote before closing parenthesis prevents tokenization.",
        ),
        ClassificationCase(
            case_id="SYNTAX_04_UNCLOSED_PAREN",
            curriculum_concept="variables",
            mission_context="El Forn: Count the Trays",
            code="available_loaves = (trays * 12 + extra_stock\nprint(available_loaves)",
            error_text="SyntaxError: '(' was never closed",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.SYNTAX,
            ground_truth_tag="syntax_error",
            justification="Open parenthesis on arithmetic expression line was never closed.",
        ),
        ClassificationCase(
            case_id="SYNTAX_05_MISSING_COLON_FOR",
            curriculum_concept="loops",
            mission_context="Cairo Metro: Passenger List",
            code="for passenger in passenger_list\n    print(passenger)",
            error_text="SyntaxError: expected ':'",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.SYNTAX,
            ground_truth_tag="missing_colon",
            justification="Omitted colon on for-in loop header.",
        ),
        # -------------------------------------------------------------------
        # Group 2: NAME (4 cases)
        # -------------------------------------------------------------------
        ClassificationCase(
            case_id="NAME_01_UNDEFINED_VAR_TYPO",
            curriculum_concept="variables",
            mission_context="Cairo Metro: Ticket Hall",
            code="ticket_price = 10\ntotal = ticket_prce * quantity",
            error_text="NameError: name 'ticket_prce' is not defined. Did you mean: 'ticket_price'?",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.NAME,
            ground_truth_tag="undefined_variable",
            justification="Typo in variable identifier (ticket_prce instead of ticket_price).",
        ),
        ClassificationCase(
            case_id="NAME_02_UNDEFINED_FUNCTION",
            curriculum_concept="functions",
            mission_context="El Forn: Bakery Calculator",
            code="total = calc_loaves(5)",
            error_text="NameError: name 'calc_loaves' is not defined",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.NAME,
            ground_truth_tag="undefined_function",
            justification="Called function calc_loaves() before defining it.",
        ),
        ClassificationCase(
            case_id="NAME_03_LOCAL_SCOPE_LEAK",
            curriculum_concept="functions",
            mission_context="Cairo Traffic: Controller Fault",
            code="def update_signal():\n    mode = 'active'\nupdate_signal()\nprint(mode)",
            error_text="NameError: name 'mode' is not defined",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.NAME,
            ground_truth_tag="undefined_variable",
            justification="Variable defined in local function scope accessed from outer global scope.",
        ),
        ClassificationCase(
            case_id="NAME_04_UNINITIALIZED_ACCUMULATOR",
            curriculum_concept="loops",
            mission_context="El Forn: Morning Batches",
            code="for batch in batches:\n    total = total + batch",
            error_text="NameError: name 'total' is not defined",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.NAME,
            ground_truth_tag="undefined_variable",
            justification="Accumulator total read in loop body before being initialized to 0.",
        ),
        # -------------------------------------------------------------------
        # Group 3: TYPE (4 cases)
        # -------------------------------------------------------------------
        ClassificationCase(
            case_id="TYPE_01_CONCAT_INT_AND_STR",
            curriculum_concept="input_conversion",
            mission_context="El Forn: Family Order",
            code='quantity = "5"\ntotal = quantity + 2',
            error_text="TypeError: can only concatenate str (not 'int') to str",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.TYPE,
            ground_truth_tag="type_mismatch_int_str",
            justification="Attempted concatenation/addition between str and int without int() conversion.",
        ),
        ClassificationCase(
            case_id="TYPE_02_SUBTRACT_STR_INT",
            curriculum_concept="variables",
            mission_context="Cairo Metro: Passenger List",
            code='capacity = "50"\nremaining = capacity - 10',
            error_text="TypeError: unsupported operand type(s) for -: 'str' and 'int'",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.TYPE,
            ground_truth_tag="type_mismatch",
            justification="Subtraction operator not supported between str literal and int.",
        ),
        ClassificationCase(
            case_id="TYPE_03_INT_NOT_SUBSCRIPTABLE",
            curriculum_concept="dictionaries",
            mission_context="Cairo Traffic: Intersection State",
            code='signal_state = 1\nprint(signal_state["north"])',
            error_text="TypeError: 'int' object is not subscriptable",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.TYPE,
            ground_truth_tag="type_mismatch",
            justification="Bracket key subscript access attempted on integer instead of dict.",
        ),
        ClassificationCase(
            case_id="TYPE_04_CALL_NON_CALLABLE",
            curriculum_concept="functions",
            mission_context="Cairo Metro: Destination Board",
            code='station_name = "Sadat"\nstation_name()',
            error_text="TypeError: 'str' object is not callable",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.TYPE,
            ground_truth_tag="type_mismatch",
            justification="String variable called as function using parenthesis operator.",
        ),
        # -------------------------------------------------------------------
        # Group 4: LOGIC (6 cases)
        # -------------------------------------------------------------------
        ClassificationCase(
            case_id="LOGIC_01_ASSIGN_IN_IF_CONDITION",
            curriculum_concept="conditionals",
            mission_context="Cairo Traffic: Signal Rules",
            code='if light = "green":\n    car.go()',
            error_text="SyntaxError: cannot assign to expression here. Maybe you meant '==' instead of '='?",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.LOGIC,
            ground_truth_tag="assignment_vs_comparison",
            justification="Used single equals assignment operator where comparison equality == was intended.",
        ),
        ClassificationCase(
            case_id="LOGIC_02_WRONG_OPERATOR_ADD",
            curriculum_concept="variables",
            mission_context="El Forn: Count the Trays",
            code="trays = 4\nloaves_per_tray = 12\ntotal_loaves = trays + loaves_per_tray\nprint(total_loaves)",
            error_text=None,
            expected_output="48",
            actual_output="16",
            ground_truth_family=ErrorFamily.LOGIC,
            ground_truth_tag="output_mismatch",
            justification="Student added trays and loaves instead of multiplying them.",
        ),
        ClassificationCase(
            case_id="LOGIC_03_REVERSED_INEQUALITY",
            curriculum_concept="conditionals",
            mission_context="Cairo Metro: Fair Share",
            code="passengers = 45\nif passengers < 30:\n    gate.open()\nelse:\n    gate.close()",
            error_text=None,
            expected_output="open",
            actual_output="closed",
            ground_truth_family=ErrorFamily.LOGIC,
            ground_truth_tag="reversed_condition",
            justification="Inverted inequality condition (< instead of >) opens gate when under crowded threshold.",
        ),
        ClassificationCase(
            case_id="LOGIC_04_OFF_BY_ONE_RANGE",
            curriculum_concept="loops",
            mission_context="Cairo Traffic: Safe Countdown",
            code="for seconds in range(1, 5):\n    print(seconds)",
            error_text=None,
            expected_output="1\n2\n3\n4\n5",
            actual_output="1\n2\n3\n4",
            ground_truth_family=ErrorFamily.LOGIC,
            ground_truth_tag="off_by_one",
            justification="range(1, 5) stops at 4 due to exclusive upper bound, omitting target 5.",
        ),
        ClassificationCase(
            case_id="LOGIC_05_FILTER_INEQUALITY",
            curriculum_concept="filtering",
            mission_context="Cairo Metro: Right Platform",
            code='for train in trains:\n    if train["dest"] != "Helwan":\n        board.show(train)',
            error_text=None,
            expected_output="Helwan Express",
            actual_output="Shubra Local",
            ground_truth_family=ErrorFamily.LOGIC,
            ground_truth_tag="output_mismatch",
            justification="Used != instead of == when filtering for target train destination.",
        ),
        ClassificationCase(
            case_id="LOGIC_06_SILENT_LOGIC_BUG_NO_RUNNER",
            curriculum_concept="conditionals",
            mission_context="Cairo Traffic: Intersection State",
            code='speed = 70\nif speed > 80:\n    traffic_light = "red"\nelse:\n    traffic_light = "green"',
            error_text=None,
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.LOGIC,
            ground_truth_tag="reversed_condition",
            justification="Threshold intended to be 60 but student wrote 80. Without runner output evidence, heuristic fallback misses this.",
        ),
        # -------------------------------------------------------------------
        # Group 5: INCOMPLETE (3 cases)
        # -------------------------------------------------------------------
        ClassificationCase(
            case_id="INCOMPLETE_01_UNTOUCHED_COMMENT",
            curriculum_concept="variables",
            mission_context="El Forn: Count the Trays",
            code="# TODO: Calculate total loaves",
            error_text=None,
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.INCOMPLETE,
            ground_truth_tag="incomplete_code",
            justification="Submission is an untouched starter comment with zero student code.",
        ),
        ClassificationCase(
            case_id="INCOMPLETE_02_EMPTY_CODE",
            curriculum_concept="strings",
            mission_context="El Forn: Opening Message",
            code="",
            error_text=None,
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.INCOMPLETE,
            ground_truth_tag="incomplete_code",
            justification="Submission is completely empty.",
        ),
        ClassificationCase(
            case_id="INCOMPLETE_03_MISSING_RETURN",
            curriculum_concept="functions",
            mission_context="El Forn: Bakery Calculator",
            code="def calculate_order(trays):\n    total = trays * 12",
            error_text=None,
            expected_output="48",
            actual_output="None",
            ground_truth_family=ErrorFamily.INCOMPLETE,
            ground_truth_tag="missing_return",
            justification="Function calculates total into local variable but forgets return total statement.",
        ),
        # -------------------------------------------------------------------
        # Group 6: RUNTIME (5 cases)
        # -------------------------------------------------------------------
        ClassificationCase(
            case_id="RUNTIME_01_ZERO_DIVISION",
            curriculum_concept="variables",
            mission_context="Cairo Metro: Fair Share",
            code="passengers = 100\ncars = 0\nper_car = passengers / cars",
            error_text="ZeroDivisionError: division by zero",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.RUNTIME,
            ground_truth_tag="division_by_zero",
            justification="Attempted division by zero variable cars.",
        ),
        ClassificationCase(
            case_id="RUNTIME_02_INDEX_OUT_OF_BOUNDS",
            curriculum_concept="lists",
            mission_context="Cairo Metro: Passenger List",
            code='passengers = ["Mona", "Karim", "Tarek"]\nprint(passengers[5])',
            error_text="IndexError: list index out of range",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.RUNTIME,
            ground_truth_tag="index_out_of_range",
            justification="Accessing index 5 in a 3-element list.",
        ),
        ClassificationCase(
            case_id="RUNTIME_03_INFINITE_WHILE_LOOP",
            curriculum_concept="loops",
            mission_context="Cairo Traffic: Safe Countdown",
            code="count = 5\nwhile count > 0:\n    print(count)",
            error_text="TimeoutError: execution timeout (exceeded 2.0s)",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.RUNTIME,
            ground_truth_tag="infinite_loop",
            justification="While loop counter never decremented, causing uncontrolled timeout.",
        ),
        ClassificationCase(
            case_id="RUNTIME_04_RECURSION_LIMIT",
            curriculum_concept="functions",
            mission_context="Cairo Traffic: Green Wave",
            code="def sync_lights(signal_id):\n    return sync_lights(signal_id)",
            error_text="RecursionError: maximum recursion depth exceeded",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.RUNTIME,
            ground_truth_tag="infinite_loop",
            justification="Unbounded recursion without base case exceeds call stack limit.",
        ),
        ClassificationCase(
            case_id="RUNTIME_05_KEY_ERROR_DICT",
            curriculum_concept="dictionaries",
            mission_context="Cairo Metro: Destination Board",
            code='trains = {"M1": "Helwan", "M2": "Shubra"}\nprint(trains["M3"])',
            error_text="KeyError: 'M3'",
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.RUNTIME,
            ground_truth_tag="key_not_found",
            justification="Accessing non-existent key 'M3' in dictionary raises runtime KeyError.",
        ),
        # -------------------------------------------------------------------
        # Group 7: UNKNOWN (3 cases)
        # -------------------------------------------------------------------
        ClassificationCase(
            case_id="UNKNOWN_01_NO_OP_EXPRESSIONS",
            curriculum_concept="variables",
            mission_context="Cairo Metro: Station Dispatcher",
            code="x = 10\ny = 20\n# not sure what to do",
            error_text=None,
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.UNKNOWN,
            ground_truth_tag="unknown_error",
            justification="Syntactically valid assignments with no runtime crash and no test assertions.",
        ),
        ClassificationCase(
            case_id="UNKNOWN_02_PASS_WITH_NOTES",
            curriculum_concept="functions",
            mission_context="Cairo Traffic: Intersection State",
            code="# tried to start\npass\n# what is next",
            error_text=None,
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.UNKNOWN,
            ground_truth_tag="unknown_error",
            justification="Valid pass statement with ambiguous natural language comments.",
        ),
        ClassificationCase(
            case_id="UNKNOWN_03_CONFOUNDING_FRAGMENTS",
            curriculum_concept="loops",
            mission_context="El Forn: Morning Batches",
            code='a = [1, 2]\nprint("testing")',
            error_text=None,
            expected_output=None,
            actual_output=None,
            ground_truth_family=ErrorFamily.UNKNOWN,
            ground_truth_tag="unknown_error",
            justification="Unfinished scratch experimentation expressing no clear mission goal.",
        ),
    ]


def run_error_classification_eval(
    cases: list[ClassificationCase] | None = None,
    live: bool = False,
    threshold: float = MINIMUM_FAMILY_ACCURACY_THRESHOLD,
) -> EvalReport:
    """Execute classification accuracy measurement over hand-labelled dataset.

    Args:
        cases: Optional list of cases to evaluate. Defaults to authoritative 30 cases.
        live: If False (default), evaluates _deterministic_fallback (CI-safe, 0 cost).
              If True, invokes live classify_error() via Gemini (requires GOOGLE_API_KEY).
        threshold: Minimum family accuracy pass/fail threshold (default: 0.80).

    Returns:
        EvalReport with accuracy statistics, per-family breakdown, and confusion cases.
    """
    if cases is None:
        cases = get_hand_labelled_cases()

    start_time = time.perf_counter()
    results: list[CaseResult] = []

    per_family: dict[str, dict[str, int | float]] = {}
    for fam in ErrorFamily:
        per_family[fam.value] = {"total": 0, "correct_family": 0, "correct_tag": 0}

    mode_label = (
        "LIVE_MODEL (Gemini structured output via classify_error)"
        if live
        else "DETERMINISTIC_FALLBACK (CI-safe, offline heuristic)"
    )

    family_matches = 0
    tag_matches = 0
    confusion_cases: list[CaseResult] = []
    tag_mismatch_cases: list[CaseResult] = []

    for case in cases:
        gt_fam = case.ground_truth_family
        gt_tag_norm = normalize_tag(case.ground_truth_tag)

        if live:
            # LIVE OPT-IN: requires GOOGLE_API_KEY
            resp: AnalyzeResponse = classify_error(
                code=case.code,
                error_text=case.error_text,
                expected_output=case.expected_output,
                actual_output=case.actual_output,
            )
            act_fam = resp.family
            act_tag = resp.tag
            conf = resp.confidence
            misc = resp.misconception
        else:
            # CI-SAFE DETERMINISTIC FALLBACK
            fam, tag_str, misc, conf = _deterministic_fallback(
                code=case.code,
                error_text=case.error_text,
                expected_output=case.expected_output,
                actual_output=case.actual_output,
            )
            act_fam = fam
            act_tag = tag_str

        act_tag_norm = normalize_tag(act_tag)
        fam_match = (act_fam == gt_fam)
        tag_match = (act_tag_norm == gt_tag_norm)

        res = CaseResult(
            case=case,
            actual_family=act_fam,
            actual_tag=act_tag_norm,
            family_match=fam_match,
            tag_match=tag_match,
            confidence=conf,
            misconception=misc,
        )
        results.append(res)

        # Update per-family breakdown
        stats = per_family[gt_fam.value]
        stats["total"] += 1
        if fam_match:
            stats["correct_family"] += 1
            family_matches += 1
        else:
            confusion_cases.append(res)

        if tag_match:
            stats["correct_tag"] += 1
            tag_matches += 1
        else:
            tag_mismatch_cases.append(res)

    total = len(cases)
    elapsed = time.perf_counter() - start_time
    fam_acc = (family_matches / total) if total > 0 else 0.0
    tag_acc = (tag_matches / total) if total > 0 else 0.0

    # Calculate percentages for per-family stats
    for fam_key, stats in per_family.items():
        fam_tot = stats["total"]
        stats["family_accuracy_pct"] = (
            (stats["correct_family"] / fam_tot * 100.0) if fam_tot > 0 else 0.0
        )
        stats["tag_accuracy_pct"] = (
            (stats["correct_tag"] / fam_tot * 100.0) if fam_tot > 0 else 0.0
        )

    return EvalReport(
        total_cases=total,
        family_matches=family_matches,
        tag_matches=tag_matches,
        family_accuracy=fam_acc,
        tag_accuracy=tag_acc,
        elapsed_seconds=elapsed,
        mode=mode_label,
        threshold=threshold,
        results=results,
        per_family_stats=per_family,
        confusion_cases=confusion_cases,
        tag_mismatch_cases=tag_mismatch_cases,
    )


def format_report(report: EvalReport) -> str:
    """Format the evaluation results into a human-readable telemetry report."""
    status_str = "PASSED" if report.passed else "FAILED"
    fam_pct = report.family_accuracy * 100.0
    tag_pct = report.tag_accuracy * 100.0
    thresh_pct = report.threshold * 100.0

    lines = [
        "=" * 80,
        "         TICO ERROR CLASSIFICATION ACCURACY EVALUATION REPORT (M3)            ",
        "=" * 80,
        f"Evaluation Mode:           {report.mode}",
        f"Overall Evaluation Status: {status_str}",
        f"Pass Threshold:            Family Accuracy >= {thresh_pct:.1f}%",
        f"Total Hand-Labelled Cases: {report.total_cases}",
        f"Family Accuracy:           {fam_pct:.2f}% ({report.family_matches}/{report.total_cases} matches)",
        f"Tag Accuracy:              {tag_pct:.2f}% ({report.tag_matches}/{report.total_cases} matches)",
        f"Execution Time:            {report.elapsed_seconds:.4f}s",
        "",
        "--- Per-Family Accuracy Breakdown ---",
        "  Family         Total   Family Match (%)   Tag Match (%)",
        "  " + "-" * 54,
    ]

    for fam in sorted(report.per_family_stats.keys()):
        s = report.per_family_stats[fam]
        tot = int(s["total"])
        f_match = int(s["correct_family"])
        t_match = int(s["correct_tag"])
        f_pct = float(s["family_accuracy_pct"])
        t_pct = float(s["tag_accuracy_pct"])
        lines.append(
            f"  {fam:<12}   {tot:<5}   {f_match:>2}/{tot:<2} ({f_pct:>5.1f}%)      {t_match:>2}/{tot:<2} ({t_pct:>5.1f}%)"
        )

    if report.confusion_cases:
        lines.extend([
            "",
            "--- Heuristic Confusion Cases (Family Mismatch) ---",
        ])
        for idx, c in enumerate(report.confusion_cases, 1):
            lines.append(
                f"{idx}. [{c.case.case_id}] Ground Truth: {c.case.ground_truth_family.value:<10} Actual: {c.actual_family.value:<10}"
            )
            lines.append(f"   Concept: {c.case.curriculum_concept} | Context: {c.case.mission_context}")
            lines.append(f"   Reason:  {c.case.justification}")

    lines.extend([
        "=" * 80,
        f"STATUS: {status_str}",
        "=" * 80,
    ])
    return "\n".join(lines)


if __name__ == "__main__":
    report = run_error_classification_eval(live=False)
    print(format_report(report))
    sys.exit(0 if report.passed else 1)
