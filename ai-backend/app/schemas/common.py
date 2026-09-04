"""Shared enums and base models.

These DTOs are the public contract of the AI backend. The Next.js client codes against
them and the AI teammate builds `domain/` and `ai/` against them, so a change here is a
change to somebody else's work — say so before you make one.

Ids are typed `str` on purpose. Prisma's default `@id @default(uuid())` produces strings,
and until `client/prisma/schema.prisma` is written we do not know whether the client team
will use uuid, cuid or int. `str` accepts all three; tighten it once the schema lands.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Schema(BaseModel):
    """Base for request/response bodies."""

    model_config = ConfigDict(extra="forbid")


class ORMSchema(BaseModel):
    """Base for anything read out of SQLAlchemy."""

    model_config = ConfigDict(from_attributes=True, extra="ignore")


# --------------------------------------------------------------------------- enums


class Phase(str, Enum):
    """The seven-phase mission loop from the proposal."""

    ENCOUNTER = "encounter"
    EXPLORE = "explore"
    DISCOVER = "discover"
    UNDERSTAND = "understand"
    GUIDED_CODING = "guided_coding"
    ADAPT_REMIX = "adapt_remix"
    INDEPENDENT = "independent"


class SessionOutcome(str, Enum):
    IN_PROGRESS = "in_progress"
    SOLVED = "solved"
    ABANDONED = "abandoned"
    TIMED_OUT = "timed_out"


class HintRung(int, Enum):
    """The 4-rung ladder. The server fixes the rung before any model is called.

    No rung ever emits a complete solution. After WALK the student is sent to a
    mini-practice on the same idea, not to the answer.
    """

    ORIENT = 1  # point at the region, no diagnosis
    QUESTION = 2  # make them think about the concept
    NAME_IT = 3  # name the concept, show the pattern on a *different* example
    WALK = 4  # walk to the fix in their own code, in words


class ErrorFamily(str, Enum):
    """Coarse and stable. Seven values, closed.

    This half exists so the numbers work: `syntax_vs_logic` is a count, and the
    classifier eval needs a fixed answer set to score against. The specificity lives
    in the open `tag` on AnalyzeResponse, which grows from real students.
    """

    SYNTAX = "syntax"          # will not parse: indentation, missing colon, typo
    NAME = "name"              # undefined or misspelled variable / function
    TYPE = "type"              # str where int expected, etc.
    LOGIC = "logic"            # runs, wrong answer: bad condition, off-by-one
    INCOMPLETE = "incomplete"  # missing return, empty body, unchanged starter
    RUNTIME = "runtime"        # infinite loop, index error, crash
    UNKNOWN = "unknown"


class ScaffoldLevel(str, Enum):
    """How much of a carried concept is pre-filled in the starter code."""

    NONE = "none"  # the student writes it themselves
    PARTIAL = "partial"  # skeleton given, they complete it
    FULL = "full"  # pre-written, not the point of this lesson


class LessonRequirement(str, Enum):
    REQUIRED = "required"
    OPTIONAL = "optional"
    DONE = "done"
    SKIPPED = "skipped"


class DecidedBy(str, Enum):
    """Rules propose, the model reviews. Always recorded so a decision can be explained."""

    RULE = "rule"
    MODEL = "model"


class SkillBand(str, Enum):
    STRUGGLING = "struggling"
    ON_LEVEL = "on_level"
    READY_TO_STRETCH = "ready_to_stretch"


# --------------------------------------------------------------------------- shared


class ConceptRef(Schema):
    concept_id: str
    name: str | None = None


class ErrorResponse(Schema):
    """What every 4xx/5xx returns. A child mid-mission never sees a raw stack trace."""

    detail: str = Field(description="Human-readable, safe to show a student.")
    code: str | None = Field(default=None, description="Stable machine-readable code.")


class Meta(ORMSchema):
    created_at: datetime
    updated_at: datetime | None = None
