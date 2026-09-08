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


class SessionDebriefResponse(Schema):
    """The end-of-mission screen: what the student actually did, in TICO's voice.

    Everything except `tico_feedback` is counted in Python from `submissions` and
    `hint_events`. The model only writes the sentence — it is never asked how many
    attempts there were, because it would guess.
    """

    session_id: str
    outcome: SessionOutcome
    total_attempts: int = Field(ge=0)
    hints_used: int = Field(ge=0)
    errors_overcome: list[str] = Field(
        default_factory=list,
        description="Error tags that appeared and then stopped appearing. This is the "
        "thing worth celebrating, and it is the one metric a student actually feels.",
    )
    time_spent_ms: int = Field(ge=0)
    concepts_mastered: list[str] = Field(
        default_factory=list, description="Concepts that crossed the mastery threshold in this session."
    )
    mastery_delta: dict[str, float] = Field(
        default_factory=dict,
        description="concept_id -> how much mastery moved during this session, -1..1. "
        "Computed in Python from attempts and hints; a model is never asked how much a "
        "child learned.",
    )
    tico_feedback: str = Field(description="Egyptian Arabic. Specific to what happened, never generic praise.")
    stars_earned: int = Field(ge=0, le=3)
