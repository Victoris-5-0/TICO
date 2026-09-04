"""TICO's chat mode — endpoint 6, streamed over Server-Sent Events.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M6.

**This endpoint does NOT return JSON.** It streams SSE frames. The client needs a
streaming reader, not `await res.json()`. Each frame is one `TicoChunk`:

    data: {"delta": "سؤال حلو! ", "done": false}

    data: {"delta": "", "done": true}

Same character and persona as the hint mode; what differs is conversation state and
streaming, which is why they are one service and not two.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.v1 import _fixtures as fx
from app.api.v1._stub import STUB_HEADER
from app.core.auth import CurrentUser, get_current_user
from app.schemas.tico import TicoChunk, TicoMessageRequest

router = APIRouter(prefix="/tico", tags=["tico"])

# Words that mean "just tell me the answer". TICO refuses in character and offers
# the next hint rung instead — it never simply complies.
_ANSWER_BEGGING = ("الاجابة", "الإجابة", "الحل", "answer", "solution", "just tell me")

# Words the moderation filter blocks before any prompt is built.
_BLOCKED = ("stupid", "غبي", "احا")


def _frame(chunk: TicoChunk) -> str:
    return f"data: {json.dumps(chunk.model_dump(), ensure_ascii=False)}\n\n"


async def _stream(message: str) -> AsyncIterator[str]:
    lowered = message.lower()

    # 1. Moderation runs BEFORE any prompt is built. No model is called.
    if any(word in lowered for word in _BLOCKED):
        yield _frame(
            TicoChunk(
                delta="خلينا نركّز على الكود بتاعنا 🙂 إيه اللي واقف قدامك دلوقتي؟",
                done=False,
                blocked=True,
            )
        )
        yield _frame(TicoChunk(delta="", done=True, blocked=True))
        return

    # 2. Asking outright for the answer: refuse in character, offer the next rung.
    if any(word in lowered for word in _ANSWER_BEGGING):
        yield _frame(
            TicoChunk(
                delta="مش هديك الحل جاهز — بس ممكن أقرّبك خطوة كمان. تحب؟",
                done=False,
                offered_hint_rung=3,
            )
        )
        yield _frame(TicoChunk(delta="", done=True, offered_hint_rung=3))
        return

    # 3. Normal reply, streamed in fragments the way a real model would.
    for piece in fx.TICO_REPLY_CHUNKS:
        yield _frame(TicoChunk(delta=piece, done=False))
        await asyncio.sleep(0.12)
    yield _frame(TicoChunk(delta="", done=True))


@router.post(
    "/messages",
    summary="Talk to TICO (SSE stream)",
    description=(
        "**Streams Server-Sent Events — this is not a JSON response.** Read it with an "
        "`EventSource` or a streaming fetch reader and append each `delta` as it "
        "arrives.\n\n"
        "Three behaviours the stub reproduces: a normal streamed reply; a `blocked` "
        "frame when moderation rejects the input, with no model called; and an "
        "`offered_hint_rung` frame when the student asks outright for the answer, which "
        "TICO refuses in character.\n\n"
        "Try sending `عايز الحل` to see the refusal path."
    ),
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "A stream of TicoChunk frames.",
        }
    },
)
async def send_message(
    body: TicoMessageRequest,
    user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    return StreamingResponse(
        _stream(body.message),
        media_type="text/event-stream",
        headers={
            STUB_HEADER: "1",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # stops Nginx buffering the stream in prod
        },
    )
