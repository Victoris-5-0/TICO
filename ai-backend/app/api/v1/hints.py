"""TICO's hint mode — endpoint 1, the first thing worth showing.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M2.

The stub reproduces the one behaviour that matters most for the UI: the rung
escalates. Ask repeatedly in the same session and you get rungs 1, 2, 3, 4 — and
rung 4 sets `is_final` with `next_step = "mini_practice"`, never the solution.
"""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, Response

from app.api.v1 import _fixtures as fx
from app.api.v1._stub import mark
from app.core.auth import CurrentUser, get_current_user
from app.schemas.common import ErrorResponse, HintRung
from app.schemas.hints import HintRequest, HintResponse

router = APIRouter(tags=["tico"])

# In-memory only. Real rung counting reads hint_events in M2.
_rungs: dict[str, int] = defaultdict(int)

MAX_RUNG = 4


@router.post(
    "/hints",
    response_model=HintResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
    summary="Ask TICO for a hint",
    description=(
        "The server decides which rung the student is on from prior hint events, then "
        "asks the model for that rung's prose only. **No rung ever returns a complete "
        "solution** — after rung 4 the client should offer the mini-practice.\n\n"
        "The stub escalates per session id, so repeated calls return rungs 1 to 4."
    ),
)
def get_hint(
    body: HintRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> HintResponse:
    mark(response)

    _rungs[body.session_id] = min(_rungs[body.session_id] + 1, MAX_RUNG)
    rung = _rungs[body.session_id]
    is_final = rung == MAX_RUNG

    return HintResponse(
        rung=HintRung(rung),
        text=fx.HINT_LADDER[rung],
        is_final=is_final,
        next_step="mini_practice" if is_final else None,
        hint_event_id=f"demo-hint-{body.session_id}-{rung}",
        cached=rung > 1,  # pretend the later rungs came from the Postgres cache
    )
