"""Postgres enum types, owned by Prisma.

Prisma creates these as real Postgres types with the **model name unquoted-cased**:

    CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

Two consequences for SQLAlchemy, and getting either wrong produces confusing runtime
errors rather than a clean failure:

1. `name=` must match Prisma's type name exactly, including capitalisation.
2. `create_type=False` — Prisma owns the type. Without this, SQLAlchemy will try to
   `CREATE TYPE` and fail against a database where it already exists.
"""

from __future__ import annotations

import enum

from sqlalchemy.dialects.postgresql import ENUM as PgEnum


class Role(str, enum.Enum):
    STUDENT = "STUDENT"
    TEACHER = "TEACHER"
    ADMIN = "ADMIN"


class Difficulty(str, enum.Enum):
    BEGINNER = "BEGINNER"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"


class SubmissionStatus(str, enum.Enum):
    PENDING = "PENDING"
    PASSED = "PASSED"
    FAILED = "FAILED"
    ERROR = "ERROR"


class SessionKind(str, enum.Enum):
    LESSON = "LESSON"
    DIAGNOSTIC = "DIAGNOSTIC"
    CHALLENGE = "CHALLENGE"


class Phase(str, enum.Enum):
    """The seven-phase mission loop."""

    ENCOUNTER = "ENCOUNTER"
    EXPLORE = "EXPLORE"
    DISCOVER = "DISCOVER"
    UNDERSTAND = "UNDERSTAND"
    GUIDED_CODING = "GUIDED_CODING"
    ADAPT_REMIX = "ADAPT_REMIX"
    INDEPENDENT = "INDEPENDENT"


class SessionOutcome(str, enum.Enum):
    IN_PROGRESS = "IN_PROGRESS"
    SOLVED = "SOLVED"
    ABANDONED = "ABANDONED"
    TIMED_OUT = "TIMED_OUT"


class ScaffoldLevel(str, enum.Enum):
    """How much of a carried concept is pre-filled in the starter code."""

    NONE = "NONE"
    PARTIAL = "PARTIAL"
    FULL = "FULL"


class ErrorFamily(str, enum.Enum):
    """The closed half of error classification. The open half is `error_tags.tag`."""

    SYNTAX = "SYNTAX"
    NAME = "NAME"
    TYPE = "TYPE"
    LOGIC = "LOGIC"
    INCOMPLETE = "INCOMPLETE"
    RUNTIME = "RUNTIME"
    UNKNOWN = "UNKNOWN"


class LessonRequirement(str, enum.Enum):
    REQUIRED = "REQUIRED"
    OPTIONAL = "OPTIONAL"
    DONE = "DONE"
    SKIPPED = "SKIPPED"


class DecidedBy(str, enum.Enum):
    """Rules propose, the model reviews. Recorded so a decision can be explained."""

    RULE = "RULE"
    MODEL = "MODEL"


class SkillBand(str, enum.Enum):
    STRUGGLING = "STRUGGLING"
    ON_LEVEL = "ON_LEVEL"
    READY_TO_STRETCH = "READY_TO_STRETCH"


class XpSource(str, enum.Enum):
    EXERCISE_SOLVED = "EXERCISE_SOLVED"
    LESSON_COMPLETED = "LESSON_COMPLETED"
    ACHIEVEMENT = "ACHIEVEMENT"
    CHALLENGE = "CHALLENGE"
    STREAK_BONUS = "STREAK_BONUS"
    MANUAL = "MANUAL"


class ItemType(str, enum.Enum):
    COSMETIC = "COSMETIC"
    POWER_UP = "POWER_UP"
    BADGE = "BADGE"
    CURRENCY = "CURRENCY"


class ClassroomRole(str, enum.Enum):
    STUDENT = "STUDENT"
    ASSISTANT = "ASSISTANT"


def pg_enum(python_enum: type[enum.Enum], type_name: str) -> PgEnum:
    """Bind a Python enum to a Prisma-created Postgres type."""
    return PgEnum(
        python_enum,
        name=type_name,
        create_type=False,
        values_callable=lambda e: [m.value for m in e],
    )


ROLE = pg_enum(Role, "Role")
DIFFICULTY = pg_enum(Difficulty, "Difficulty")
SUBMISSION_STATUS = pg_enum(SubmissionStatus, "SubmissionStatus")
SESSION_KIND = pg_enum(SessionKind, "SessionKind")
PHASE = pg_enum(Phase, "Phase")
SESSION_OUTCOME = pg_enum(SessionOutcome, "SessionOutcome")
SCAFFOLD_LEVEL = pg_enum(ScaffoldLevel, "ScaffoldLevel")
ERROR_FAMILY = pg_enum(ErrorFamily, "ErrorFamily")
LESSON_REQUIREMENT = pg_enum(LessonRequirement, "LessonRequirement")
DECIDED_BY = pg_enum(DecidedBy, "DecidedBy")
SKILL_BAND = pg_enum(SkillBand, "SkillBand")
XP_SOURCE = pg_enum(XpSource, "XpSource")
ITEM_TYPE = pg_enum(ItemType, "ItemType")
CLASSROOM_ROLE = pg_enum(ClassroomRole, "ClassroomRole")

#: These mirror `app.schemas.common`, deliberately duplicated rather than imported.
#: The schema enums are the *wire* contract and the ones here are the *storage* contract;
#: they happen to be identical today, and keeping them separate means either can change
#: without silently rewriting the other. `test_model_mapping.py` asserts they agree.
ALL_PG_ENUMS = {
    "Role": ROLE,
    "Difficulty": DIFFICULTY,
    "SubmissionStatus": SUBMISSION_STATUS,
    "SessionKind": SESSION_KIND,
    "Phase": PHASE,
    "SessionOutcome": SESSION_OUTCOME,
    "ScaffoldLevel": SCAFFOLD_LEVEL,
    "ErrorFamily": ERROR_FAMILY,
    "LessonRequirement": LESSON_REQUIREMENT,
    "DecidedBy": DECIDED_BY,
    "SkillBand": SKILL_BAND,
    "XpSource": XP_SOURCE,
    "ItemType": ITEM_TYPE,
    "ClassroomRole": CLASSROOM_ROLE,
}
