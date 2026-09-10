"""Sessions — the keystone of the evidence layer.

    open  ->  phase  ->  phase  ->  ...  ->  close  ->  debrief
                 |                            |
              hints, submissions,          mastery
              chat all hang off the id     refresh

Nothing else in this service works without a session row. `/v1/hints`,
`/v1/submissions/analyze` and `/v1/tico/messages` all call `sessions.get_owned` and all
404 without one, so this is the endpoint that has to exist before any of them are usable
over HTTP.

## Every number on the debrief is counted here

`submissions` and `hint_events` are the evidence; Python counts them. The model writes one
sentence and is never asked for a figure — see `app/ai/chains/debrief.py`, which throws
away a reply containing a number the counts do not support.

## Mastery moves on close, not on debrief

Closing is the event that says the attempt is over. Debrief is a screen, and a student may
never look at it, or may look twice. Putting the mastery update on close means the evidence
is recorded exactly once whether or not anyone reads the summary.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.ai.chains.debrief import write_debrief
from app.models_tables import ConceptMastery, Exercise, GeneratedMission, Lesson, Submission
from app.models_tables.enums import SessionKind, SessionOutcome
from app.queries import sessions as session_q, students as student_q, users
from app.rules.mastery import compute_outcome_score, update_mastery_profile
from app.schemas.common import Phase
from sqlalchemy import select

log = logging.getLogger(__name__)

#: Three stars is a clean solve; the bar drops as attempts and hints accumulate. Deliberately
#: generous — stars are encouragement, not assessment. The assessment is `concept_mastery`,
#: which the student never sees as a number.
def stars_for(*, solved: bool, attempts: int, hints: int) -> int:
    if not solved:
        return 0
    if attempts <= 2 and hints == 0:
        return 3
    if attempts <= 5 and hints <= 2:
        return 2
    return 1


class UnknownLesson(RuntimeError):
    """The client named a lesson that is not in the database. A 422, not a 500."""


class SessionNotFound(RuntimeError):
    """No such session for this student. A 404, and deliberately not a 403.

    Telling an attacker apart from a typo is not worth confirming that someone else's
    session id exists.
    """


# ------------------------------------------------------------------------ lifecycle


def open_session(
    db: Session,
    *,
    user_id: str,
    level_id: str,
    generated_mission_id: str | None = None,
) -> object:
    """Start a session at phase 1.

    `level_id` is stored on `lesson_id`, which is its own column and its own foreign key.
    It is **not** written to `exercise_id`: that points at `exercises`, and a lesson id
    fails the constraint there.
    """
    users.ensure(db, user_id)

    # `lesson_id` is a real foreign key now, so an unknown one raises an IntegrityError
    # deep inside the flush and surfaces as a 500. Check it here and say what is wrong:
    # the client sent a lesson that does not exist, which is worth knowing rather than
    # silently dropping — a session attributed to no lesson is how the null got there in
    # the first place.
    if level_id and db.get(Lesson, level_id) is None:
        raise UnknownLesson(f"no lesson '{level_id}'")

    session = session_q.open_session(
        db,
        user_id=user_id,
        generated_mission_id=generated_mission_id,
        lesson_id=level_id,
        kind=SessionKind.LESSON,
    )
    db.commit()
    log.info("session %s opened for %s on lesson %s", session.id, user_id, level_id)
    return session


def set_phase(db: Session, *, user_id: str, session_id: str, phase: Phase) -> object:
    """Move the student to a phase. The client drives the loop; this records where they are."""
    session = _owned(db, session_id, user_id)
    session_q.set_phase(db, session, phase)
    db.commit()
    return session


def close_session(
    db: Session, *, user_id: str, session_id: str, outcome: SessionOutcome, time_spent_ms: int
) -> object:
    """Close it and move mastery. Idempotent — a double-close keeps the first `ended_at`.

    A double-close is normal: the client may fire on both "tests passed" and "student
    navigated away". The mastery update is guarded on that, because applying the same
    evidence twice would let a student inflate a concept by closing a session repeatedly.
    """
    session = _owned(db, session_id, user_id)
    already_closed = session.ended_at is not None

    session_q.close_session(db, session, outcome=outcome, time_spent_ms=time_spent_ms)

    if not already_closed:
        _refresh_mastery(db, session)

    db.commit()
    return session


def _owned(db: Session, session_id: str, user_id: str):
    session = session_q.get_owned(db, session_id, user_id)
    if session is None:
        raise SessionNotFound(f"no session '{session_id}' for this student")
    return session


def level_id_of(db: Session, session) -> str | None:
    """The lesson this session belongs to.

    Stored now, rather than derived. It used to be neither: `practice_sessions` had no
    lesson column, so a session on a runtime-generated mission could not be attributed to
    a lesson at all, and `SessionOut.levelId` came back null for exactly the sessions that
    most needed it.

    The exercise is still consulted as a fallback, because rows written before the column
    existed have `lesson_id` null and an exercise that knows the answer.
    """
    if session.lesson_id:
        return session.lesson_id
    if not session.exercise_id:
        return None
    exercise = db.get(Exercise, session.exercise_id)
    return exercise.lesson_id if exercise else None


# -------------------------------------------------------------------------- mastery


def _refresh_mastery(db: Session, session) -> dict[str, float]:
    """Move the student's mastery on the evidence this session produced.

    **Never a model.** `rules/mastery.py` is pure Python and this is the only thing that
    writes `concept_mastery`. A language model asked "how well does this child understand
    loops" will answer confidently and be wrong, and the number it invents would then drive
    which lessons the child is given.
    """
    concepts = _concepts_of(db, session)
    if not concepts:
        return {}

    target_id, carried_ids = concepts
    solved = session.outcome == SessionOutcome.SOLVED
    hints = session_q.hint_count(db, session.id)

    existing = student_q.mastery_map(db, session.user_id)
    target_row = existing.get(target_id)

    result = update_mastery_profile(
        target_concept_id=target_id,
        target_old_mastery=target_row.mastery if target_row else 0.0,
        target_old_confidence=target_row.confidence if target_row else 0.5,
        target_old_evidence_count=target_row.evidence_count if target_row else 0,
        outcome=compute_outcome_score(passed=solved, hints_used=hints),
        # Carried concepts move proportionally: a loops mission is also evidence about
        # variables, but weaker evidence, because the student was not being asked about
        # variables. The weight is what stops one mission inflating five concepts.
        carried_concepts={
            cid: (existing[cid].mastery if cid in existing else 0.0, _CARRIED_WEIGHT)
            for cid in carried_ids
            if cid != target_id
        },
        carried_old_confidences={cid: existing[cid].confidence for cid in carried_ids if cid in existing},
        carried_old_evidence_counts={
            cid: existing[cid].evidence_count for cid in carried_ids if cid in existing
        },
    )

    for concept_id, update in result.all_updates.items():
        row = existing.get(concept_id)
        if row is None:
            row = ConceptMastery(user_id=session.user_id, concept_id=concept_id)
            db.add(row)
        row.mastery = update.new_mastery
        row.confidence = update.new_confidence
        row.evidence_count = update.new_evidence_count
        row.last_seen_at = session.ended_at

    db.flush()
    return {cid: u.mastery_delta for cid, u in result.all_updates.items()}


#: How much a carried concept moves relative to the target. A mission about loops is real
#: evidence about the variables it uses, but the student was not being tested on those.
_CARRIED_WEIGHT = 0.3


def _concepts_of(db: Session, session) -> tuple[str, list[str]] | None:
    """`(target, carried)` for the mission this session played, or None if unknown."""
    if not session.generated_mission_id:
        return None
    mission = db.get(GeneratedMission, session.generated_mission_id)
    if mission is None or not mission.content:
        return None

    target = mission.content.get("targetConceptId")
    if not target:
        return None
    return target, list(mission.content.get("carriedConceptIds") or [])


# -------------------------------------------------------------------------- debrief


def debrief(db: Session, *, user_id: str, session_id: str) -> dict:
    """What the student actually did, counted from the evidence."""
    session = _owned(db, session_id, user_id)

    attempts = session_q.attempt_count(db, session.id)
    hints = session_q.hint_count(db, session.id)
    solved = session.outcome == SessionOutcome.SOLVED
    overcome = errors_overcome(db, session.id)

    concepts = _concepts_of(db, session)
    target = concepts[0] if concepts else ""

    mission_title = ""
    if session.generated_mission_id:
        mission = db.get(GeneratedMission, session.generated_mission_id)
        if mission and mission.content:
            mission_title = mission.content.get("titleAr") or ""

    feedback = write_debrief(
        mission=mission_title,
        concept=target,
        solved=solved,
        attempts=attempts,
        hints=hints,
        time_spent_ms=session.time_spent_ms,
        errors_overcome=overcome,
    )

    return {
        "session_id": session.id,
        "outcome": session.outcome,
        "total_attempts": attempts,
        "hints_used": hints,
        "errors_overcome": overcome,
        "time_spent_ms": session.time_spent_ms,
        # Mastery moved on close, so the debrief reports rather than recomputes. A concept
        # counts as mastered only if this session is what pushed it over the line.
        "concepts_mastered": _crossed_the_line(db, session, target),
        "mastery_delta": {},
        "tico_feedback": feedback,
        "stars_earned": stars_for(solved=solved, attempts=attempts, hints=hints),
    }


#: Where "knows this" begins. Matches `rules/mastery.STRONG_MASTERY_THRESHOLD` in spirit;
#: kept local because the debrief's claim to a student is a softer thing than the planner's
#: decision to skip a lesson.
MASTERY_THRESHOLD = 0.8


def _crossed_the_line(db: Session, session, target: str) -> list[str]:
    """Concepts now above the threshold that this session's evidence contributed to.

    Not "every concept above the threshold" — a student who mastered conditionals in March
    should not be told they mastered conditionals again in September.
    """
    if not target:
        return []
    row = student_q.mastery_for(db, session.user_id, target)
    if row is None or row.mastery < MASTERY_THRESHOLD:
        return []
    # One piece of evidence is not mastery, however well it went.
    return [target] if row.evidence_count > 1 else []


def errors_overcome(db: Session, session_id: str) -> list[str]:
    """Error tags that showed up in this session and then stopped.

    The interesting number on the whole screen, and the reason the debrief is worth
    building: "you hit this twice and then you didn't" is something a student can feel
    proud of in a way that "3 stars" is not.

    A tag counts as overcome if it appears on some attempt and not on the last one. The
    final attempt is the state the student ended in, so a tag still present there was not
    overcome — it was survived, or the session was abandoned.
    """
    rows = list(
        db.execute(
            select(Submission.attempt_number, Submission.error_tag)
            .where(Submission.session_id == session_id)
            .order_by(Submission.attempt_number)
        )
    )
    if len(rows) < 2:
        return []

    last_tag = rows[-1].error_tag
    seen = {r.error_tag for r in rows[:-1] if r.error_tag}
    return sorted(seen - {last_tag})
