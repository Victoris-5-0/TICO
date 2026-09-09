"""TICO's hint mode — the four-rung ladder.

The server counts prior `hint_event` rows and fixes the rung **before any model is
called**. The model writes prose for that rung only; it never sees the solution and never
chooses how much to give away.

**No rung returns a complete solution**, including rung 4 — which walks the student to the
fix in words and then offers a smaller practice problem. `guards.hint_leaks_answer` checks
every reply against the mission's own solution and throws away anything that leaks.

Only the phases with a blank to be stuck on have a ladder. Phases 1 to 4 use TICO chat
instead: explaining what `==` does is not the answer to *their* problem, so chat may
explain freely where a hint may not.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.database import get_db
from app.rules.hint_ladder import HintsNotAvailable
from app.schemas.common import ErrorResponse
from app.schemas.hints import HintRequest, HintResponse
from app.services import hints as hints_service

router = APIRouter(tags=["tico"])


@router.post(
    "/hints",
    response_model=HintResponse,
    responses={
        401: {"model": ErrorResponse},
        403: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
    summary="Ask TICO for a hint",
    description=(
        "Returns the next rung of the four-rung ladder. **The client never asks for a "
        "level** — the server counts the hints already shown in this session and decides.\n\n"
        "| Rung | What it does |\n"
        "|---|---|\n"
        "| 1 ORIENT | points at the region, no diagnosis |\n"
        "| 2 QUESTION | makes them think about the concept |\n"
        "| 3 NAME_IT | names it, shows the pattern on a **different** example |\n"
        "| 4 WALK | walks to the fix in words — still no code |\n\n"
        "**No rung ever returns a solution.** When `isFinal` is true, offer `nextStep` "
        "(a smaller practice problem), never the answer.\n\n"
        "The ladder depends on the phase: `GUIDED_CODING` starts at rung 1, "
        "`ADAPT_REMIX` starts at rung 2 (they have seen this code work), and "
        "`INDEPENDENT` stops at rung 3. Asking during phases 1-4 returns **409** — those "
        "have no blank to be stuck on, and phase 2 carries its own nudge.\n\n"
        "`cached: true` means it was served from Postgres with no model call, which is "
        "common on early lessons and is the main cost saving."
    ),
)
def get_hint(
    body: HintRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HintResponse:
    try:
        payload = hints_service.request_hint(
            db,
            user_id=user.id,
            session_id=body.session_id,
            mission_id=body.mission_id,
            code_excerpt=body.code_excerpt,
            phase=body.phase,
            guided_step=body.guided_step,
            error_text=body.error_text,
            error_tag=body.error_tag,
            locale=body.locale,
        )
    except hints_service.SessionNotFound as exc:
        # 404 rather than 403 on purpose: confirming that someone else's session id
        # exists is not worth distinguishing an attacker from a typo.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except HintsNotAvailable as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    db.commit()
    return HintResponse(**payload)
