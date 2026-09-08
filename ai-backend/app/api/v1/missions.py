"""Mission generation and the challenge arena — endpoints 5 and 7.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M5 and M6.

`/missions/next` runs the whole create-and-adapt pipeline in one call: the lesson plan
says which lesson is next, the student model supplies mastery, the composer sets
scaffolding and difficulty, generation composes a scenario from the world manifest, and
a Python validator checks every id and verb against that same manifest before returning.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.v1 import _fixtures as fx
from app.api.v1._stub import mark
from app.database import get_db
from app.services import missions as missions_service
from app.core.auth import CurrentUser, get_current_user
from app.schemas.common import ErrorResponse
from app.schemas.common import ScaffoldLevel
from app.schemas.phases import PhasedMissionOut
from app.schemas.missions import (
    MissionTest,
    ScaffoldPlan,
    ChallengeRequest,
    GeneratedMissionOut,
    GenerateMissionRequest,
    GenerateMissionResponse,
    NextMissionRequest,
)

router = APIRouter(tags=["missions"])

RESPONSES = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}


@router.post(
    "/missions/next",
    response_model=PhasedMissionOut,
    responses={**RESPONSES, 503: {"model": ErrorResponse}},
    summary="Get the next mission — all six phases",
    description=(
        "Returns one Egyptian scenario as **six phases**: encounter, explore, discover, "
        "understand, guided coding, and adapt/remix. The student walks all six with the "
        "world on screen throughout.\n\n"
        "Send `lessonId` when the student picked a lesson — it decides what the mission "
        "teaches. Without it the server picks the first concept they have not mastered.\n\n"
        "`validated: true` means a Python validator **ran the code at every stage**: the "
        "solution passes its tests, each guided step genuinely fails until filled in, and "
        "the remix twist really does break their existing code. An unvalidated mission is "
        "never returned, so the client never has to defend against an unsolvable one.\n\n"
        "Takes 20-30 seconds — the model is writing a whole mission. Returns **503** when "
        "generation cannot produce something playable."
    ),
)
def next_mission(
    body: NextMissionRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PhasedMissionOut:
    try:
        _, mission, _ = missions_service.next_mission(
            db,
            user_id=user.id,
            lesson_id=body.lesson_id,
            force_regenerate=body.force_regenerate,
        )
    except missions_service.NoMissionAvailable as exc:
        # Say so rather than returning a broken mission — a child cannot tell the
        # difference and will blame themselves.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not build a mission right now. {exc}",
        ) from exc

    db.commit()
    return mission


@router.post(
    "/challenges/next",
    response_model=GeneratedMissionOut,
    responses=RESPONSES,
    summary="Get a challenge from the arena",
    description=(
        "For students who finished the roadmap. Concepts are mixed and weighted toward "
        "the weakest mastered one — a challenge should stretch, not flatter. No "
        "scaffolding, shorter hint ladder."
    ),
)
def next_challenge(
    body: ChallengeRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> GeneratedMissionOut:
    mark(response)
    data = fx.generated_mission()
    data["id"] = "demo-challenge-1"
    data["carried_concept_ids"] = ["variables", "conditionals"]
    data["scaffold_plan"] = {"scaffold": {}, "difficulty_band": 7, "rep_number": 1}
    data["brief"] = "تحدي: افتح البوابة بس لو الرصيف زحمة والقطر جاي في نفس الوقت."
    return GeneratedMissionOut(**data)


@router.post(
    "/missions/generate",
    response_model=GenerateMissionResponse,
    responses=RESPONSES,
    summary="Generate one mission explicitly",
    description=(
        "STUB. Composes a scenario from a mission template and the world manifest.\n\n"
        "Distinct from `/missions/next`: that one **decides** what this student should "
        "play now, this one **builds** a mission when the caller already knows what they "
        "want. Used for authoring and for pre-warming a lesson.\n\n"
        "Every request field is optional — with an empty body the server derives the "
        "lesson, concept and scaffold from the student's plan. Anything supplied is "
        "still bounded against the manifest before generation runs, so a client cannot "
        "generate a mission with a prop or verb the world does not define."
    ),
)
def generate_mission(
    body: GenerateMissionRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> GenerateMissionResponse:
    mark(response)

    return GenerateMissionResponse(
        mission_id=fx.DEMO_EXERCISE_ID,
        title="البوابة الشرطية",
        instructions="الرصيف زحمة. افتح البوابة التانية لو عدد المستنيين أكتر من 30.",
        starter_code=fx.STARTER_CODE,
        test_cases=[
            {"input": t["call"], "expectedOutput": t["expected"], "isHidden": False}
            for t in fx.MISSION_TESTS
        ],
        hints=[fx.HINT_LADDER[r] for r in sorted(fx.HINT_LADDER)],
        concepts={"primary": "conditionals", "carried": ["variables"]},
        scaffold_plan=fx.SCAFFOLD_PLAN,
        validated=True,
        engine_version="stub-0",
    )
