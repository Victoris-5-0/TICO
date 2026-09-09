"""Code analysis — endpoint 2.

The engine runs the code in the browser and sends the result here. This service never
executes student code — that boundary is what keeps the platform deterministic.

Two halves come back. `errorFamily` is closed and countable; `errorTag` is an open
snake_case label the model may coin, and it is the hint-cache key, which is what makes it
worth the model call at all.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.database import get_db
from app.schemas.common import ErrorResponse
from app.schemas.submissions import AnalyzeRequest, AnalyzeResponse
from app.services import submissions as submissions_service

router = APIRouter(prefix="/submissions", tags=["analysis"])


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Classify a failed submission",
    description=(
        "Returns a closed `errorFamily` for the numbers, an **open** snake_case "
        "`errorTag` for the hint cache, and a one-sentence `misconception` for TICO's "
        "prose.\n\n"
        "The tag vocabulary grows out of real students: the prompt carries the tags seen "
        "so far, and the model reuses one if it fits or coins a new one if nothing does. "
        "`isNewTag` says which happened, and a spike in new tags is a signal to go and "
        "look at what students are actually hitting.\n\n"
        "`escalated: true` means the first model was unsure and a stronger one took a "
        "second pass. `inScaffoldedRegion: true` means the student broke code that was "
        "given to them, which needs a different hint from getting their own part wrong.\n\n"
        "When `submissionId` is supplied, the diagnosis is also written onto that row, so "
        "the client can show it later without asking again."
    ),
)
def analyze(
    body: AnalyzeRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyzeResponse:
    try:
        return submissions_service.analyze(db, user_id=user.id, body=body)
    except submissions_service.SessionNotFound as exc:
        # 404 rather than 403, for the same reason as /v1/hints.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
