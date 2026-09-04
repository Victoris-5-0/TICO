"""Pydantic DTOs — the public contract of the AI backend.

The Next.js client and the AI teammate both build against these. Changing one changes
somebody else's work; say so before you do.
"""

from app.schemas.common import (
    ConceptRef,
    DecidedBy,
    ErrorFamily,
    ErrorResponse,
    HintRung,
    LessonRequirement,
    ORMSchema,
    Phase,
    ScaffoldLevel,
    Schema,
    SessionOutcome,
    SkillBand,
)
from app.schemas.hints import HintEventOut, HintRequest, HintResponse
from app.schemas.missions import (
    ChallengeRequest,
    GeneratedMissionOut,
    MissionTest,
    NextMissionRequest,
    ScaffoldPlan,
)
from app.schemas.sessions import (
    SessionClose,
    SessionCreate,
    SessionOut,
    SessionPhaseUpdate,
)
from app.schemas.students import (
    LessonPlanEntry,
    MasteryOut,
    PlanRequest,
    PlanResponse,
    RefreshResponse,
    StudentProfileOut,
)
from app.schemas.submissions import AnalyzeRequest, AnalyzeResponse
from app.schemas.tico import TicoChunk, TicoMessageRequest

__all__ = [
    # common
    "Schema",
    "ORMSchema",
    "ConceptRef",
    "ErrorResponse",
    "Phase",
    "SessionOutcome",
    "HintRung",
    "ErrorFamily",
    "ScaffoldLevel",
    "LessonRequirement",
    "DecidedBy",
    "SkillBand",
    # sessions
    "SessionCreate",
    "SessionPhaseUpdate",
    "SessionClose",
    "SessionOut",
    # hints
    "HintRequest",
    "HintResponse",
    "HintEventOut",
    # submissions
    "AnalyzeRequest",
    "AnalyzeResponse",
    # students
    "MasteryOut",
    "StudentProfileOut",
    "RefreshResponse",
    "LessonPlanEntry",
    "PlanRequest",
    "PlanResponse",
    # missions
    "ScaffoldPlan",
    "MissionTest",
    "GeneratedMissionOut",
    "NextMissionRequest",
    "ChallengeRequest",
]
