"""Mission sessions — the keystone of the evidence layer.

Everything else attaches to the session id `POST /v1/sessions` returns: hints, submissions,
chat, and every model call this service logs. It is also the LangGraph thread id for TICO's
conversation, which is why the client must keep it for the whole mission rather than
generating one per request.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.database import get_db
from app.schemas.common import ErrorResponse
from app.schemas.sessions import (
    SessionClose,
    SessionCreate,
    SessionDebriefResponse,
    SessionOut,
    SessionPhaseUpdate,
)
from app.services import sessions as sessions_service

router = APIRouter(prefix="/sessions", tags=["sessions"])

RESPONSES = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
}


def _out(db: Session, session) -> SessionOut:
    """`SessionOut`, with the lesson filled in where the database can supply one."""
    out = SessionOut.model_validate(session)
    return out.model_copy(update={"level_id": sessions_service.level_id_of(db, session)})


def _owned_or_404(fn, **kwargs):
    try:
        return fn(**kwargs)
    except sessions_service.SessionNotFound as exc:
        # 404 rather than 403: confirming that someone else's session id exists is not
        # worth distinguishing an attacker from a typo.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
    responses=RESPONSES,
    summary="Open a session",
    description=(
        "Call this when the student opens a mission. Everything else — hints, "
        "submissions, model calls — attaches to the session id this returns, and it is "
        "also the LangGraph thread id for TICO's chat, so keep it for the whole mission.\n\n"
        "Opens at phase `ENCOUNTER` with outcome `IN_PROGRESS`."
    ),
)
def open_session(
    body: SessionCreate,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    try:
        session = sessions_service.open_session(
            db,
            user_id=user.id,
            level_id=body.level_id,
            generated_mission_id=body.generated_mission_id,
        )
    except sessions_service.UnknownLesson as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return _out(db, session)


@router.patch(
    "/{session_id}/phase",
    response_model=SessionOut,
    responses=RESPONSES,
    summary="Advance the phase",
    description=(
        "The client drives the student through the mission loop; this records where they "
        "are. The phase matters to `/v1/hints`, which rations help differently in each "
        "one — `GUIDED_CODING` starts at rung 1, `ADAPT_REMIX` at rung 2, and phases 1 to "
        "4 have no ladder at all."
    ),
)
def set_phase(
    session_id: str,
    body: SessionPhaseUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    session = _owned_or_404(
        sessions_service.set_phase,
        db=db,
        user_id=user.id,
        session_id=session_id,
        phase=body.phase,
    )
    return _out(db, session)


@router.post(
    "/{session_id}/close",
    response_model=SessionOut,
    responses=RESPONSES,
    summary="Close a session",
    description=(
        "Records the outcome and elapsed time, and moves the student's concept mastery "
        "on the evidence this session produced.\n\n"
        "**Idempotent.** Closing twice keeps the first `endedAt` and applies the mastery "
        "evidence once — the client may legitimately fire on both \"tests passed\" and "
        "\"student navigated away\"."
    ),
)
def close_session(
    session_id: str,
    body: SessionClose,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionOut:
    session = _owned_or_404(
        sessions_service.close_session,
        db=db,
        user_id=user.id,
        session_id=session_id,
        outcome=body.outcome,
        time_spent_ms=body.time_spent_ms,
    )
    return _out(db, session)


@router.post(
    "/{session_id}/debrief",
    response_model=SessionDebriefResponse,
    responses=RESPONSES,
    summary="End-of-mission debrief",
    description=(
        "What the student actually did, ready for the results screen.\n\n"
        "Every number here is **counted in Python** from `submissions` and `hint_events`. "
        "The model contributes one field, `ticoFeedback`, and is never asked for a count — "
        "a reply containing a figure the counts do not support is thrown away, because "
        "\"you did it first try\" in front of a child who took nine attempts proves nobody "
        "was watching.\n\n"
        "`errorsOvercome` is the interesting one: tags that showed up and then stopped. "
        "That is the thing a student can feel proud of."
    ),
)
def session_debrief(
    session_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SessionDebriefResponse:
    payload = _owned_or_404(
        sessions_service.debrief, db=db, user_id=user.id, session_id=session_id
    )
    return SessionDebriefResponse(**payload)
