"""Pytest test discovery runner for composer evaluation suite and report formatting."""

from evals.composer_eval import (
    EvalReport,
    InvariantViolation,
    SyntheticProfile,
    format_report,
    run_composer_eval,
)
from app.schemas.common import SkillBand


def test_composer_eval_suite():
    """Verify all global composer invariants hold across the entire synthetic profile sweep."""
    report = run_composer_eval()
    assert report.passed, (
        f"Composer evaluation failed with {len(report.violations)} violations. "
        f"First violations: {report.violations[:3]}"
    )
    assert report.total_cases == 2112
    assert report.passed_cases == 2112
    assert report.failed_cases == 0
    assert len(report.violations) == 0


def test_format_report_dynamic_pass_fail_on_injected_violations():
    """Verify format_report computes [PASS]/[FAIL] dynamically based on actual violations."""
    dummy_profile = SyntheticProfile(
        target_concept_mastery=0.2,
        skill_band=SkillBand.STRUGGLING,
        carried_scenario_name="single_weak",
        carried_concept_ids=["variables"],
        carried_concept_masteries={"variables": 0.1},
        prior_attempts=0,
        is_arena=False,
    )

    # Injected violation for invariant (a) only
    violation_a = InvariantViolation(
        invariant_id="INVARIANT_A_WEAK_CARRIED_FULL_SCAFFOLD",
        description="Concept 'variables' with weak mastery 0.1 received FULL scaffolding.",
        profile=dummy_profile,
    )

    failing_report = EvalReport(
        total_cases=10,
        passed_cases=9,
        failed_cases=1,
        elapsed_seconds=0.05,
        violations=[violation_a],
        arena_cases=2,
        non_arena_cases=8,
    )

    assert failing_report.passed is False
    formatted_fail = format_report(failing_report)

    # Invariant (a) must show [FAIL] and (1 violation(s))
    assert "[FAIL] (a) No weak concept (< 0.4) assigned FULL scaffold (1 violation(s))" in formatted_fail

    # Invariants (b) through (e) must show [PASS] and (0 violation(s))
    assert "[PASS] (b) Difficulty band strictly bounded in [1, 10] (0 violation(s)" in formatted_fail
    assert "[PASS] (c) Repetition number monotonically valid >= 1 (0 violation(s)" in formatted_fail
    assert "[PASS] (d) Arena mode scaffolding strictly NONE across all carried concepts (0 violation(s)" in formatted_fail
    assert "[PASS] (e) Advance/Hold gate confidence strictly bounded in [0.0, 1.0] (0 violation(s)" in formatted_fail

    # Overall statuses must reflect failure
    assert "Overall Invariant Evaluation Status: FAILED" in formatted_fail
    assert "STATUS: FAILED" in formatted_fail
    assert "--- Violations Detected ---" in formatted_fail

    # Clean passing report verification
    passing_report = EvalReport(
        total_cases=10,
        passed_cases=10,
        failed_cases=0,
        elapsed_seconds=0.05,
        violations=[],
        arena_cases=2,
        non_arena_cases=8,
    )
    assert passing_report.passed is True
    formatted_pass = format_report(passing_report)
    assert "[PASS] (a) No weak concept (< 0.4) assigned FULL scaffold (0 violation(s))" in formatted_pass
    assert "Overall Invariant Evaluation Status: PASSED" in formatted_pass
    assert "STATUS: PASSED" in formatted_pass
    assert "--- Violations Detected ---" not in formatted_pass
