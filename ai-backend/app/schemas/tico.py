"""TICO's chat mode — endpoint 6, streamed over SSE.

Same character and same persona as the hint mode; what differs is conversation state and
streaming, which is why they are one service and not two. Student text is moderated
*before* it enters any prompt.
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import Schema


class TicoMessageRequest(Schema):
    session_id: str = Field(
        description="Also the LangGraph thread_id. A closed session is rejected — TICO has no context to stand on."
    )
    message: str = Field(max_length=2_000)


class TicoChunk(Schema):
    """One SSE frame."""

    delta: str = Field(default="", description="Text fragment to append.")
    done: bool = False
    blocked: bool = Field(
        default=False,
        description="Moderation rejected the input. `delta` carries a gentle in-character redirect and no model was called.",
    )
    offered_hint_rung: int | None = Field(
        default=None,
        description="Set when the student asked outright for the answer: TICO refuses in character and offers the next rung instead.",
    )
