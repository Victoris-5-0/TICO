"""Mission sessions — the keystone of the evidence layer.

One row per playthrough. Every hint, submission and model call attaches to a session, and
the session id doubles as the LangGraph `thread_id` for TICO's chat.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import ORMSchema, Phase, Schema, SessionOutcome


class SessionCreate(Schema):
    level_id: str = Field(description="The lesson being played.")
    generated_mission_id: str | None = Field(
        default=None,
        description="The composed scenario, when the mission came from generation.",
    )


class SessionPhaseUpdate(Schema):
    phase: Phase


class SessionClose(Schema):
    outcome: SessionOutcome
    time_spent_ms: int = Field(ge=0)


class SessionOut(ORMSchema):
    id: str
    user_id: str
    level_id: str
    generated_mission_id: str | None = None
    phase: Phase
    outcome: SessionOutcome
    hints_used: int = Field(ge=0)
    time_spent_ms: int = Field(ge=0)
    started_at: datetime
    ended_at: datetime | None = None
