"""The adaptive spine: what a student knows and what they should do next.

These five tables are the reason the rest of the AI design is possible. Without a concept
axis there is nothing to measure mastery along, nothing to scaffold against, and no basis
for skipping a lesson.

Columns here are snake_case — these models were added with explicit `@map` on every
field, unlike the original seven tables. See `base.py` for why the schema is mixed.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Float, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models_tables.base import Base
from app.models_tables.ids import new_id


def _utcnow() -> datetime:
    """Prisma's @updatedAt runs in the Prisma client, so it never fires for a
    write from this service. Naive UTC to match the TIMESTAMP(3) columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
from app.models_tables.enums import (
    DECIDED_BY,
    LESSON_REQUIREMENT,
    SKILL_BAND,
    DecidedBy,
    LessonRequirement,
    SkillBand,
)


class Concept(Base):
    """variables -> conditionals -> loops -> functions.

    `sequence_order` **is** the roadmap. There is deliberately no prerequisite graph: a
    fixed linear order is a sort column, not a DAG. Per-student variation lives in
    `lesson_plans`, never here.
    """

    __tablename__ = "concepts"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    name_ar: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    sequence_order: Mapped[int] = mapped_column(Integer, unique=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    exercises: Mapped[list["ExerciseConcept"]] = relationship(back_populates="concept")
    mastery: Mapped[list["ConceptMastery"]] = relationship(back_populates="concept")

    def __repr__(self) -> str:
        return f"<Concept {self.sequence_order}:{self.slug}>"


class ExerciseConcept(Base):
    """The join that makes learning cumulative.

    A loops exercise still uses variables and conditionals. Exactly one row per exercise
    has `is_primary` — that is what the exercise is teaching — and the rest are carried at
    a lower `weight`. A single result therefore moves several concepts at once, which is
    how early material stays alive without scheduling extra revision.
    """

    __tablename__ = "exercise_concepts"

    exercise_id: Mapped[str] = mapped_column(
        Text, ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True
    )
    concept_id: Mapped[str] = mapped_column(
        Text, ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    #: 1.0 for the target concept; 0.2-0.4 is sensible for carried ones.
    weight: Mapped[float] = mapped_column(Float, default=1.0)

    exercise: Mapped["Exercise"] = relationship(back_populates="concepts")  # noqa: F821
    concept: Mapped[Concept] = relationship(back_populates="exercises")

    def __repr__(self) -> str:
        kind = "primary" if self.is_primary else f"carried@{self.weight}"
        return f"<ExerciseConcept {self.exercise_id}/{self.concept_id} {kind}>"


class ConceptMastery(Base):
    """How well one student knows one concept.

    Computed in Python from attempts, hints and time — **never** produced by a model. A
    language model asked "how well does this child understand loops" will answer
    confidently and be wrong, and this number gates what they see next.
    """

    __tablename__ = "concept_mastery"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    concept_id: Mapped[str] = mapped_column(
        Text, ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True
    )
    mastery: Mapped[float] = mapped_column(Float, default=0.0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    #: How much evidence backs the number. Low mastery on one attempt is not a verdict.
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    last_seen_at: Mapped[datetime | None]
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    user: Mapped["User"] = relationship(back_populates="concept_mastery")  # noqa: F821
    concept: Mapped[Concept] = relationship(back_populates="mastery")

    def __repr__(self) -> str:
        return f"<ConceptMastery {self.user_id}/{self.concept_id} {self.mastery:.2f}>"


class StudentProfile(Base):
    """The rollup every prompt loads.

    Strictly a cache of the evidence tables. Recomputed in the background after a session
    closes, never in the request path — a student waiting on a hint should not be paying
    for a mastery recompute.
    """

    __tablename__ = "student_profiles"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    #: What they said at onboarding. Kept apart from measured skill on purpose — children
    #: both over- and under-claim, and the gap is itself informative.
    self_reported_level: Mapped[str | None] = mapped_column(Text)
    skill_band: Mapped[SkillBand] = mapped_column(SKILL_BAND, default=SkillBand.ON_LEVEL)
    hint_dependency: Mapped[float] = mapped_column(Float, default=0.0)
    #: 0 = errors are mostly syntax, 1 = mostly logic. Drives what TICO leads with.
    syntax_vs_logic: Mapped[float] = mapped_column(Float, default=0.5)
    pace: Mapped[float | None] = mapped_column(Float)
    locale: Mapped[str] = mapped_column(Text, default="ar-EG")
    last_computed_at: Mapped[datetime | None]
    model_version: Mapped[str | None] = mapped_column(Text)

    user: Mapped["User"] = relationship(back_populates="profile")  # noqa: F821

    def __repr__(self) -> str:
        return f"<StudentProfile {self.user_id} {self.skill_band}>"


class LessonPlan(Base):
    """One student's personal path through the fixed lesson order.

    The order never changes; which lessons are *required* does. `reason` and `decided_by`
    make every skip auditable to a teacher, and a skipped lesson stays replayable —
    skipping is a suggestion, never a lock-out.
    """

    __tablename__ = "lesson_plans"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    lesson_id: Mapped[str] = mapped_column(
        Text, ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True
    )
    requirement: Mapped[LessonRequirement] = mapped_column(
        LESSON_REQUIREMENT, default=LessonRequirement.REQUIRED
    )
    reason: Mapped[str | None] = mapped_column(Text)
    decided_by: Mapped[DecidedBy] = mapped_column(DECIDED_BY, default=DecidedBy.RULE)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    decided_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="lesson_plans")  # noqa: F821
    lesson: Mapped["Lesson"] = relationship(back_populates="lesson_plans")  # noqa: F821

    def __repr__(self) -> str:
        return f"<LessonPlan {self.user_id}/{self.lesson_id} {self.requirement}>"
