"""Pytest runner and verification suite for generation legality eval."""

from app.ai.graphs.mission_gen import load_world_manifest
import app.ai.guards as guards
from app.ai.guards import validate_manifest_and_solution
from evals.generation_legality_eval import (
    BASE_LEGAL_CONDITIONALS_DRAFT,
    CaseViolation,
    EvalReport,
    format_report,
    run_generation_legality_eval,
)


def test_generation_legality_eval_suite():
    """Verify all generation legality invariants hold across all synthetic cases and pipeline."""
    report = run_generation_legality_eval()
    assert report.passed is True, (
        f"Generation legality eval failed with {len(report.violations)} violations. "
        f"First violations: {report.violations[:3]}"
    )
    assert report.total_cases == 23
    assert report.passed_cases == 23
    assert report.failed_cases == 0
    assert len(report.violations) == 0
    assert report.pipeline_check_passed is True
    assert report.pipeline_attempts_observed == 2
    assert "SUCCESSFUL_VALIDATED_FALLBACK" in report.pipeline_outcome_description


def test_format_report_dynamic_pass_fail_on_injected_violations():
    """Verify format_report computes [PASS]/[FAIL] dynamically based on actual violations."""
    injected_violation = CaseViolation(
        case_id="ILLEGAL_PROP_VERB_IN_SOLUTION",
        category="illegal_api",
        description="Simulated regression letting gate.teleport through",
        failure_type="STATUS_MISMATCH",
        message="Expected passed=False, got passed=True",
    )

    failing_report = EvalReport(
        total_cases=23,
        passed_cases=22,
        failed_cases=1,
        elapsed_seconds=0.15,
        violations=[injected_violation],
        categories=["illegal_api", "legal_baseline"],
        pipeline_check_passed=True,
        pipeline_outcome_description="SUCCESSFUL_VALIDATED_FALLBACK",
        pipeline_attempts_observed=2,
    )

    assert failing_report.passed is False
    formatted_fail = format_report(failing_report)

    # Injected category must show [FAIL] and (1 violation(s))
    assert "[FAIL] (illegal_api) Prop calls in starter/solution code must be declared in manifest props (1 violation(s))" in formatted_fail

    # Clean categories must show [PASS] and (0 violation(s))
    assert "[PASS] (legal_baseline) Baseline legal mission drafts pass validation with zero violations (0 violation(s))" in formatted_fail
    assert "[PASS] (world_id) World ID must strictly match manifest world id (0 violation(s))" in formatted_fail
    assert "[PASS] (security_sandbox) Safe builtins enforced; imports, open, and dunder chains rejected without execution (0 violation(s))" in formatted_fail
    assert "[PASS] (full_pipeline) Full generation pipeline retry x2 repair loop and validated fallback guarantee (0 violation(s))" in formatted_fail

    # Overall statuses must reflect failure
    assert "Overall Evaluation Status:          FAILED" in formatted_fail
    assert "STATUS: FAILED" in formatted_fail
    assert "--- Violations Detected ---" in formatted_fail

    # Clean passing report verification
    passing_report = EvalReport(
        total_cases=23,
        passed_cases=23,
        failed_cases=0,
        elapsed_seconds=0.15,
        violations=[],
        categories=["illegal_api", "legal_baseline"],
        pipeline_check_passed=True,
        pipeline_outcome_description="SUCCESSFUL_VALIDATED_FALLBACK",
        pipeline_attempts_observed=2,
    )
    assert passing_report.passed is True
    formatted_pass = format_report(passing_report)
    assert "[PASS] (illegal_api) Prop calls in starter/solution code must be declared in manifest props (0 violation(s))" in formatted_pass
    assert "Overall Evaluation Status:          PASSED" in formatted_pass
    assert "STATUS: PASSED" in formatted_pass
    assert "--- Violations Detected ---" not in formatted_pass


def test_dunder_gadget_chain_rejected_without_execution_spy(monkeypatch):
    """Verify dunder gadget chains are blocked before reaching the sandbox timeout or exec."""
    manifest = load_world_manifest("cairo_metro")
    exploit_draft = dict(
        BASE_LEGAL_CONDITIONALS_DRAFT,
        solution_code="classes = ().__class__.__bases__[0].__subclasses__()",
    )

    original_timeout = guards.execution_timeout
    timeout_entered = []

    def spy_timeout(*args, **kwargs):
        timeout_entered.append(True)
        return original_timeout(*args, **kwargs)

    monkeypatch.setattr(guards, "execution_timeout", spy_timeout)

    result = validate_manifest_and_solution(exploit_draft, manifest)
    assert result.passed is False
    assert any("restricted dunder identifier" in v for v in result.violations)
    assert len(timeout_entered) == 0, "Security failure: exec/eval timeout entered for dunder exploit!"
