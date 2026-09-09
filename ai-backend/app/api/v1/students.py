"""The student model and the path planner — endpoints 3 and 4.

Mastery numbers are computed in Python and never produced by a model. Where a decision is
made *about* a student, a rule proposes and a model reviews only the cases where the
evidence conflicts — `decidedBy` and `reason` are always recorded, so any decision about a
child can be explained six months later.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user, require_self
from app.database import get_db
from app.schemas.common import ErrorResponse
from app.schemas.students import (
    LessonPlanEntry,
    MasteryOut,
    PlanRequest,
    PlanResponse,
    RefreshRequest,
    RefreshResponse,
    StudentProfileOut,
)
from app.services import students as students_service

router = APIRouter(prefix="/students", tags=["student model"])

RESPONSES = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
}


@router.post(
    "/{student_id}/refresh",
    response_model=RefreshResponse,
    responses=RESPONSES,
    summary="Recompute the student model",
    description=(
        "Called in the background after a session closes — the client fires and forgets. "
        "Returns the profile, per-concept mastery, and whether the gate moved the student "
        "on. `decidedBy` says whether a rule or a model made that call, and `reason` says "
        "why.\n\n"
        "**Mastery has already moved by the time this runs.** `POST /v1/sessions/{id}/close` "
        "applies the evidence at the moment the attempt ends, so it lands exactly once "
        "whether or not anyone opens the results screen. What this decides is the separate "
        "question of whether the student advances past the concept gate or does another rep.\n\n"
        "Send `sessionId` so there is something to gate on; without it the model is "
        "returned as it stands and `advanced` is false."
    ),
)
def refresh(
    student_id: str,
    body: RefreshRequest | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RefreshResponse:
    require_self(student_id, user)

    result = students_service.refresh(
        db,
        user_id=student_id,
        session_id=getattr(body, "session_id", None),
    )
    return RefreshResponse(
        profile=StudentProfileOut.model_validate(result["profile"]),
        concepts=[MasteryOut.model_validate(c) for c in result["concepts"]],
        advanced=result["advanced"],
        decided_by=result["decided_by"],
        reason=result["reason"],
        summary=result["summary"],
    )


@router.post(
    "/{student_id}/plan",
    response_model=PlanResponse,
    responses={**RESPONSES, 409: {"model": ErrorResponse}},
    summary="Build the personal lesson path",
    description=(
        "After onboarding. A beginner gets every lesson `REQUIRED` with no diagnostic and "
        "no model call. An experienced student's diagnostic can mark lessons `OPTIONAL` — "
        "but **every skip is model-reviewed** and carries a `reason`.\n\n"
        "**The concept order never changes. Which lessons are in the path does.** A "
        "skipped lesson stays in the path, in order, and stays playable: skipping is a "
        "suggestion, never a lock-out. That matters because the decision rests on one "
        "diagnostic playthrough, and a wrongly skipped lesson leaves a hole the student "
        "hits six lessons later with no idea why.\n\n"
        "The reviewer may only refuse a skip, never invent one."
    ),
)
def build_plan(
    student_id: str,
    body: PlanRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PlanResponse:
    require_self(student_id, user)

    try:
        result = students_service.build_plan(
            db,
            user_id=student_id,
            is_beginner=body.is_beginner,
            diagnostic_session_id=body.diagnostic_session_id,
            self_reported_level=body.self_reported_level,
        )
    except students_service.NoLessonsToPlan as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return PlanResponse(
        lessons=[LessonPlanEntry(**row) for row in result["lessons"]],
        starting_level_id=result["starting_level_id"],
        skipped_count=result["skipped_count"],
        summary=result["summary"],
    )
