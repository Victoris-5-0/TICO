"""Generation Legality Evaluation Suite in CI (M5 Generation).

CSV Task:
    "Generation legality eval in CI | M5 Generation | AI teammate | P1 | Notes: (none)."

Purpose:
    Systematic, adversarial CI regression suite verifying that
    app.ai.guards.validate_manifest_and_solution strictly and consistently enforces
    the closed-manifest "legality" contract (AGENTS.md, docs/08) across deterministic
    synthetic mission drafts for the Cairo Metro world (content/worlds/cairo_metro.yaml).

Closed-Manifest Invariants Verified:
    1. Baseline legal drafts pass validation with zero violations.
    2. World ID must match the manifest.
    3. Scene ID must be declared in manifest scenes.
    4. Target concept must be supported by manifest mechanics.
    5. Parameters must strictly satisfy param_schema type, bounds, and enum options.
    6. Prop verbs and reads in starter/solution code must be declared in manifest props.
    7. Code snippets must have valid Python syntax.
    8. Reference solution code must be non-empty.
    9. Mission must declare at least one test.
    10. Reference solution must pass its own declared test assertions.
    11. Runtime exceptions during solution execution are caught and rejected.
    12. Security sandbox forbids unauthorized imports and blocked builtins (e.g. open).
    13. Dunder gadget chains are rejected via static AST without sandbox execution.
    14. Infinite loops are terminated fail-closed by execution timeout.
    15. Starter code identical to solution code is rejected as an answer leak.
    16. Full LangGraph pipeline (generate_mission) retry x2 repair loop falls back
        to a validated template fallback mission without publishing unvalidated code.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
import os
from pathlib import Path
import sys
import time
from typing import Any
from unittest.mock import MagicMock, patch

# Ensure ai-backend root is in sys.path when executed as a standalone script
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

# Ensure required environment settings exist before importing app modules
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://test:test@localhost:5432/test")
os.environ.setdefault("ENVIRONMENT", "development")

import app.ai.guards as guards
from app.ai.graphs.mission_gen import (
    MissionDraftRaw,
    TemplateFallbackValidationError,
    generate_mission,
    load_world_manifest,
)
from app.ai.guards import GuardResult, validate_manifest_and_solution
from app.schemas.missions import GeneratedMissionOut


@dataclass(frozen=True, slots=True)
class LegalityCase:
    """Deterministic synthetic mission draft specification for legality evaluation."""

    case_id: str
    category: str
    description: str
    expect_passed: bool
    draft_overrides: dict[str, Any] = field(default_factory=dict)
    expected_violation_substring: str | None = None
    verify_no_execution: bool = False


@dataclass(frozen=True, slots=True)
class CaseViolation:
    """Record of an unexpected outcome for a legality test case."""

    case_id: str
    category: str
    description: str
    failure_type: str  # STATUS_MISMATCH, MISSING_SUBSTRING, UNEXPECTED_VIOLATIONS, SANDBOX_EXECUTED_DUNDER
    message: str
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class EvalReport:
    """Structured evaluation report containing summary metrics and case violations."""

    total_cases: int
    passed_cases: int
    failed_cases: int
    elapsed_seconds: float
    violations: list[CaseViolation] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    pipeline_check_passed: bool = True
    pipeline_outcome_description: str = ""
    pipeline_attempts_observed: int = 0

    @property
    def passed(self) -> bool:
        return len(self.violations) == 0 and self.failed_cases == 0 and self.pipeline_check_passed


# ---------------------------------------------------------------------------
# Authoritative Baseline Mission Drafts
# ---------------------------------------------------------------------------

BASE_LEGAL_CONDITIONALS_DRAFT: dict[str, Any] = {
    "world_id": "cairo_metro",
    "scene_id": "platform_day",
    "target_concept_id": "conditionals",
    "brief": "افتح البوابة لما عدد الركاب يزيد عن 30.",
    "params": {
        "reading": "station.passengers",
        "threshold": 30,
        "comparison": ">",
    },
    "starter_code": "waiting = station.passengers\n# TODO: open gate when condition met",
    "solution_code": "waiting = station.passengers\nif waiting > 30:\n    gate.open()",
    "tests": [
        {
            "name": "gate opens above threshold",
            "setup": "station.passengers = 35",
            "call": "gate.state",
            "expected": "open",
        },
        {
            "name": "gate stays closed below threshold",
            "setup": "station.passengers = 25",
            "call": "gate.state",
            "expected": "closed",
        },
    ],
}


def build_legality_cases() -> list[LegalityCase]:
    """Construct the deterministic table of synthetic drafts covering all violation categories."""
    return [
        # 1. Legal baseline checks
        LegalityCase(
            case_id="LEGAL_BASELINE_CONDITIONALS",
            category="legal_baseline",
            description="Fully legal conditionals draft adhering to cairo_metro manifest",
            expect_passed=True,
            draft_overrides={},
            expected_violation_substring=None,
        ),
        LegalityCase(
            case_id="LEGAL_BASELINE_VARIABLES",
            category="legal_baseline",
            description="Fully legal variables draft (ticket_machine in ticket_hall)",
            expect_passed=True,
            draft_overrides={
                "scene_id": "ticket_hall",
                "target_concept_id": "variables",
                "brief": "حدد سعر التذكرة على الماكينة.",
                "params": {"base_price": 12},
                "starter_code": "# TODO: set ticket price\nprice = 0",
                "solution_code": "price = 12\nmachine.set_price(price)",
                "tests": [
                    {
                        "name": "price is set correctly",
                        "setup": "",
                        "call": "machine.price",
                        "expected": "12",
                    }
                ],
            },
            expected_violation_substring=None,
        ),
        # 2. World mismatch
        LegalityCase(
            case_id="WORLD_ID_MISMATCH",
            category="world_id",
            description="Draft references world_id not matching manifest",
            expect_passed=False,
            draft_overrides={"world_id": "alexandria_tram"},
            expected_violation_substring="world_id mismatch",
        ),
        # 3. Scene mismatch
        LegalityCase(
            case_id="UNKNOWN_SCENE_ID",
            category="scene_id",
            description="Draft references invented scene_id not declared in manifest",
            expect_passed=False,
            draft_overrides={"scene_id": "space_station"},
            expected_violation_substring="unknown scene_id",
        ),
        # 4. Unsupported concept
        LegalityCase(
            case_id="UNSUPPORTED_TARGET_CONCEPT",
            category="target_concept",
            description="Draft target concept not supported in manifest mechanics",
            expect_passed=False,
            draft_overrides={"target_concept_id": "recursion"},
            expected_violation_substring="not supported in manifest mechanics",
        ),
        # 5. Parameter bounds and types
        LegalityCase(
            case_id="PARAM_INT_BELOW_MIN",
            category="param_bounds",
            description="Int parameter value strictly below param_schema minimum",
            expect_passed=False,
            draft_overrides={
                "params": {"reading": "station.passengers", "threshold": 1, "comparison": ">"}
            },
            expected_violation_substring="below minimum",
        ),
        LegalityCase(
            case_id="PARAM_INT_ABOVE_MAX",
            category="param_bounds",
            description="Int parameter value strictly above param_schema maximum",
            expect_passed=False,
            draft_overrides={
                "params": {"reading": "station.passengers", "threshold": 999, "comparison": ">"}
            },
            expected_violation_substring="exceeds maximum",
        ),
        LegalityCase(
            case_id="PARAM_INT_WRONG_TYPE",
            category="param_type",
            description="Int parameter passed as string instead of int",
            expect_passed=False,
            draft_overrides={
                "params": {"reading": "station.passengers", "threshold": "thirty", "comparison": ">"}
            },
            expected_violation_substring="must be an int",
        ),
        LegalityCase(
            case_id="PARAM_ENUM_INVALID_OPTION",
            category="param_enum",
            description="Enum parameter not in allowed options list",
            expect_passed=False,
            draft_overrides={
                "params": {"reading": "station.passengers", "threshold": 30, "comparison": "!="}
            },
            expected_violation_substring="not in allowed options",
        ),
        # 6. Illegal prop verbs & reads
        LegalityCase(
            case_id="ILLEGAL_PROP_VERB_IN_SOLUTION",
            category="illegal_api",
            description="Solution calls invented prop verb not in manifest (gate.teleport)",
            expect_passed=False,
            draft_overrides={"solution_code": "gate.teleport()"},
            expected_violation_substring="illegal API call: 'gate.teleport'",
        ),
        LegalityCase(
            case_id="ILLEGAL_PROP_VERB_IN_STARTER",
            category="illegal_api",
            description="Starter calls invented prop verb not in manifest (gate.unlock)",
            expect_passed=False,
            draft_overrides={"starter_code": "gate.unlock()"},
            expected_violation_substring="illegal API call: 'gate.unlock'",
        ),
        # 7. Code syntax
        LegalityCase(
            case_id="CODE_SYNTAX_ERROR",
            category="syntax_error",
            description="Solution code contains unparseable Python syntax error",
            expect_passed=False,
            draft_overrides={"solution_code": "if waiting > 30\n gate.open()"},
            expected_violation_substring="syntax error",
        ),
        # 8. Empty solution & missing tests
        LegalityCase(
            case_id="EMPTY_SOLUTION_CODE",
            category="empty_solution",
            description="Solution code is empty",
            expect_passed=False,
            draft_overrides={"solution_code": ""},
            expected_violation_substring="solution_code is empty",
        ),
        LegalityCase(
            case_id="NO_TESTS_DEFINED",
            category="missing_tests",
            description="Mission defines no tests",
            expect_passed=False,
            draft_overrides={"tests": []},
            expected_violation_substring="mission defines no tests",
        ),
        # 9. Test failure & runtime exception
        LegalityCase(
            case_id="TEST_ASSERTION_FAILURE",
            category="test_failure",
            description="Solution code fails declared test assertion (inverted condition)",
            expect_passed=False,
            draft_overrides={
                "solution_code": "waiting = station.passengers\nif waiting < 30:\n    gate.open()"
            },
            expected_violation_substring="failed: call 'gate.state' produced",
        ),
        LegalityCase(
            case_id="SOLUTION_RUNTIME_EXCEPTION",
            category="runtime_exception",
            description="Solution code raises ZeroDivisionError during execution",
            expect_passed=False,
            draft_overrides={"solution_code": "waiting = station.passengers / 0"},
            expected_violation_substring="raised runtime exception",
        ),
        # 10. Sandbox security: unauthorized imports, blocked builtins, dunder rejection
        LegalityCase(
            case_id="UNAUTHORIZED_IMPORT",
            category="security_sandbox",
            description="Solution code attempts unauthorized module import (import os)",
            expect_passed=False,
            draft_overrides={"solution_code": "import os\ngate.open()"},
            expected_violation_substring="unauthorized import",
        ),
        LegalityCase(
            case_id="BLOCKED_BUILTIN_OPEN",
            category="security_sandbox",
            description="Solution code calls blocked builtin 'open'",
            expect_passed=False,
            draft_overrides={"solution_code": "f = open('/etc/passwd', 'r')\ngate.open()"},
            expected_violation_substring="name 'open' is not defined",
        ),
        LegalityCase(
            case_id="DUNDER_GADGET_CHAIN_REJECTION",
            category="security_sandbox",
            description="Solution code attempts gadget chain sandbox escape (rejected without executing)",
            expect_passed=False,
            draft_overrides={
                "solution_code": "classes = ().__class__.__bases__[0].__subclasses__()"
            },
            expected_violation_substring="restricted dunder identifier",
            verify_no_execution=True,
        ),
        LegalityCase(
            case_id="DUNDER_IN_STARTER_CODE",
            category="security_sandbox",
            description="Starter code references restricted dunder attribute",
            expect_passed=False,
            draft_overrides={"starter_code": "x = obj.__class__"},
            expected_violation_substring="starter_code references a restricted dunder identifier",
        ),
        LegalityCase(
            case_id="DUNDER_IN_TEST_SETUP",
            category="security_sandbox",
            description="Test setup references restricted dunder identifier (__builtins__)",
            expect_passed=False,
            draft_overrides={
                "tests": [
                    {
                        "name": "test_dunder_setup",
                        "setup": "b = __builtins__",
                        "call": "gate.state",
                        "expected": "open",
                    }
                ]
            },
            expected_violation_substring="references a restricted dunder identifier",
        ),
        # 11. Timeout: infinite loop
        LegalityCase(
            case_id="INFINITE_LOOP_TIMEOUT",
            category="timeout",
            description="Solution code infinite loop stopped by execution timeout",
            expect_passed=False,
            draft_overrides={"solution_code": "while True:\n    pass"},
            expected_violation_substring="exceeded time limit",
        ),
        # 12. Premature answer leak
        LegalityCase(
            case_id="PREMATURE_ANSWER_LEAK",
            category="answer_leak",
            description="Starter code identical to solution code",
            expect_passed=False,
            draft_overrides={
                "starter_code": "waiting = station.passengers\nif waiting > 30:\n    gate.open()",
                "solution_code": "waiting = station.passengers\nif waiting > 30:\n    gate.open()",
            },
            expected_violation_substring="starter_code is identical to solution_code (premature answer leak)",
        ),
    ]


# ---------------------------------------------------------------------------
# Full Pipeline Regression Check (Mocked Model, Repair Loop, Template Fallback)
# ---------------------------------------------------------------------------


def run_pipeline_legality_check() -> tuple[bool, str, int, list[CaseViolation]]:
    """Verify the full LangGraph generation pipeline end-to-end with a mocked model."""
    invalid_draft = MissionDraftRaw(
        scene_id="platform_day",
        brief="Bad draft with illegal verb",
        params={},
        starter_code="gate.teleport()",
        solution_code="gate.teleport()",
        tests=[],
    )

    mock_runnable = MagicMock()
    mock_runnable.invoke.side_effect = [invalid_draft, invalid_draft]
    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    violations: list[CaseViolation] = []
    outcome_desc = ""
    attempts = 0

    with patch("app.ai.graphs.mission_gen.get_model", return_value=mock_model):
        try:
            mission = generate_mission(
                world_id="cairo_metro",
                level_id="lvl_04_conditionals",
                target_concept_id="conditionals",
            )
            attempts = mock_runnable.invoke.call_count
            if not isinstance(mission, GeneratedMissionOut):
                violations.append(
                    CaseViolation(
                        case_id="FULL_PIPELINE_REPAIR_FALLBACK",
                        category="full_pipeline",
                        description="Pipeline returned object not of type GeneratedMissionOut",
                        failure_type="TYPE_MISMATCH",
                        message=f"Expected GeneratedMissionOut, got {type(mission).__name__}",
                    )
                )
            elif not mission.validated:
                violations.append(
                    CaseViolation(
                        case_id="FULL_PIPELINE_REPAIR_FALLBACK",
                        category="full_pipeline",
                        description="Pipeline published an unvalidated mission",
                        failure_type="UNVALIDATED_PUBLICATION",
                        message="GeneratedMissionOut.validated is False",
                    )
                )
            elif "fallback" not in mission.id:
                violations.append(
                    CaseViolation(
                        case_id="FULL_PIPELINE_REPAIR_FALLBACK",
                        category="full_pipeline",
                        description="Pipeline did not route to fallback after two model rejections",
                        failure_type="EXPECTED_FALLBACK_ID",
                        message=f"Mission ID '{mission.id}' did not contain 'fallback'",
                    )
                )
            outcome_desc = f"SUCCESSFUL_VALIDATED_FALLBACK (id: {mission.id}, validated: {mission.validated})"

        except TemplateFallbackValidationError as exc:
            attempts = mock_runnable.invoke.call_count
            outcome_desc = f"TEMPLATE_FALLBACK_VALIDATION_ERROR ({exc})"
        except Exception as exc:
            attempts = mock_runnable.invoke.call_count
            violations.append(
                CaseViolation(
                    case_id="FULL_PIPELINE_REPAIR_FALLBACK",
                    category="full_pipeline",
                    description="Pipeline raised unexpected exception",
                    failure_type="PIPELINE_EXCEPTION",
                    message=f"Unexpected exception: {type(exc).__name__}: {exc}",
                )
            )
            outcome_desc = f"UNEXPECTED_EXCEPTION ({type(exc).__name__}: {exc})"

    passed = len(violations) == 0 and attempts == 2
    if attempts != 2 and len(violations) == 0:
        violations.append(
            CaseViolation(
                case_id="FULL_PIPELINE_REPAIR_FALLBACK",
                category="full_pipeline",
                description="Model was not invoked exactly twice before fallback",
                failure_type="ATTEMPT_COUNT_MISMATCH",
                message=f"Expected 2 attempts, observed {attempts}",
            )
        )
        passed = False

    return passed, outcome_desc, attempts, violations


# ---------------------------------------------------------------------------
# Eval Runner & Dynamic Reporter
# ---------------------------------------------------------------------------


def run_generation_legality_eval(
    cases: list[LegalityCase] | None = None,
    include_pipeline_check: bool = True,
) -> EvalReport:
    """Execute the systematic generation legality eval suite against cairo_metro manifest."""
    start_time = time.perf_counter()
    manifest = load_world_manifest("cairo_metro")

    if cases is None:
        cases = build_legality_cases()

    categories_seen: set[str] = set()
    violations: list[CaseViolation] = []
    passed_cases = 0
    failed_cases = 0

    for case in cases:
        categories_seen.add(case.category)
        draft = copy.deepcopy(BASE_LEGAL_CONDITIONALS_DRAFT)
        draft.update(case.draft_overrides)

        case_violations: list[CaseViolation] = []

        if case.verify_no_execution:
            original_timeout = guards.execution_timeout
            timeout_entered: list[bool] = []

            def spy_timeout(*args: Any, **kwargs: Any) -> Any:
                timeout_entered.append(True)
                return original_timeout(*args, **kwargs)

            with patch("app.ai.guards.execution_timeout", side_effect=spy_timeout):
                result: GuardResult = validate_manifest_and_solution(draft, manifest)

            if timeout_entered:
                case_violations.append(
                    CaseViolation(
                        case_id=case.case_id,
                        category=case.category,
                        description=case.description,
                        failure_type="SANDBOX_EXECUTED_DUNDER",
                        message="Security failure: dunder gadget chain reached execution sandbox!",
                    )
                )
        else:
            result = validate_manifest_and_solution(draft, manifest)

        # 1. Verify boolean status match
        if result.passed != case.expect_passed:
            case_violations.append(
                CaseViolation(
                    case_id=case.case_id,
                    category=case.category,
                    description=case.description,
                    failure_type="STATUS_MISMATCH",
                    message=f"Expected passed={case.expect_passed}, got passed={result.passed}",
                    details={"actual_violations": result.violations},
                )
            )

        # 2. For legal cases, verify zero violations
        if case.expect_passed and result.violations:
            case_violations.append(
                CaseViolation(
                    case_id=case.case_id,
                    category=case.category,
                    description=case.description,
                    failure_type="UNEXPECTED_VIOLATIONS",
                    message=f"Legal draft produced unexpected violations: {result.violations}",
                    details={"actual_violations": result.violations},
                )
            )

        # 3. For illegal cases, verify expected violation substring is present
        if not case.expect_passed and case.expected_violation_substring:
            found = any(case.expected_violation_substring in v for v in result.violations)
            if not found:
                case_violations.append(
                    CaseViolation(
                        case_id=case.case_id,
                        category=case.category,
                        description=case.description,
                        failure_type="MISSING_SUBSTRING",
                        message=(
                            f"Expected substring '{case.expected_violation_substring}' "
                            f"not found in violations: {result.violations}"
                        ),
                        details={
                            "expected_substring": case.expected_violation_substring,
                            "actual_violations": result.violations,
                        },
                    )
                )

        if case_violations:
            failed_cases += 1
            violations.extend(case_violations)
        else:
            passed_cases += 1

    pipeline_passed = True
    pipeline_desc = "SKIPPED"
    attempts_observed = 0

    if include_pipeline_check:
        categories_seen.add("full_pipeline")
        (
            pipeline_passed,
            pipeline_desc,
            attempts_observed,
            pipeline_violations,
        ) = run_pipeline_legality_check()
        violations.extend(pipeline_violations)

    elapsed = time.perf_counter() - start_time

    return EvalReport(
        total_cases=len(cases),
        passed_cases=passed_cases,
        failed_cases=failed_cases,
        elapsed_seconds=elapsed,
        violations=violations,
        categories=sorted(categories_seen),
        pipeline_check_passed=pipeline_passed,
        pipeline_outcome_description=pipeline_desc,
        pipeline_attempts_observed=attempts_observed,
    )


def format_report(report: EvalReport) -> str:
    """Format evaluation results into a human-readable report.

    Per-category statuses [PASS] / [FAIL] and violation counts are computed
    dynamically from actual violation records. Text is never hardcoded.
    """
    status_str = "PASSED" if report.passed else "FAILED"
    pass_pct = (
        (report.passed_cases / report.total_cases * 100.0)
        if report.total_cases > 0
        else 0.0
    )

    # Group violations by category
    violations_by_cat: dict[str, list[CaseViolation]] = {}
    for v in report.violations:
        violations_by_cat.setdefault(v.category, []).append(v)

    category_labels: list[tuple[str, str]] = [
        ("legal_baseline", "Baseline legal mission drafts pass validation with zero violations"),
        ("world_id", "World ID must strictly match manifest world id"),
        ("scene_id", "Scene ID must exist in declared manifest scenes"),
        ("target_concept", "Target concept must be supported in manifest mechanics"),
        ("param_bounds", "Int parameters must stay within min/max bounds"),
        ("param_type", "Parameters must match declared data types"),
        ("param_enum", "Enum parameters must be selected from declared options"),
        ("illegal_api", "Prop calls in starter/solution code must be declared in manifest props"),
        ("syntax_error", "Starter and solution code must be syntactically valid Python"),
        ("empty_solution", "Solution code cannot be empty or whitespace"),
        ("missing_tests", "Mission must declare at least one test assertion"),
        ("test_failure", "Reference solution must pass its own declared test checks"),
        ("runtime_exception", "Runtime exceptions during execution are caught and rejected"),
        ("security_sandbox", "Safe builtins enforced; imports, open, and dunder chains rejected without execution"),
        ("timeout", "Infinite loops are terminated fail-closed by execution timeout"),
        ("answer_leak", "Starter code matching solution code is rejected as premature leak"),
        ("full_pipeline", "Full generation pipeline retry x2 repair loop and validated fallback guarantee"),
    ]

    lines = [
        "=" * 80,
        "             TICO GENERATION LEGALITY EVALUATION REPORT (CI GATE)              ",
        "=" * 80,
        f"Overall Evaluation Status:          {status_str}",
        f"Total Synthetic Cases Evaluated:   {report.total_cases}",
        f"Cases Passing Legality Contract:   {report.passed_cases}",
        f"Cases with Contract Violations:    {report.failed_cases}",
        f"Total Contract Violations:         {len(report.violations)}",
        f"Legality Pass Rate:                {pass_pct:.2f}%",
        f"Evaluation Execution Time:         {report.elapsed_seconds:.4f}s",
        "",
        "--- Closed-Manifest Contract Invariant Verification ---",
    ]

    for cat_key, label in category_labels:
        cat_viols = violations_by_cat.get(cat_key, [])
        cat_status = "PASS" if len(cat_viols) == 0 else "FAIL"
        lines.append(f"[{cat_status}] ({cat_key}) {label} ({len(cat_viols)} violation(s))")

    lines.extend([
        "",
        "--- Full Pipeline Repair Loop & Fallback Telemetry ---",
        f"Pipeline Legality Check:           {'PASSED' if report.pipeline_check_passed else 'FAILED'}",
        f"Pipeline Outcome:                  {report.pipeline_outcome_description}",
        f"Model Repair Attempts Observed:    {report.pipeline_attempts_observed}",
    ])

    if report.violations:
        lines.extend(["", "--- Violations Detected ---"])
        for idx, v in enumerate(report.violations[:10], 1):
            lines.append(f"{idx}. [{v.category.upper()}] Case '{v.case_id}': {v.message}")
            lines.append(f"   Description: {v.description}")
        if len(report.violations) > 10:
            lines.append(f"... and {len(report.violations) - 10} additional violations.")

    lines.extend([
        "=" * 80,
        f"STATUS: {status_str}",
        "=" * 80,
    ])
    return "\n".join(lines)


if __name__ == "__main__":
    report = run_generation_legality_eval()
    print(format_report(report))
    sys.exit(0 if report.passed else 1)
