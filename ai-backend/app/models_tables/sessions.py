"""Sessions, hint events, and the AI call log.

This is where the evidence comes from. `concept_mastery` and `student_profiles` are both
derived from these three tables, so anything not recorded here is invisible to the
student model forever.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models_tables.base import Base
from app.models_tables.enums import (
    PHASE,
    SCAFFOLD_LEVEL,
    SESSION_KIND,
    SESSION_OUTCOME,
    Phase,
    ScaffoldLevel,
    SessionKind,
    SessionOutcome,
)


class PracticeSession(Base):
    """One attempt at one mission, from opening it to solving or abandoning it.

    `kind` separates the three reasons a student is here: a normal LESSON, the onboarding
    DIAGNOSTIC (which feeds the initial lesson plan), and a post-roadmap CHALLENGE.
    Mastery weighs them differently — a diagnostic answer is thin evidence.

    Either `exercise_id` or `generated_mission_id` is set depending on whether the mission
    was authored or composed at runtime.
    """

    __tablename__ = "practice_sessions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("exercises.id", ondelete="CASCADE")
    )
    generated_mission_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("generated_missions.id", ondelete="SET NULL")
    )
    kind: Mapped[SessionKind] = mapped_column(SESSION_KIND, default=SessionKind.LESSON)
    phase: Mapped[Phase | None] = mapped_column(PHASE)
    outcome: Mapped[SessionOutcome] = mapped_column(
        SESSION_OUTCOME, default=SessionOutcome.IN_PROGRESS
    )
    hints_used: Mapped[int] = mapped_column(Integer, default=0)
    time_spent_ms: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime | None]

    user: Mapped["User"] = relationship(back_populates="practice_sessions")  # noqa: F821
    exercise: Mapped["Exercise | None"] = relationship(  # noqa: F821
        back_populates="practice_sessions"
    )
    generated_mission: Mapped["GeneratedMission | None"] = relationship(  # noqa: F821
        back_populates="sessions"
    )
    hint_events: Mapped[list["HintEvent"]] = relationship(back_populates="session")
    ai_interactions: Mapped[list["AiInteraction"]] = relationship(back_populates="session")

    def __repr__(self) -> str:
        return f"<PracticeSession {self.id} {self.kind} {self.outcome}>"


class HintEvent(Base):
    """One hint shown to one student.

    The core evidence behind `hint_dependency`. `hint_level` is the rung, and counting
    prior rows in a session is how the server fixes the next rung *before* any model is
    called — the model is told which rung to write for and never chooses.

    `scaffold_state` records what the composer had already pre-filled, because TICO must
    not hint about a concept it scaffolded away.
    """

    __tablename__ = "hint_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    session_id: Mapped[str] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="CASCADE")
    )
    submission_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("submissions.id", ondelete="SET NULL")
    )
    concept_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("concepts.id", ondelete="SET NULL")
    )
    hint_level: Mapped[int] = mapped_column(Integer)
    text: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    #: False when the hint was shown but the student solved it another way.
    was_used: Mapped[bool] = mapped_column(Boolean, default=False)
    scaffold_state: Mapped[ScaffoldLevel | None] = mapped_column(SCAFFOLD_LEVEL)
    created_at: Mapped[datetime]

    session: Mapped[PracticeSession] = relationship(back_populates="hint_events")

    def __repr__(self) -> str:
        return f"<HintEvent {self.id} rung={self.hint_level}>"


class AiInteraction(Base):
    """Every model call: what it cost, how long it took, whether it worked.

    Required by `docs/06` and by the daily spend cap. It must never store email, name,
    OAuth data or raw secrets — `input` and `output` hold prompt and completion text, so
    treat them as the sensitive columns they are.
    """

    __tablename__ = "ai_interactions"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE")
    )
    session_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey("practice_sessions.id", ondelete="SET NULL")
    )
    #: Which of the six services made the call, e.g. 'TICO_HINT', 'CLASSIFY'.
    capability: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    prompt_version: Mapped[str | None] = mapped_column(Text)
    input: Mapped[str | None] = mapped_column(Text)
    output: Mapped[str | None] = mapped_column(Text)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(Text)
    moderation_flag: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime]

    session: Mapped[PracticeSession | None] = relationship(back_populates="ai_interactions")

    def __repr__(self) -> str:
        return f"<AiInteraction {self.capability} {self.model} {self.latency_ms}ms>"
