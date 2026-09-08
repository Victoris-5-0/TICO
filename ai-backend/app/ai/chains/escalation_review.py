"""Escalation review chain (M4 — P0).

Invokes gemini-3.5-flash to review:
  1. Conflicting composer advance/hold decisions
  2. Proposed path planner lesson skips (generic interface; full wiring blocked on rules/plan.py)

Hard rules (AGENTS.md):
  - "Rules propose, the model reviews"
  - Clear-cut cases NEVER reach a model (handled in pure Python by rules/).
  - Always record `decided_by` (RULE vs MODEL) and `reason` so any decision can be explained.
  - Mastery numbers are NEVER model-produced; the model only decides advance/hold or confirm/override skip.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.ai.prompts.escalation_review import (
    COMPOSER_REVIEW_SYSTEM_PROMPT,
    ESCALATION_REVIEW_PROMPT_VERSION,
    PLANNER_SKIP_SYSTEM_PROMPT,
)
from app.ai.router import AICapability, get_model
from app.rules.composer import AdvanceOrHoldDecision
from app.schemas.common import DecidedBy, SkillBand

logger = logging.getLogger(__name__)


class ComposerReviewStructuredOutput(BaseModel):
    """Structured review decision from gemini-3.5-flash."""

    advance: bool = Field(
        description="True to advance student past gate, False to hold for another rep"
    )
    reason: str = Field(
        description="2-3 sentence pedagogical justification explaining the decision"
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Reviewer confidence in this recommendation"
    )
    overrode_rule: bool = Field(
        description="True if the model reversed the rule's initial advance recommendation"
    )


class PlannerSkipStructuredOutput(BaseModel):
    """Structured skip review decision from gemini-3.5-flash."""

    allow_skip: bool = Field(
        description="True if student should be allowed to skip the lesson, False if required"
    )
    reason: str = Field(
        description="Explanation of why skipping this lesson is or is not pedagogically safe"
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence in this decision"
    )


def review_composer_decision(
    *,
    rule_decision: AdvanceOrHoldDecision,
    target_concept_id: str,
    target_mastery: float,
    hints_used: int,
    attempt_number: int,
    skill_band: SkillBand | str = SkillBand.ON_LEVEL,
    hint_dependency: float | None = None,
    syntax_vs_logic: float | None = None,
    carried_masteries: dict[str, float] | None = None,
) -> AdvanceOrHoldDecision:
    """Review a conflicting composer advance-or-hold decision using gemini-3.5-flash.

    Clear-cut rule decisions (has_conflict=False) are returned directly without calling
    the model. When evidence conflicts, the model reviews the entire student profile
    and confirms or overrides the rule with a logged reason and decided_by=MODEL.

    Args:
        rule_decision: The pure-Python decision from app.rules.composer.advance_or_hold.
        target_concept_id: Primary concept identifier tested at the gate.
        target_mastery: Float mastery score (0.0..1.0) on the target concept.
        hints_used: Monotonic count of hints used in the session (0..4).
        attempt_number: Monotonic count of attempts on this mission.
        skill_band: Coarse skill band classification (STRUGGLING, ON_LEVEL, READY_TO_STRETCH).
        hint_dependency: Optional historical ratio of hints per session.
        syntax_vs_logic: Optional historical ratio of syntax vs logic errors.
        carried_masteries: Optional mapping of carried concepts to mastery scores.

    Returns:
        AdvanceOrHoldDecision with decided_by=MODEL (or RULE on fallback), resolved
        has_conflict=False, and human-readable explanation reason.
    """
    # 1. Clear-cut cases NEVER reach a model
    if not rule_decision.has_conflict:
        return rule_decision

    logger.info(
        "Composer decision has conflict (%s). Invoking gemini-3.5-flash escalation review.",
        rule_decision.conflict_type,
    )

    # 2. Build profile evidence prompt (PII safe: no names, emails, or user IDs)
    band_str = skill_band.value if isinstance(skill_band, SkillBand) else str(skill_band)

    evidence_lines = [
        "STUDENT PROFILE & EVIDENCE CONTEXT:",
        f"- Target Concept: {target_concept_id}",
        f"- Current Target Mastery: {target_mastery:.2f}",
        f"- Skill Band: {band_str}",
        f"- Hints Used This Session: {hints_used} (out of 4 max)",
        f"- Attempts on This Mission: {attempt_number}",
        f"- Rule Initial Proposal: {'ADVANCE' if rule_decision.advanced else 'HOLD'}",
        f"- Rule Conflict Flag: {rule_decision.conflict_type}",
        f"- Rule Notes: {rule_decision.reason}",
    ]

    if hint_dependency is not None:
        evidence_lines.append(f"- Historical Hint Dependency: {hint_dependency:.2f}")
    if syntax_vs_logic is not None:
        evidence_lines.append(f"- Syntax vs Logic Error Ratio: {syntax_vs_logic:.2f}")
    if carried_masteries:
        carried_str = ", ".join(f"{c}: {m:.2f}" for c, m in carried_masteries.items())
        evidence_lines.append(f"- Carried Concept Masteries: {carried_str}")

    evidence_lines.append(
        "\nBased on this evidence, should this learner advance to the next lesson or hold for another practice rep? "
        "Provide your pedagogical reasoning."
    )

    user_prompt = "\n".join(evidence_lines)
    messages = [
        SystemMessage(content=COMPOSER_REVIEW_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]

    # 3. Model call with structured output
    try:
        model = get_model(AICapability.REVIEW)
        runnable = model.with_structured_output(ComposerReviewStructuredOutput)
        result: Any = runnable.invoke(messages)

        if isinstance(result, ComposerReviewStructuredOutput):
            review_out = result
        elif isinstance(result, dict):
            review_out = ComposerReviewStructuredOutput(**result)
        else:
            raise ValueError(f"Unexpected output type from review model: {type(result)}")

        actual_override = review_out.advance != rule_decision.advanced
        if review_out.overrode_rule != actual_override:
            logger.warning(
                "Model claimed overrode_rule=%s but actual decision comparison shows %s — using actual computed value",
                review_out.overrode_rule,
                actual_override,
            )

        # TODO (M0/M2 - queries/ai_interaction.py): Once the database queries layer is ready,
        # log every model call to the `ai_interaction` table:
        # capability="review", model=AICapability.REVIEW (gemini-3.5-flash), tokens, cost, latency_ms,
        # prompt_version=ESCALATION_REVIEW_PROMPT_VERSION, session/student identifiers as applicable,
        # decided_by=DecidedBy.MODEL, conflict_type=rule_decision.conflict_type, and override outcome (actual_override).

        return AdvanceOrHoldDecision(
            advanced=review_out.advance,
            decided_by=DecidedBy.MODEL,
            confidence=review_out.confidence,
            has_conflict=False,  # Conflict resolved by supervisor review
            reason=f"[Model Review{' - OVERRODE RULE' if actual_override else ' - CONFIRMED RULE'}]: {review_out.reason}",
            conflict_type=rule_decision.conflict_type,
        )

    except Exception as exc:
        logger.warning(
            "Escalation review model call failed: %s. Retaining rule proposal with fallback tag.",
            exc,
        )
        return AdvanceOrHoldDecision(
            advanced=rule_decision.advanced,
            decided_by=DecidedBy.RULE,
            confidence=rule_decision.confidence,
            has_conflict=True,
            reason=f"{rule_decision.reason} (Review model offline; rule proposal retained)",
            conflict_type=rule_decision.conflict_type,
        )


def review_planner_skip(
    *,
    level_id: str,
    concept_id: str,
    diagnostic_score: float,
    is_skippable: bool = True,
    prior_mastery: float | None = None,
) -> PlannerSkipStructuredOutput:
    """Generic interface for reviewing path planner lesson skips.

    NOTE ON ARCHITECTURAL STATUS:
        Per project instructions, rules/plan.py is currently blocked and owned by
        another lane. This review function provides the generic model contract
        against gemini-3.5-flash so that once rules/plan.py is unblocked, it can
        immediately plug into this escalation chain without schema changes.

    Args:
        level_id: The lesson being evaluated for skipping.
        concept_id: Primary concept taught in the lesson.
        diagnostic_score: Score on the diagnostic playthrough (0.0..1.0).
        is_skippable: Curriculum gate flag (if False, skipping is strictly forbidden).
        prior_mastery: Optional current mastery score on the concept.

    Returns:
        PlannerSkipStructuredOutput with allow_skip boolean and justification reason.
    """
    if not is_skippable:
        return PlannerSkipStructuredOutput(
            allow_skip=False,
            reason=f"Lesson {level_id} is marked non-skippable (is_skippable=False) by curriculum rules.",
            confidence=1.0,
        )

    user_prompt = (
        f"Lesson ID: {level_id}\n"
        f"Concept: {concept_id}\n"
        f"Diagnostic Score: {diagnostic_score:.2f}\n"
        f"Prior Concept Mastery: {f'{prior_mastery:.2f}' if prior_mastery is not None else 'None'}\n"
        f"The rule proposed marking this lesson optional. Do you recommend allowing this skip?"
    )
    messages = [
        SystemMessage(content=PLANNER_SKIP_SYSTEM_PROMPT),
        HumanMessage(content=user_prompt),
    ]

    try:
        model = get_model(AICapability.REVIEW)
        runnable = model.with_structured_output(PlannerSkipStructuredOutput)
        result: Any = runnable.invoke(messages)
        if isinstance(result, PlannerSkipStructuredOutput):
            skip_out = result
        elif isinstance(result, dict):
            skip_out = PlannerSkipStructuredOutput(**result)
        else:
            raise ValueError(f"Unexpected output type: {type(result)}")

        # TODO (M0/M2 - queries/ai_interaction.py): Once the database queries layer is ready,
        # log every model call to the `ai_interaction` table:
        # capability="review", model=AICapability.REVIEW (gemini-3.5-flash), tokens, cost, latency_ms,
        # prompt_version=ESCALATION_REVIEW_PROMPT_VERSION, session/student identifiers as applicable,
        # decided_by=DecidedBy.MODEL, and skip outcome (allow_skip).

        return skip_out
    except Exception as exc:
        logger.warning("Planner skip review model call failed: %s. Defaulting to safe hold.", exc)
        return PlannerSkipStructuredOutput(
            allow_skip=False,
            reason=f"Review model offline ({exc}). Defaulting to requiring the lesson for safety.",
            confidence=0.5,
        )
