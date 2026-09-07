"""Queries over `practice_sessions` and the evidence hanging off them.

SQLAlchemy lives here and nowhere above it. Routers never import a model; services call
these functions. That keeps every decision rule testable without a database, and it means
a schema change lands in one layer instead of scattered through route handlers.

Nothing here commits. The caller owns the transaction, because several of these need to
land atomically with a submission write.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models_tables import HintEvent, PracticeSession, Submission
from app.models_tables.enums import Phase, SessionKind, SessionOutcome
from app.models_tables.learning import _utcnow


def get(db: Session, session_id: str) -> PracticeSession | None:
    return db.get(PracticeSession, session_id)


def get_owned(db: Session, session_id: str, user_id: str) -> PracticeSession | None:
    """The session, but only if it belongs to this student.

    Every route that takes a `sessionId` from the client must go through this rather than
    `get()`. A session id is guessable enough that fetching one by id alone would let a
    student read another child's hints and attempts.
    """
    return db.execute(
        select(PracticeSession).where(
            PracticeSession.id == session_id,
            PracticeSession.user_id == user_id,
        )
    ).scalar_one_or_none()


def open_session(
    db: Session,
    *,
    user_id: str,
    lesson_id: str | None = None,
    generated_mission_id: str | None = None,
    kind: SessionKind = SessionKind.LESSON,
) -> PracticeSession:
    """Start a session. `id` and `started_at` fill themselves in.

    Either `lesson_id` or `generated_mission_id` should be set, depending on whether the
    mission was authored or composed at runtime.
    """
    session = PracticeSession(
        user_id=user_id,
        exercise_id=lesson_id,
        generated_mission_id=generated_mission_id,
        kind=kind,
        phase=Phase.ENCOUNTER,
        outcome=SessionOutcome.IN_PROGRESS,
        hints_used=0,
        time_spent_ms=0,
    )
    db.add(session)
    db.flush()  # populate id without ending the caller's transaction
    return session


def set_phase(db: Session, session: PracticeSession, phase: Phase) -> PracticeSession:
    session.phase = phase
    db.flush()
    return session


def close_session(
    db: Session,
    session: PracticeSession,
    *,
    outcome: SessionOutcome,
    time_spent_ms: int | None = None,
) -> PracticeSession:
    """Close it. Idempotent — closing an already-closed session keeps the first `ended_at`.

    A double-close is normal: the client may fire on both "tests passed" and "student
    navigated away", and overwriting the timestamp would corrupt the timing evidence the
    student model reads.
    """
    session.outcome = outcome
    if time_spent_ms is not None:
        session.time_spent_ms = time_spent_ms
    if session.ended_at is None:
        session.ended_at = _utcnow()
    db.flush()
    return session


def attempt_count(db: Session, session_id: str) -> int:
    """How many times the student has run their code in this session."""
    return db.execute(
        select(func.count()).select_from(Submission).where(Submission.session_id == session_id)
    ).scalar_one()


def hint_count(db: Session, session_id: str) -> int:
    """How many hints have already been shown.

    This is what fixes the next rung. Counting rows rather than trusting
    `practice_sessions.hints_used` on purpose: the counter is a denormalised convenience
    that the Next.js layer also increments, so it can drift. The events are the truth.
    """
    return db.execute(
        select(func.count()).select_from(HintEvent).where(HintEvent.session_id == session_id)
    ).scalar_one()


def latest_submission(db: Session, session_id: str) -> Submission | None:
    """The most recent run, which is what a hint or a classification is about."""
    return db.execute(
        select(Submission)
        .where(Submission.session_id == session_id)
        .order_by(Submission.attempt_number.desc())
        .limit(1)
    ).scalar_one_or_none()


def open_sessions_for(db: Session, user_id: str) -> list[PracticeSession]:
    """Sessions this student left running. Used to resume, and to time out stale ones."""
    return list(
        db.execute(
            select(PracticeSession)
            .where(
                PracticeSession.user_id == user_id,
                PracticeSession.outcome == SessionOutcome.IN_PROGRESS,
            )
            .order_by(PracticeSession.started_at.desc())
        ).scalars()
    )
