"""TICO's chat mode — endpoint 6, streamed over Server-Sent Events.

**This endpoint does NOT return JSON.** It streams SSE frames. The client needs a
streaming reader, not `await res.json()`. Each frame is one `TicoChunk`:

    data: {"delta": "سؤال حلو! ", "done": false}

    data: {"delta": "", "done": true}

Same character and persona as the hint mode; what differs is conversation state and the
freedom to explain, which is why they are one persona and two services.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import CurrentUser, get_current_user
from app.database import get_db
from app.schemas.tico import TicoMessageRequest
from app.services import tico_chat as chat_service

router = APIRouter(prefix="/tico", tags=["tico"])


@router.post(
    "/messages",
    summary="Chat with TICO (SSE stream)",
    response_class=StreamingResponse,
    description=(
        "**Streams SSE, not JSON.** Read it with `EventSource` or a streaming fetch; "
        "`await res.json()` will hang.\n\n"
        "Each frame is a `TicoChunk`: append `delta` until `done` is true.\n\n"
        "Chat may explain a concept freely — that is the difference from `/v1/hints`, "
        "which is rationed by rung. What it may not do is write the student's own "
        "solution, and a guard checks every reply against the mission's code before it "
        "is streamed.\n\n"
        "`blocked: true` means moderation stopped the message and no model was called; "
        "`delta` carries an in-character redirect. `offeredHintRung` is set when the "
        "student asked outright for the answer — TICO refuses and offers the next rung."
    ),
)
def send_message(
    body: TicoMessageRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    try:
        frames = chat_service.reply(
            db, user_id=user.id, session_id=body.session_id, message=body.message,
            page=body.page, locale=body.locale, conversation_id=body.conversation_id,
            analysis_summary=body.analysis_summary,
        )
    except chat_service.SessionNotFound as exc:
        # 404 rather than 403, for the same reason as /v1/hints.
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return StreamingResponse(
        frames,
        media_type="text/event-stream",
        # Nginx buffers proxied responses by default, which turns a stream into one
        # delivery at the end. This is the header that stops it.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
