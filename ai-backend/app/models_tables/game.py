"""The seven original tables, as created by migration 20260902000000_init.

The AI backend **reads** these and writes only two columns on `submissions`
(`error_family`, `error_tag`) once those are added. It never creates or alters them.

Column names are camelCase because Prisma leaves field names alone — see `base.py`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, Integer, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models_tables.base import Base
from app.models_tables.ids import new_id


def _utcnow() -> datetime:
    """Prisma's @updatedAt runs in the Prisma client, so it never fires for a
    write from this service. Naive UTC to match the TIMESTAMP(3) columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
from app.models_tables.enums import (
    DIFFICULTY,
    ERROR_FAMILY,
    ROLE,
    SUBMISSION_STATUS,
    Difficulty,
    ErrorFamily,
    Role,
    SubmissionStatus,
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(Text, unique=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    name: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column("avatarUrl", Text)
    role: Mapped[Role] = mapped_column(ROLE, default=Role.STUDENT)
    bio: Mapped[str | None] = mapped_column(Text)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=_utcnow, onupdate=_utcnow)

    submissions: Mapped[list["Submission"]] = relationship(back_populates="user")
    progress: Mapped[list["UserProgress"]] = relationship(back_populates="user")
    practice_sessions: Mapped[list["PracticeSession"]] = relationship(back_populates="user")  # noqa: F821
    concept_mastery: Mapped[list["ConceptMastery"]] = relationship(back_populates="user")  # noqa: F821
    lesson_plans: Mapped[list["LessonPlan"]] = relationship(back_populates="user")  # noqa: F821
    profile: Mapped["StudentProfile | None"] = relationship(back_populates="user")  # noqa: F821
    auth_sessions: Mapped[list["AuthSession"]] = relationship(back_populates="user")  # noqa: F821
    auth_sessions: Mapped[list["AuthSession"]] = relationship(back_populates="user")  # noqa: F821
    auth_sessions: Mapped[list["AuthSession"]] = relationship(back_populates="user")  # noqa: F821

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"


class Track(Base):
    """A Track is a WORLD in TICO terms — Cairo Metro, Cairo Traffic, the Nile."""

    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    description: Mapped[str] = mapped_column(Text)
    icon: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(Text)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=_utcnow, onupdate=_utcnow)

    lessons: Mapped[list["Lesson"]] = relationship(back_populates="track")
    mission_templates: Mapped[list["MissionTemplate"]] = relationship(back_populates="track")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Track {self.slug}>"


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    track_id: Mapped[str] = mapped_column(
        "trackId", Text, ForeignKey("tracks.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(Text)
    slug: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=_utcnow, onupdate=_utcnow)

    track: Mapped[Track] = relationship(back_populates="lessons")
    exercises: Mapped[list["Exercise"]] = relationship(back_populates="lesson")
    lesson_plans: Mapped[list["LessonPlan"]] = relationship(back_populates="lesson")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Lesson {self.slug}>"


class Exercise(Base):
    """An Exercise is a MISSION in TICO terms — the unit a student writes code for."""

    __tablename__ = "exercises"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    lesson_id: Mapped[str] = mapped_column(
        "lessonId", Text, ForeignKey("lessons.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(Text)
    instructions: Mapped[str] = mapped_column(Text)
    starter_code: Mapped[str] = mapped_column("starterCode", Text)
    solution_code: Mapped[str | None] = mapped_column("solutionCode", Text)
    #: [{ input, expectedOutput, isHidden? }] — the generation validator runs the
    #: generated solution against these before a mission is ever shown.
    test_cases: Mapped[dict | list] = mapped_column("testCases", JSONB)
    #: Authored fallback hints, one per rung (index 0 = rung 1). Used when the model is
    #: unavailable or the answer-leak assertion rejects its output.
    hints: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    difficulty: Mapped[Difficulty] = mapped_column(DIFFICULTY, default=Difficulty.BEGINNER)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=_utcnow, onupdate=_utcnow)

    lesson: Mapped[Lesson] = relationship(back_populates="exercises")
    submissions: Mapped[list["Submission"]] = relationship(back_populates="exercise")
    concepts: Mapped[list["ExerciseConcept"]] = relationship(back_populates="exercise")  # noqa: F821
    practice_sessions: Mapped[list["PracticeSession"]] = relationship(back_populates="exercise")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Exercise {self.id} {self.title!r}>"


class Submission(Base):
    """One run of a student's code. The engine executes it; this service never does.

    **The clearest example of the mixed convention.** This one table has camelCase columns
    from the original migration (`userId`, `exerciseId`, `createdAt`, `executionTimeMs`)
    and snake_case columns from the AI migration (`attempt_number`, `error_family`,
    `error_tag`, `hints_used_before`, `session_id`). Both are real; neither can be renamed
    without breaking Prisma. Every one is therefore named explicitly below.

    `error_family` and `error_tag` are the only two columns this service **writes** —
    filled in by `/v1/submissions/analyze`. Everything else is written by the client.
    """

    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        "userId", Text, ForeignKey("users.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[str] = mapped_column(
        "exerciseId", Text, ForeignKey("exercises.id", ondelete="CASCADE")
    )
    code: Mapped[str] = mapped_column(Text)
    status: Mapped[SubmissionStatus] = mapped_column(
        SUBMISSION_STATUS, default=SubmissionStatus.PENDING
    )
    output: Mapped[str | None] = mapped_column(Text)
    execution_time_ms: Mapped[int | None] = mapped_column("executionTimeMs", Integer)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())

    # --- added by the AI migration; snake_case ---------------------------------------
    session_id: Mapped[str | None] = mapped_column(
        "session_id", Text, ForeignKey("practice_sessions.id", ondelete="SET NULL")
    )
    #: Which try this is. The same error on attempt 7 means something different from the
    #: same error on attempt 1, so the classifier is told.
    attempt_number: Mapped[int] = mapped_column("attempt_number", Integer, default=1)
    #: Hints already shown when this was submitted. Solving after four hints is not the
    #: same evidence as solving cold, and mastery has to know the difference.
    hints_used_before: Mapped[int] = mapped_column("hints_used_before", Integer, default=0)
    error_family: Mapped[ErrorFamily | None] = mapped_column("error_family", ERROR_FAMILY)
    error_tag: Mapped[str | None] = mapped_column("error_tag", Text)

    user: Mapped[User] = relationship(back_populates="submissions")
    exercise: Mapped[Exercise] = relationship(back_populates="submissions")

    def __repr__(self) -> str:
        return f"<Submission {self.id} {self.status} attempt={self.attempt_number}>"


class UserProgress(Base):
    __tablename__ = "user_progress"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        "userId", Text, ForeignKey("users.id", ondelete="CASCADE")
    )
    lesson_id: Mapped[str] = mapped_column(
        "lessonId", Text, ForeignKey("lessons.id", ondelete="CASCADE")
    )
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column("completedAt")
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=_utcnow, onupdate=_utcnow)

    user: Mapped[User] = relationship(back_populates="progress")

    def __repr__(self) -> str:
        return f"<UserProgress {self.user_id}/{self.lesson_id} done={self.completed}>"


class CompanionChat(Base):
    """TICO's chat history for display. LangGraph keeps working state separately."""

    __tablename__ = "companion_chats"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        "userId", Text, ForeignKey("users.id", ondelete="CASCADE")
    )
    lesson_id: Mapped[str | None] = mapped_column(
        "lessonId", Text, ForeignKey("lessons.id", ondelete="SET NULL")
    )
    messages: Mapped[dict | list] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column("createdAt", server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=_utcnow, onupdate=_utcnow)

    def __repr__(self) -> str:
        return f"<CompanionChat {self.id}>"
