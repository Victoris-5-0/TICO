"""Mission generation and the challenge arena — endpoints 5 and 7.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M5 and M6.

`/missions/next` runs the whole create-and-adapt pipeline in one call: the lesson plan
says which lesson is next, the student model supplies mastery, the composer sets
scaffolding and difficulty, generation composes a scenario from the world manifest, and
a Python validator checks every id and verb against that same manifest before returning.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.api.v1 import _fixtures as fx
from app.api.v1._stub import mark
from app.core.auth import CurrentUser, get_current_user
from app.schemas.common import ErrorResponse
from app.schemas.missions import (
    ChallengeRequest,
    GeneratedMissionOut,
    NextMissionRequest,
)

router = APIRouter(tags=["missions"])

RESPONSES = {401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}}


@router.post(
    "/missions/next",
    response_model=GeneratedMissionOut,
    responses=RESPONSES,
    summary="Get the next mission, composed for this student",
    description=(
        "The student comes from the verified token, never from the body.\n\n"
        "`validated` is set by a Python validator that re-reads the world manifest — an "
        "unvalidated mission is never returned. `reused` means an equivalent params and "
        "scaffold combination already existed, which is a direct cost saving."
    ),
)
def next_mission(
    body: NextMissionRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
) -> GeneratedMissionOut:
    mark(response)
    data = fx.generated_mission()
    if body.force_regenerate:
        data["id"] = "demo-generated-2"
        data["scene_id"] = "control_room"
        data["params"] = {
            "reading": "train.delay_minutes",
            "threshold": 5,
            "comparison": ">",
        }
        data["brief"] = "القطر متأخر. شغّل الإعلان لو التأخير أكتر من ٥ دقايق."
        data["reused"] = False
    return GeneratedMissionOut(**data)


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
