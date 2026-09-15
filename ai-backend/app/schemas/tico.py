"""TICO's chat mode — endpoint 6, streamed over SSE.

Same character and same persona as the hint mode; what differs is conversation state and
streaming, which is why they are one service and not two. Student text is moderated
*before* it enters any prompt.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from app.schemas.common import Schema


class TicoAnalysisSummary(Schema):
    """Page metrics computed by the application; no identity or raw learner code."""

    submissions: int = Field(ge=0)
    passed: int = Field(ge=0)
    hints: int = Field(ge=0)
    hints_per_attempt: float = Field(ge=0)
    minutes: float = Field(ge=0)
    concepts_complete: int = Field(ge=0)
    tags_overcome: int = Field(ge=0)
    current_streak: int = Field(ge=0)
    longest_streak: int = Field(ge=0)
    active_days: int = Field(ge=0)


class TicoMessageRequest(Schema):
    session_id: str | None = Field(default=None, min_length=1, max_length=200,
        description="Required for mission chat; optional owned mission background on other pages.")
    message: str = Field(min_length=1, max_length=2_000)
    page: Literal["mission", "landing", "analysis"] = "mission"
    locale: Literal["ar-EG", "en"] = "ar-EG"
    conversation_id: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,80}$",
        description="Page conversation key, scoped server-side to the authenticated user and page.")
    analysis_summary: TicoAnalysisSummary | None = None

    @model_validator(mode="after")
    def require_mission_session(self) -> "TicoMessageRequest":
        if self.page == "mission" and not self.session_id:
            raise ValueError("mission chat requires a sessionId")
        if self.analysis_summary is not None and self.page != "analysis":
            raise ValueError("analysisSummary is only available on the analysis page")
        return self


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
