"""Mission sessions — the keystone of the evidence layer.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M1.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from app.api.v1 import _fixtures as fx
from app.api.v1._stub import mark
from app.core.auth import CurrentUser, get_current_user
from app.schemas.common import ErrorResponse, Phase, SessionOutcome
from app.schemas.sessions import SessionClose, SessionCreate, SessionOut, SessionPhaseUpdate

router = APIRouter(prefix="/sessions", tags=["sessions"])

RESPONSES = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}


@router.post(
    "",
    response_model=SessionOut,
    status_code=status.HTTP_201_CREATED,
    responses=RESPONSES,
    summary="Open a session",
    description=(
        "Call this when the student opens a mission. Everything else — hints, "
        "submissions, model calls — attaches to the session id this returns. It is also "
        "the LangGraph thread id for TICO's chat."
    ),
)
def open_session(
    body: SessionCreate,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> SessionOut:
    mark(response)
    data = fx.session()
    data["user_id"] = user.id
    data["level_id"] = body.level_id
    data["generated_mission_id"] = body.generated_mission_id
    data["phase"] = Phase.ENCOUNTER
    data["outcome"] = SessionOutcome.IN_PROGRESS
    data["hints_used"] = 0
    data["time_spent_ms"] = 0
    return SessionOut(**data)


@router.patch(
    "/{session_id}/phase",
    response_model=SessionOut,
    responses=RESPONSES,
    summary="Advance the phase",
    description="The client moves the student through the seven-phase mission loop.",
)
def set_phase(
    session_id: str,
    body: SessionPhaseUpdate,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> SessionOut:
    mark(response)
    data = fx.session(session_id)
    data["user_id"] = user.id
    data["phase"] = body.phase
    return SessionOut(**data)


@router.post(
    "/{session_id}/close",
    response_model=SessionOut,
    responses=RESPONSES,
    summary="Close a session",
    description=(
        "Records the outcome and elapsed time. Closing triggers the student-model "
        "refresh in the background — the client does not wait for it."
    ),
)
def close_session(
    session_id: str,
    body: SessionClose,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> SessionOut:
    mark(response)
    data = fx.session(session_id)
    data["user_id"] = user.id
    data["outcome"] = body.outcome
    data["time_spent_ms"] = body.time_spent_ms
    data["ended_at"] = fx.NOW
    return SessionOut(**data)
