"""Which lessons a student has to do, and which they may skip.

Pure: no database, no model, no I/O. The planner **proposes**; a model reviews only the
skips, and only when the rule is unsure. Clear-cut cases never reach a model.

## The order never changes. Membership does.

This is the rule the whole design rests on. Concepts are taught in a fixed sequence
because the sequence is the curriculum — variables before conditionals before loops, and
no diagnostic result rearranges that. What a diagnostic can do is mark a lesson OPTIONAL,
so a student who already knows variables is not made to sit through three lessons proving
it.

## A skip is a suggestion, never a lock-out

An OPTIONAL lesson stays in the path, in order, and stays playable. A student who skips
loops and then struggles with nested loops can go back, and nothing has to be unlocked.
That is why `requirement` is a label on the row rather than the row's absence: a deleted
lesson cannot be reconsidered, and this decision is made from one diagnostic playthrough,
which is thin evidence.

## Why skipping needs a model at all

The rule can see one number — how the student did on the diagnostic for this concept.
It cannot see that a student who aced conditionals also produced three syntax errors
doing it, or that the concept they are about to skip is the one every later lesson
carries. When the evidence is thin or contradictory the rule says so, and
`chains/escalation_review.review_planner_skip` looks at the whole profile.

Getting this wrong is asymmetric, which is why the thresholds are conservative: a
needless lesson costs a student ten minutes of boredom, and a wrongly skipped one leaves
a hole they hit six lessons later with no idea why.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.models_tables.enums import DecidedBy, LessonRequirement

#: Diagnostic score at or above which a lesson is a *candidate* for skipping. Higher than
#: the mastery gate (0.7) on purpose: passing a gate means "ready to move on having done
#: the work", and this means "did not need to do the work at all".
SKIP_CANDIDATE_THRESHOLD: Final[float] = 0.85

#: Below this, the rule is confident the lesson is needed and no model is consulted.
CLEARLY_REQUIRED_THRESHOLD: Final[float] = 0.60

#: A skip proposed with less confidence than this goes to the model.
ESCALATION_CONFIDENCE: Final[float] = 0.60

#: However well a student does, the first lessons of the roadmap are never skipped. They
#: carry the tooling and the world, not just the concept — a student who skips them has
#: never opened the editor, and every later lesson assumes they have.
NEVER_SKIPPABLE_ORDER: Final[int] = 2


@dataclass(frozen=True, slots=True)
class LessonDecision:
    """One row of the plan, before any model has looked at it."""

    level_id: str
    requirement: LessonRequirement
    decided_by: DecidedBy
    confidence: float
    reason: str | None
    #: True when the rule wants a second opinion before this skip is applied.
    needs_review: bool = False
    #: Carried through to the reviewer so it does not have to be looked up again.
    concept_id: str | None = None
    diagnostic_score: float | None = None


@dataclass(frozen=True, slots=True)
class LessonInput:
    """What the planner needs to know about one lesson, in curriculum order."""

    level_id: str
    concept_id: str
    order: int


def plan_for_beginner(lessons: list[LessonInput]) -> list[LessonDecision]:
    """Everything required, no diagnostic, no model call.

    A student who says they are new is taken at their word. There is nothing to weigh, so
    consulting a model here would spend money and latency to produce the answer the rule
    already has — and would occasionally produce a different one.
    """
    return [
        LessonDecision(
            level_id=lesson.level_id,
            requirement=LessonRequirement.REQUIRED,
            decided_by=DecidedBy.RULE,
            confidence=1.0,
            reason=None,
            concept_id=lesson.concept_id,
        )
        for lesson in lessons
    ]


def plan_from_diagnostic(
    lessons: list[LessonInput],
    diagnostic: dict[str, float],
) -> list[LessonDecision]:
    """Propose a path from what the diagnostic showed, per concept.

    `diagnostic` maps concept id to a score in 0..1. A concept the diagnostic did not
    cover is simply absent, and its lessons are required — silence is not evidence of
    knowing something.
    """
    decisions: list[LessonDecision] = []

    for lesson in lessons:
        score = diagnostic.get(lesson.concept_id)

        if lesson.order <= NEVER_SKIPPABLE_ORDER:
            decisions.append(
                LessonDecision(
                    level_id=lesson.level_id,
                    requirement=LessonRequirement.REQUIRED,
                    decided_by=DecidedBy.RULE,
                    confidence=1.0,
                    reason="The opening lessons teach the tools and the world, not just the concept.",
                    concept_id=lesson.concept_id,
                    diagnostic_score=score,
                )
            )
            continue

        if score is None:
            decisions.append(
                LessonDecision(
                    level_id=lesson.level_id,
                    requirement=LessonRequirement.REQUIRED,
                    decided_by=DecidedBy.RULE,
                    confidence=1.0,
                    reason="The diagnostic did not cover this concept.",
                    concept_id=lesson.concept_id,
                )
            )
            continue

        if score < CLEARLY_REQUIRED_THRESHOLD:
            decisions.append(
                LessonDecision(
                    level_id=lesson.level_id,
                    requirement=LessonRequirement.REQUIRED,
                    decided_by=DecidedBy.RULE,
                    confidence=0.95,
                    reason=f"Diagnostic score {score:.2f} is below {CLEARLY_REQUIRED_THRESHOLD:.2f}.",
                    concept_id=lesson.concept_id,
                    diagnostic_score=score,
                )
            )
            continue

        if score >= SKIP_CANDIDATE_THRESHOLD:
            # Proposed, not decided. Every skip is reviewed before it is applied.
            decisions.append(
                LessonDecision(
                    level_id=lesson.level_id,
                    requirement=LessonRequirement.OPTIONAL,
                    decided_by=DecidedBy.RULE,
                    confidence=0.55,
                    reason=f"Diagnostic score {score:.2f} suggests this is already known.",
                    needs_review=True,
                    concept_id=lesson.concept_id,
                    diagnostic_score=score,
                )
            )
            continue

        # The middle band: good but not conclusive. Required, and deliberately not
        # escalated — the safe answer and the rule's answer agree, so there is nothing for
        # a model to resolve.
        decisions.append(
            LessonDecision(
                level_id=lesson.level_id,
                requirement=LessonRequirement.REQUIRED,
                decided_by=DecidedBy.RULE,
                confidence=0.75,
                reason=f"Diagnostic score {score:.2f} is promising but short of {SKIP_CANDIDATE_THRESHOLD:.2f}.",
                concept_id=lesson.concept_id,
                diagnostic_score=score,
            )
        )

    return decisions


def starting_level(decisions: list[LessonDecision]) -> str | None:
    """The first lesson the student actually has to do."""
    for decision in decisions:
        if decision.requirement is LessonRequirement.REQUIRED:
            return decision.level_id
    # Every lesson optional. Unlikely, and the first lesson is still where to begin.
    return decisions[0].level_id if decisions else None


def skipped_count(decisions: list[LessonDecision]) -> int:
    return sum(1 for d in decisions if d.requirement is LessonRequirement.OPTIONAL)
