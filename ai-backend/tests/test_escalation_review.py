"""Unit tests for escalation review chain (app.ai.chains.escalation_review)."""

import logging
from unittest.mock import MagicMock, patch
import pytest

from app.ai.chains.escalation_review import (
    ComposerReviewStructuredOutput,
    PlannerSkipStructuredOutput,
    review_composer_decision,
    review_planner_skip,
)
from app.ai.router import AICapability
from app.rules.composer import AdvanceOrHoldDecision, advance_or_hold
from app.schemas.common import DecidedBy, SkillBand


def test_clear_cut_composer_decision_never_calls_model():
    """Clear-cut rule decision (has_conflict=False) must return directly without calling LLM."""
    clean_decision = advance_or_hold(
        target_mastery=0.90,
        hints_used=0,
        attempt_number=1,
    )
    assert clean_decision.has_conflict is False

    with patch("app.ai.chains.escalation_review.get_model") as mock_get_model:
        result = review_composer_decision(
            rule_decision=clean_decision,
            target_concept_id="variables",
            target_mastery=0.90,
            hints_used=0,
            attempt_number=1,
        )

        mock_get_model.assert_not_called()
        assert result == clean_decision
        assert result.decided_by == DecidedBy.RULE
        assert result.has_conflict is False


def test_composer_conflict_model_review_confirms_advance():
    """Conflicting decision: model reviews profile and confirms advance with reasoned explanation."""
    conflict_decision = advance_or_hold(
        target_mastery=0.80,
        hints_used=3,  # Heavy hints triggers conflict
        attempt_number=1,
    )
    assert conflict_decision.has_conflict is True

    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = ComposerReviewStructuredOutput(
        advance=True,
        reason="Student solved the problem and code shows understanding despite hint usage.",
        confidence=0.85,
        overrode_rule=False,
    )

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.escalation_review.get_model", return_value=mock_model) as mock_get_model:
        result = review_composer_decision(
            rule_decision=conflict_decision,
            target_concept_id="conditionals",
            target_mastery=0.80,
            hints_used=3,
            attempt_number=1,
            skill_band=SkillBand.ON_LEVEL,
            hint_dependency=0.6,
        )

        mock_get_model.assert_called_once_with(AICapability.REVIEW)
        assert result.advanced is True
        assert result.decided_by == DecidedBy.MODEL
        assert result.confidence == 0.85
        assert result.has_conflict is False
        assert "[Model Review - CONFIRMED RULE]" in result.reason
        assert "Student solved the problem" in result.reason


def test_composer_conflict_model_review_overrides_to_hold():
    """Conflicting decision: model overrides rule's proposed advance and holds student."""
    conflict_decision = advance_or_hold(
        target_mastery=0.80,
        hints_used=3,
        attempt_number=1,
    )
    assert conflict_decision.advanced is True  # Rule initially proposed advance
    assert conflict_decision.has_conflict is True

    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = ComposerReviewStructuredOutput(
        advance=False,  # Overridden to hold!
        reason="Heavy reliance on all hints indicates rote completion; hold for unassisted rep.",
        confidence=0.89,
        overrode_rule=True,
    )

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.escalation_review.get_model", return_value=mock_model):
        result = review_composer_decision(
            rule_decision=conflict_decision,
            target_concept_id="conditionals",
            target_mastery=0.80,
            hints_used=3,
            attempt_number=1,
        )

        assert result.advanced is False  # Successfully overridden to hold
        assert result.decided_by == DecidedBy.MODEL
        assert result.confidence == 0.89
        assert result.has_conflict is False
        assert "[Model Review - OVERRODE RULE]" in result.reason
        assert "Heavy reliance" in result.reason


def test_composer_conflict_model_failure_graceful_fallback():
    """When review model fails (network error / rate limit), retains rule decision with fallback tag."""
    conflict_decision = advance_or_hold(
        target_mastery=0.80,
        hints_used=3,
        attempt_number=1,
    )

    with patch("app.ai.chains.escalation_review.get_model", side_effect=RuntimeError("Gemini unavailable")):
        result = review_composer_decision(
            rule_decision=conflict_decision,
            target_concept_id="conditionals",
            target_mastery=0.80,
            hints_used=3,
            attempt_number=1,
        )

        assert result.advanced == conflict_decision.advanced
        assert result.decided_by == DecidedBy.RULE
        assert "Review model offline" in result.reason


def test_planner_skip_non_skippable_lesson():
    """Lessons marked is_skippable=False must NEVER be skipped; model is not called."""
    with patch("app.ai.chains.escalation_review.get_model") as mock_get_model:
        res = review_planner_skip(
            level_id="lvl_01_intro",
            concept_id="variables",
            diagnostic_score=0.95,
            is_skippable=False,
        )
        mock_get_model.assert_not_called()
        assert res.allow_skip is False
        assert "non-skippable" in res.reason


def test_planner_skip_review_model_call():
    """Skippable lesson: model is invoked and structured output parsed."""
    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = PlannerSkipStructuredOutput(
        allow_skip=True,
        reason="Student scored 100% on the diagnostic for this concept.",
        confidence=0.92,
    )
    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.escalation_review.get_model", return_value=mock_model):
        res = review_planner_skip(
            level_id="lvl_04_conditionals",
            concept_id="conditionals",
            diagnostic_score=0.90,
            is_skippable=True,
        )
        assert res.allow_skip is True
        assert res.confidence == 0.92
        assert "diagnostic" in res.reason


def test_composer_conflict_model_inconsistent_override_self_report(caplog):
    """When model claims overrode_rule=True but decision matches rule, warn and use computed truth."""
    conflict_decision = advance_or_hold(
        target_mastery=0.80,
        hints_used=3,
        attempt_number=1,
    )
    assert conflict_decision.advanced is True

    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = ComposerReviewStructuredOutput(
        advance=True,  # Matches rule proposal!
        reason="Student demonstrated mastery despite hints.",
        confidence=0.88,
        overrode_rule=True,  # Inconsistent false claim of override
    )

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.escalation_review.get_model", return_value=mock_model):
        with caplog.at_level(logging.WARNING):
            result = review_composer_decision(
                rule_decision=conflict_decision,
                target_concept_id="conditionals",
                target_mastery=0.80,
                hints_used=3,
                attempt_number=1,
            )

        assert (
            "Model claimed overrode_rule=True but actual decision comparison shows False — using actual computed value"
            in caplog.text
        )
        assert result.advanced is True
        assert "[Model Review - CONFIRMED RULE]" in result.reason
        assert "[Model Review - OVERRODE RULE]" not in result.reason


def test_composer_conflict_model_consistent_override_no_warning(caplog):
    """When model overrode_rule claim matches computed actual override, log no warning and record OVERRODE RULE."""
    # Case 2 in advance_or_hold: moderate mastery clean pass -> rule proposes HOLD (advanced=False)
    conflict_decision = advance_or_hold(
        target_mastery=0.60,
        hints_used=0,
        attempt_number=1,
    )
    assert conflict_decision.advanced is False
    assert conflict_decision.has_conflict is True

    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = ComposerReviewStructuredOutput(
        advance=True,  # Reverses rule from HOLD to ADVANCE!
        reason="Student solved cleanly on attempt 1 without hints; ready to stretch.",
        confidence=0.90,
        overrode_rule=True,  # Consistent claim
    )

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.escalation_review.get_model", return_value=mock_model):
        with caplog.at_level(logging.WARNING):
            result = review_composer_decision(
                rule_decision=conflict_decision,
                target_concept_id="variables",
                target_mastery=0.60,
                hints_used=0,
                attempt_number=1,
            )

        assert "Model claimed overrode_rule" not in caplog.text
        assert result.advanced is True
        assert "[Model Review - OVERRODE RULE]" in result.reason

