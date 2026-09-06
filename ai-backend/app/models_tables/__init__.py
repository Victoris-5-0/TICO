"""SQLAlchemy models over the Prisma-owned schema — all 29 tables.

`client/prisma/schema.prisma` is the single source of truth. These classes are a typed
read/write view: this service creates nothing and migrates nothing. There is no Alembic
here and `Base.metadata.create_all()` must never be called.

    game.py          the seven original tables (camelCase columns)
    learning.py      the adaptive spine: concepts, mastery, profiles, lesson plans
    sessions.py      practice sessions, hint events, the AI call log
    generation.py    mission templates, generated missions, error tags, hint cache
    gamification.py  XP, streaks, heroes, items, achievements, classrooms

Importing this package registers every model on `Base`, which is what lets
`tests/test_model_mapping.py` walk them all. Import models from here, not from the
submodules, so a file move does not become a rename across the codebase.

Keeping these in step with schema.prisma is manual. `test_model_mapping.py` compares
every mapped column against the real migration SQL and fails on drift, which is what
turns a silent runtime error into a red build.
"""

from app.models_tables.base import Base
from app.models_tables.enums import (
    ALL_PG_ENUMS,
    CLASSROOM_ROLE,
    DECIDED_BY,
    DIFFICULTY,
    ERROR_FAMILY,
    ITEM_TYPE,
    LESSON_REQUIREMENT,
    PHASE,
    ROLE,
    SCAFFOLD_LEVEL,
    SESSION_KIND,
    SESSION_OUTCOME,
    SKILL_BAND,
    SUBMISSION_STATUS,
    XP_SOURCE,
    ClassroomRole,
    DecidedBy,
    Difficulty,
    ErrorFamily,
    ItemType,
    LessonRequirement,
    Phase,
    Role,
    ScaffoldLevel,
    SessionKind,
    SessionOutcome,
    SkillBand,
    SubmissionStatus,
    XpSource,
)
from app.models_tables.game import (
    CompanionChat,
    Exercise,
    Lesson,
    Submission,
    Track,
    User,
    UserProgress,
)
from app.models_tables.gamification import (
    Achievement,
    Classroom,
    ClassroomMember,
    DailyActivity,
    Hero,
    Item,
    UserAchievement,
    UserHero,
    UserItem,
    XpEvent,
)
from app.models_tables.generation import (
    ErrorTag,
    GeneratedMission,
    HintCache,
    MissionTemplate,
)
from app.models_tables.learning import (
    Concept,
    ConceptMastery,
    ExerciseConcept,
    LessonPlan,
    StudentProfile,
)
from app.models_tables.sessions import AiInteraction, HintEvent, PracticeSession

__all__ = [
    "Base",
    # enums — Python
    "Role",
    "Difficulty",
    "SubmissionStatus",
    "SessionKind",
    "Phase",
    "SessionOutcome",
    "ScaffoldLevel",
    "ErrorFamily",
    "LessonRequirement",
    "DecidedBy",
    "SkillBand",
    "XpSource",
    "ItemType",
    "ClassroomRole",
    # enums — bound Postgres types
    "ALL_PG_ENUMS",
    "ROLE",
    "DIFFICULTY",
    "SUBMISSION_STATUS",
    "SESSION_KIND",
    "PHASE",
    "SESSION_OUTCOME",
    "SCAFFOLD_LEVEL",
    "ERROR_FAMILY",
    "LESSON_REQUIREMENT",
    "DECIDED_BY",
    "SKILL_BAND",
    "XP_SOURCE",
    "ITEM_TYPE",
    "CLASSROOM_ROLE",
    # game.py
    "User",
    "Track",
    "Lesson",
    "Exercise",
    "Submission",
    "UserProgress",
    "CompanionChat",
    # learning.py
    "Concept",
    "ExerciseConcept",
    "ConceptMastery",
    "StudentProfile",
    "LessonPlan",
    # sessions.py
    "PracticeSession",
    "HintEvent",
    "AiInteraction",
    # generation.py
    "MissionTemplate",
    "GeneratedMission",
    "ErrorTag",
    "HintCache",
    # gamification.py
    "XpEvent",
    "DailyActivity",
    "Hero",
    "UserHero",
    "Item",
    "UserItem",
    "Achievement",
    "UserAchievement",
    "Classroom",
    "ClassroomMember",
]
