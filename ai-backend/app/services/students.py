"""The student model and the path planner.

Two things happen here, and they follow the same rule:

    a pure-Python rule proposes  ->  a model reviews only the conflicts  ->  both are logged

**Mastery numbers are never model-produced.** `rules/mastery.py` computes them and this
service writes them. A model asked "how well does this child understand loops" answers
confidently and is wrong, and the number it invents would then decide which lessons the
child is given for the rest of the roadmap.

What a model is good at is the judgement call the numbers underdetermine: the student
passed the gate but leaned on every hint — do they go on? `rules/composer.advance_or_hold`
detects that conflict and hands it to `chains/escalation_review`, which sees the whole
profile. Clear-cut cases never reach a model.

`decided_by` and `reason` are recorded on every decision, always, so that six months from
now anyone can ask why a particular child was moved on and get an answer.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.ai.chains.escalation_review import review_composer_decision, review_planner_skip
from app.models_tables import LessonPlan, Lesson
from app.models_tables.enums import DecidedBy, LessonRequirement, SkillBand
from app.queries import ai_log, sessions as session_q, students as student_q, users
from app.rules import plan as plan_rules
from app.rules.composer import advance_or_hold
from app.services.missions import concept_for_lesson
from sqlalchemy import select

log = logging.getLogger(__name__)


class NoLessonsToPlan(RuntimeError):
    """The lessons table is empty. A plan over nothing is not a plan."""


# ============================================================================== refresh


def refresh(db: Session, *, user_id: str, session_id: str | None = None) -> dict:
    """Recompute the student model and decide whether the gate opens.

    Called in the background after a session closes; the client fires and forgets.

    Mastery itself has already moved — `services/sessions.close_session` applies the
    evidence at the moment the attempt ends, so that it lands exactly once whether or not
    anyone opens the results screen. What this does is read the result and answer the
    separate question: does the student move on, or do another rep?
    """
    users.ensure(db, user_id)
    profile = student_q.ensure_profile(db, user_id)
    mastery = student_q.mastery_map(db, user_id)

    # Named, or the one that just closed. Ownership is still checked either way.
    session = (
        session_q.get_owned(db, session_id, user_id)
        if session_id
        else session_q.latest_closed_for(db, user_id)
    )
    target_id, hints, attempts = _evidence(db, session)

    if target_id is None:
        # Nothing to gate on: no session was named, or it played a mission with no target
        # concept. Return the model as it stands rather than inventing a decision.
        db.commit()
        return {
            "profile": profile,
            "concepts": list(mastery.values()),
            "advanced": False,
            "decided_by": DecidedBy.RULE,
            "reason": (
                "No closed session to evaluate, so there was no gate to open or hold."
            ),
            "summary": None,
        }

    target_row = mastery.get(target_id)
    target_mastery = target_row.mastery if target_row else 0.0

    # The rule proposes.
    decision = advance_or_hold(
        target_mastery=target_mastery,
        hints_used=hints,
        attempt_number=attempts,
        evidence_confidence=target_row.confidence if target_row else 0.5,
    )

    # The model reviews, but only when the rule says the evidence conflicts. This call is
    # a no-op for clear-cut decisions — `review_composer_decision` returns them untouched.
    if decision.has_conflict:
        log.info(
            "escalating advance-or-hold for %s on %s (%s)",
            user_id, target_id, decision.conflict_type,
        )
        decision = review_composer_decision(
            rule_decision=decision,
            target_concept_id=target_id,
            target_mastery=target_mastery,
            hints_used=hints,
            attempt_number=attempts,
            skill_band=profile.skill_band or SkillBand.ON_LEVEL,
            hint_dependency=profile.hint_dependency,
            syntax_vs_logic=profile.syntax_vs_logic,
            carried_masteries={cid: row.mastery for cid, row in mastery.items() if cid != target_id},
        )
        ai_log.log(
            db,
            capability=ai_log.REVIEW,
            user_id=user_id,
            session_id=session_id,
            model=None,
            status=ai_log.SUCCESS,
        )

    db.commit()
    return {
        "profile": profile,
        "concepts": list(mastery.values()),
        "advanced": decision.advanced,
        "decided_by": decision.decided_by,
        "reason": decision.reason,
        "summary": None,
    }


def _evidence(db: Session, session) -> tuple[str | None, int, int]:
    """`(target concept, hints used, attempts)` from the session that just closed."""
    if session is None:
        return None, 0, 1

    from app.models_tables import GeneratedMission

    target = None
    if session.generated_mission_id:
        mission = db.get(GeneratedMission, session.generated_mission_id)
        if mission and mission.content:
            target = mission.content.get("targetConceptId")

    hints = session_q.hint_count(db, session.id)
    # At least one: a session that produced no submission row still represents one try.
    attempts = max(1, session_q.attempt_count(db, session.id))
    return target, hints, attempts


# =============================================================================== planner


def build_plan(
    db: Session,
    *,
    user_id: str,
    is_beginner: bool,
    diagnostic_session_id: str | None = None,
    self_reported_level: str | None = None,
) -> dict:
    """Build the student's personal path through the fixed lesson order.

    A beginner gets every lesson required, with no diagnostic and no model call. Otherwise
    the diagnostic proposes skips and every one of them is reviewed before it is applied —
    see `rules/plan.py` for why the thresholds are conservative.
    """
    users.ensure(db, user_id)
    student_q.ensure_profile(db, user_id)

    lessons = _lessons_in_order(db)
    if not lessons:
        raise NoLessonsToPlan("no lessons in the database — has the client seed run?")

    if is_beginner:
        decisions = plan_rules.plan_for_beginner(lessons)
        summary = "أهلاً! هنبدأ من أول درس ونمشي خطوة خطوة."
    else:
        diagnostic = _diagnostic_scores(db, user_id, diagnostic_session_id)
        decisions = plan_rules.plan_from_diagnostic(lessons, diagnostic)
        decisions = [_reviewed(db, user_id, d) for d in decisions]
        summary = _summary(decisions)

    _persist_plan(db, user_id, decisions)
    db.commit()

    return {
        "lessons": [
            {
                "level_id": d.level_id,
                "requirement": d.requirement,
                "reason": d.reason,
                "decided_by": d.decided_by,
                "confidence": d.confidence,
                "decided_at": None,
            }
            for d in decisions
        ],
        "starting_level_id": plan_rules.starting_level(decisions) or lessons[0].level_id,
        "skipped_count": plan_rules.skipped_count(decisions),
        "summary": summary,
    }


def _reviewed(db: Session, user_id: str, decision: plan_rules.LessonDecision):
    """Send a proposed skip to the model. Anything else passes straight through."""
    if not decision.needs_review:
        return decision

    verdict = review_planner_skip(
        level_id=decision.level_id,
        concept_id=decision.concept_id or "",
        diagnostic_score=decision.diagnostic_score or 0.0,
        is_skippable=True,
        prior_mastery=None,
    )
    ai_log.log(
        db, capability=ai_log.REVIEW, user_id=user_id, model=None, status=ai_log.SUCCESS
    )

    # The model may only *refuse* a skip the rule proposed, never invent one. Narrowing
    # the model's authority to the safe direction is what keeps a bad review from leaving
    # a hole in a child's foundations.
    requirement = (
        LessonRequirement.OPTIONAL if verdict.allow_skip else LessonRequirement.REQUIRED
    )
    return plan_rules.LessonDecision(
        level_id=decision.level_id,
        requirement=requirement,
        decided_by=DecidedBy.MODEL,
        confidence=verdict.confidence,
        reason=verdict.reason,
        needs_review=False,
        concept_id=decision.concept_id,
        diagnostic_score=decision.diagnostic_score,
    )


def _lessons_in_order(db: Session) -> list[plan_rules.LessonInput]:
    """Every lesson, in curriculum order, with the concept it teaches.

    A lesson has no concept column: concepts hang off its exercises through
    `exercise_concepts`, so the lesson's concept is its exercises' primary one.
    """
    rows = list(db.execute(select(Lesson).order_by(Lesson.order, Lesson.id)).scalars())

    out: list[plan_rules.LessonInput] = []
    for index, lesson in enumerate(rows, start=1):
        concept = concept_for_lesson(db, lesson.id)
        out.append(
            plan_rules.LessonInput(
                level_id=lesson.id,
                # A lesson with no exercises yet has no concept. It stays in the path and
                # is required, which `plan_from_diagnostic` does for an unknown concept.
                concept_id=concept.id if concept else "",
                order=index,
            )
        )
    return out


def _diagnostic_scores(
    db: Session, user_id: str, diagnostic_session_id: str | None
) -> dict[str, float]:
    """What the diagnostic playthrough showed, per concept.

    Read from `concept_mastery`, because the diagnostic is played as ordinary sessions and
    those already moved mastery on close. There is no separate diagnostic score table, and
    adding one would mean two places recording the same evidence.

    `diagnostic_session_id` is accepted and currently unused: mastery is cumulative, so a
    single session cannot be isolated from it without a per-session breakdown the schema
    does not keep. Narrowing to that one session is the improvement to make when it does.
    """
    return {cid: row.mastery for cid, row in student_q.mastery_map(db, user_id).items()}


def _persist_plan(db: Session, user_id: str, decisions: list[plan_rules.LessonDecision]) -> None:
    """Write the path. Replaces any previous plan for this student.

    Rows are upserted rather than deleted and reinserted: `lesson_plans` is keyed on
    `(user_id, lesson_id)`, and a delete-then-insert would briefly leave a student with no
    path at all if anything failed in between.
    """
    existing = {row.lesson_id: row for row in student_q.lesson_plan(db, user_id)}

    for decision in decisions:
        row = existing.get(decision.level_id)
        if row is None:
            row = LessonPlan(user_id=user_id, lesson_id=decision.level_id)
            db.add(row)
        row.requirement = decision.requirement
        row.reason = decision.reason
        row.decided_by = decision.decided_by
        row.confidence = decision.confidence

    db.flush()


def _summary(decisions: list[plan_rules.LessonDecision]) -> str:
    """What they are skipping and why, in TICO's voice. Counted, not generated."""
    skipped = plan_rules.skipped_count(decisions)
    if skipped == 0:
        return "هنمشي على كل الدروس بالترتيب. مفيش حاجة هنعديها."
    start = plan_rules.starting_level(decisions)
    if skipped == 1:
        return "شكلك عارف أول درس كويس، فهنعديه ونبدأ من اللي بعده. تقدر ترجعله في أي وقت."
    return (
        f"شكلك عارف {skipped} دروس كويس، فهنعديهم ونبدأ من اللي بعدهم. "
        "تقدر ترجعلهم في أي وقت."
    ) if start else "هنمشي على كل الدروس بالترتيب."
