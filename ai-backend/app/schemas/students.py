"""The student model and the path planner — endpoints 3 and 4.

Mastery numbers are computed in Python and never produced by a model. Where a decision is
made *about* a student — skip this lesson, advance or hold — a rule proposes and a model
reviews the risky cases; `decided_by` and `reason` are always recorded so any decision can
be explained to a teacher or a judge.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.schemas.common import (
    DecidedBy,
    LessonRequirement,
    ORMSchema,
    Schema,
    SkillBand,
)


# --------------------------------------------------------------------------- mastery


class MasteryOut(ORMSchema):
    """Per student, per concept. Moved by the target concept at full weight and by every
    carried concept at its own `level_concept.weight`."""

    concept_id: str
    mastery: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_count: int = Field(ge=0)
    last_seen_at: datetime | None = None


class StudentProfileOut(ORMSchema):
    """A cache of the evidence tables, but it is what every prompt loads. Recomputed in the
    background after a session closes, never in the request path."""

    user_id: str
    self_reported_level: str | None = None
    skill_band: SkillBand
    hint_dependency: float = Field(ge=0.0, le=1.0)
    syntax_vs_logic: float = Field(
        ge=0.0, le=1.0, description="0 = errors are mostly syntax, 1 = mostly logic."
    )
    pace: float | None = None
    locale: str = Field(default="ar-EG")
    last_computed_at: datetime | None = None
    model_version: str | None = None


class RefreshResponse(Schema):
    profile: StudentProfileOut
    concepts: list[MasteryOut]
    advanced: bool = Field(description="Did the gate move the student on, or hold them for another rep?")
    decided_by: DecidedBy
    reason: str | None = Field(
        default=None, description="Why. Always set when decided_by is MODEL."
    )
    summary: str | None = Field(
        default=None, description="Human-readable, written after the numbers exist."
    )


# --------------------------------------------------------------------------- planning


class LessonPlanEntry(ORMSchema):
    """One row of the student's personal path. The concept order never changes; which
    lessons are in the path does."""

    level_id: str
    requirement: LessonRequirement
    reason: str | None = None
    decided_by: DecidedBy
    confidence: float = Field(ge=0.0, le=1.0)
    decided_at: datetime | None = None


class PlanRequest(Schema):
    is_beginner: bool = Field(
        description="From onboarding. True marks every lesson required with no diagnostic and no model call."
    )
    diagnostic_session_id: str | None = Field(
        default=None,
        description="The diagnostic playthrough. Required when is_beginner is False.",
    )
    self_reported_level: str | None = None


class PlanResponse(Schema):
    lessons: list[LessonPlanEntry]
    starting_level_id: str
    skipped_count: int = Field(ge=0)
    summary: str = Field(description="What they are skipping and why, in TICO's voice.")
