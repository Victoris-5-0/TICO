"""The path planner. Pure logic — no database, no model.

The property worth defending is asymmetry. A needlessly required lesson costs a student
ten minutes of boredom; a wrongly skipped one leaves a hole they hit six lessons later
with no idea why. So every ambiguous case here resolves to REQUIRED, and every proposed
skip is marked for review rather than applied.
"""

from __future__ import annotations

import pytest

from app.models_tables.enums import DecidedBy, LessonRequirement
from app.rules import plan as P

LESSONS = [
    P.LessonInput(level_id=f"lesson-{i}", concept_id=f"concept-{i}", order=i)
    for i in range(1, 9)
]


def _by_id(decisions):
    return {d.level_id: d for d in decisions}


# ============================================================== beginners


def test_a_beginner_gets_every_lesson():
    decisions = P.plan_for_beginner(LESSONS)
    assert len(decisions) == len(LESSONS)
    assert all(d.requirement is LessonRequirement.REQUIRED for d in decisions)


def test_a_beginner_plan_never_involves_a_model():
    """Nothing to weigh, so a model call would spend money to reproduce the rule's answer
    — and would occasionally produce a different one."""
    for d in P.plan_for_beginner(LESSONS):
        assert d.decided_by is DecidedBy.RULE
        assert d.confidence == 1.0
        assert not d.needs_review


def test_a_beginner_starts_at_the_first_lesson():
    assert P.starting_level(P.plan_for_beginner(LESSONS)) == "lesson-1"
    assert P.skipped_count(P.plan_for_beginner(LESSONS)) == 0


# ============================================================== the order


def test_the_order_never_changes():
    """The sequence is the curriculum. A diagnostic changes membership, never order."""
    diagnostic = {f"concept-{i}": 0.99 for i in range(1, 9)}
    decisions = P.plan_from_diagnostic(LESSONS, diagnostic)
    assert [d.level_id for d in decisions] == [l.level_id for l in LESSONS]


def test_a_skipped_lesson_stays_in_the_path():
    """OPTIONAL is a label on the row, not the row's absence — a deleted lesson cannot be
    reconsidered, and this rests on one diagnostic playthrough."""
    decisions = P.plan_from_diagnostic(LESSONS, {f"concept-{i}": 0.99 for i in range(1, 9)})
    assert len(decisions) == len(LESSONS)
    assert any(d.requirement is LessonRequirement.OPTIONAL for d in decisions)


# ============================================================== thresholds


def test_the_opening_lessons_are_never_skipped():
    """They teach the tools and the world, not just the concept. A student who skips them
    has never opened the editor, and everything after assumes they have."""
    decisions = _by_id(P.plan_from_diagnostic(LESSONS, {f"concept-{i}": 1.0 for i in range(1, 9)}))
    for i in (1, 2):
        d = decisions[f"lesson-{i}"]
        assert d.requirement is LessonRequirement.REQUIRED
        assert not d.needs_review
        assert d.confidence == 1.0


def test_a_low_score_is_required_without_asking_a_model():
    decisions = _by_id(P.plan_from_diagnostic(LESSONS, {"concept-5": 0.2}))
    d = decisions["lesson-5"]
    assert d.requirement is LessonRequirement.REQUIRED
    assert not d.needs_review


def test_a_high_score_proposes_a_skip_but_does_not_apply_it():
    decisions = _by_id(P.plan_from_diagnostic(LESSONS, {"concept-5": 0.95}))
    d = decisions["lesson-5"]
    assert d.requirement is LessonRequirement.OPTIONAL
    assert d.needs_review, "every skip is reviewed before it is applied"
    assert d.confidence < P.ESCALATION_CONFIDENCE


def test_the_middle_band_is_required_and_not_escalated():
    """The rule's answer and the safe answer agree, so there is nothing to resolve."""
    decisions = _by_id(P.plan_from_diagnostic(LESSONS, {"concept-5": 0.7}))
    d = decisions["lesson-5"]
    assert d.requirement is LessonRequirement.REQUIRED
    assert not d.needs_review


def test_a_concept_the_diagnostic_missed_is_required():
    """Silence is not evidence of knowing something."""
    decisions = _by_id(P.plan_from_diagnostic(LESSONS, {}))
    assert all(d.requirement is LessonRequirement.REQUIRED for d in decisions.values())
    assert not any(d.needs_review for d in decisions.values())


def test_the_skip_bar_is_higher_than_the_mastery_gate():
    """Passing a gate means "ready to move on having done the work". Skipping means "did
    not need to do the work at all", which is a stronger claim."""
    from app.rules.composer import GATE_MASTERY_THRESHOLD

    assert P.SKIP_CANDIDATE_THRESHOLD > GATE_MASTERY_THRESHOLD


def test_every_ambiguous_score_lands_on_required():
    """Sweep the whole range: nothing below the skip bar may come back OPTIONAL."""
    for score in [i / 100 for i in range(0, 100)]:
        decisions = _by_id(P.plan_from_diagnostic(LESSONS, {"concept-5": score}))
        d = decisions["lesson-5"]
        if score < P.SKIP_CANDIDATE_THRESHOLD:
            assert d.requirement is LessonRequirement.REQUIRED, score
        else:
            assert d.needs_review, score


def test_every_decision_carries_a_reason_or_is_a_plain_beginner_row():
    decisions = P.plan_from_diagnostic(LESSONS, {"concept-5": 0.95, "concept-6": 0.1})
    for d in decisions:
        assert d.reason, f"{d.level_id} has no explanation"


# ============================================================== derived


def test_the_start_is_the_first_lesson_actually_required():
    decisions = P.plan_from_diagnostic(
        LESSONS, {"concept-3": 0.95, "concept-4": 0.95}
    )
    # 1 and 2 are never skippable, so the start is still lesson-1.
    assert P.starting_level(decisions) == "lesson-1"


def test_the_start_skips_past_optional_lessons():
    decisions = [
        P.LessonDecision("a", LessonRequirement.OPTIONAL, DecidedBy.MODEL, 0.9, "known"),
        P.LessonDecision("b", LessonRequirement.OPTIONAL, DecidedBy.MODEL, 0.9, "known"),
        P.LessonDecision("c", LessonRequirement.REQUIRED, DecidedBy.RULE, 1.0, None),
    ]
    assert P.starting_level(decisions) == "c"
    assert P.skipped_count(decisions) == 2


def test_an_entirely_optional_plan_still_has_somewhere_to_begin():
    decisions = [
        P.LessonDecision("a", LessonRequirement.OPTIONAL, DecidedBy.MODEL, 0.9, "known"),
    ]
    assert P.starting_level(decisions) == "a"


def test_an_empty_plan_has_no_start():
    assert P.starting_level([]) is None
    assert P.skipped_count([]) == 0


@pytest.mark.parametrize("count", [0, 1, 5])
def test_skipped_count_matches_the_optional_rows(count):
    decisions = [
        P.LessonDecision(f"o{i}", LessonRequirement.OPTIONAL, DecidedBy.MODEL, 0.9, "k")
        for i in range(count)
    ] + [P.LessonDecision("r", LessonRequirement.REQUIRED, DecidedBy.RULE, 1.0, None)]
    assert P.skipped_count(decisions) == count
