"""Pytest verification suite for error classification accuracy eval."""

from unittest.mock import patch
import pytest

from app.ai.prompts.error_analysis import normalize_tag
from app.schemas.common import ErrorFamily
from evals.error_classification_accuracy_eval import (
    ClassificationCase,
    EvalReport,
    MINIMUM_FAMILY_ACCURACY_THRESHOLD,
    format_report,
    get_hand_labelled_cases,
    run_error_classification_eval,
)


def test_error_classification_accuracy_eval_suite():
    """Verify deterministic fallback accuracy satisfies CI gate across 30 hand-labelled cases."""
    report = run_error_classification_eval(live=False)

    assert report.total_cases == 30
    assert report.passed is True, (
        f"Accuracy eval failed threshold {report.threshold:.2f}: "
        f"got family_accuracy={report.family_accuracy:.2f}"
    )
    assert report.family_accuracy >= MINIMUM_FAMILY_ACCURACY_THRESHOLD
    assert "DETERMINISTIC_FALLBACK" in report.mode

    # Verify distribution covers all 7 ErrorFamily values
    families_represented = {c.ground_truth_family for c in get_hand_labelled_cases()}
    assert families_represented == set(ErrorFamily)


def test_format_report_dynamic_pass_fail_on_injected_failure():
    """Verify format_report computes PASSED/FAILED dynamically from real accuracy metrics."""
    failing_report = EvalReport(
        total_cases=30,
        family_matches=15,
        tag_matches=10,
        family_accuracy=0.50,
        tag_accuracy=0.333,
        elapsed_seconds=0.05,
        mode="DETERMINISTIC_FALLBACK (CI-safe, offline heuristic)",
        threshold=0.80,
        results=[],
        per_family_stats={
            "syntax": {"total": 5, "correct_family": 5, "correct_tag": 4, "family_accuracy_pct": 100.0, "tag_accuracy_pct": 80.0},
            "logic": {"total": 6, "correct_family": 1, "correct_tag": 1, "family_accuracy_pct": 16.7, "tag_accuracy_pct": 16.7},
        },
        confusion_cases=[],
        tag_mismatch_cases=[],
    )

    assert failing_report.passed is False
    formatted_fail = format_report(failing_report)
    assert "Overall Evaluation Status: FAILED" in formatted_fail
    assert "STATUS: FAILED" in formatted_fail

    passing_report = EvalReport(
        total_cases=30,
        family_matches=27,
        tag_matches=20,
        family_accuracy=0.90,
        tag_accuracy=0.667,
        elapsed_seconds=0.05,
        mode="DETERMINISTIC_FALLBACK (CI-safe, offline heuristic)",
        threshold=0.80,
        results=[],
        per_family_stats={},
        confusion_cases=[],
        tag_mismatch_cases=[],
    )

    assert passing_report.passed is True
    formatted_pass = format_report(passing_report)
    assert "Overall Evaluation Status: PASSED" in formatted_pass
    assert "STATUS: PASSED" in formatted_pass


def test_hand_labelled_cases_dataset_invariants():
    """Verify structural validity and dataset integrity of the 30 hand-labelled cases."""
    cases = get_hand_labelled_cases()
    assert len(cases) == 30

    case_ids = [c.case_id for c in cases]
    assert len(case_ids) == len(set(case_ids)), "Duplicate case_id found in dataset"

    for c in cases:
        assert isinstance(c.ground_truth_family, ErrorFamily)
        assert c.ground_truth_tag != ""
        assert normalize_tag(c.ground_truth_tag) != "unknown_error" or c.ground_truth_family == ErrorFamily.UNKNOWN
        assert len(c.justification) > 10, f"Case {c.case_id} lacks detailed justification"


def test_ci_eval_never_invokes_llm_model():
    """Verify default evaluation run makes zero LLM model router or provider calls."""
    with patch("app.ai.router.get_model") as mock_router:
        report = run_error_classification_eval(live=False)
        assert report.total_cases == 30
        mock_router.assert_not_called()
