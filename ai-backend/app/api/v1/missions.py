"""Mission generation and the challenge arena — endpoints 5 and 7.

STUB. Shapes are final; behaviour is fake. Real implementation lands in M5 and M6.

`/missions/next` runs the whole create-and-adapt pipeline in one call: the lesson plan
says which lesson is next, the student model supplies mastery, the composer sets
scaffolding and difficulty, generation composes a scenario from the world manifest, and
a Python validator checks every id and verb against that same manifest before returning.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

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
    LessonMissionOut,
    LessonMissionRequest,
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
    "/missions/by-lesson",
    response_model=LessonMissionOut,
    responses={**RESPONSES, 404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
    summary="Get the mission behind one stop on the map",
    description=(
        "**Address a mission the way the map does**: a world, and which stop along it. "
        "`/missions/next` answers \"what should this student play now\" from mastery; "
        "this answers \"what is behind stop 3 of the bakery\", which is what a student "
        "clicking a node is actually asking.\n\n"
        "Send `worldSlug` with either `lessonNumber` — the stop's **position**, 1-based, "
        "counting the way the map draws them — or `lessonSlug`, which wins when both are "
        "sent. Position is not `lessons.order`: el-forn's orders run 1, 2, 4, 5 and the "
        "map shows four stops, so stop 4 is the lesson whose order is 5.\n\n"
        "Where the mission comes from is one setting:\n\n"
        "| `LIVE_MISSION_GENERATION` | what happens | how long |\n"
        "|---|---|---|\n"
        "| off (default) | the prepared mission for this stop | ~1s, no model call |\n"
        "| off, nothing prepared | an unplayed row from the pool, else generation | 1s or 20-30s |\n"
        "| on, or `forceRegenerate` | Gemini composes a new one, validator runs its code | 20-30s |\n\n"
        "`delivery` and `live` in the response say which of those happened, so a caller "
        "never has to guess whether it is looking at prepared content or something that "
        "did not exist a minute ago. The mission is identical in shape either way — both "
        "went through the same validator.\n\n"
        "Returns **404** for an unknown world or a stop that world does not have, and "
        "**503** when generation was the only option left and could not produce "
        "something playable."
    ),
)
def mission_for_lesson(
    body: LessonMissionRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LessonMissionOut:
    try:
        _, mission, how = missions_service.for_lesson(
            db,
            user_id=user.id,
            world_slug=body.world_slug,
            lesson_number=body.lesson_number,
            lesson_slug=body.lesson_slug,
            force_regenerate=body.force_regenerate,
        )
    except missions_service.UnknownLesson as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except missions_service.NoMissionAvailable as exc:
        # Say so rather than returning a broken mission — a child cannot tell the
        # difference and will blame themselves.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not build a mission right now. {exc}",
        ) from exc

    db.commit()
    return LessonMissionOut(**mission.model_dump(), **how)


@router.get(
    "/missions/{mission_id}",
    response_model=PhasedMissionOut,
    responses={**RESPONSES, 404: {"model": ErrorResponse}},
    summary="Read one stored mission",
    description=(
        "All six phases of a mission the caller already has the id of — a student "
        "reloading the player, or returning tomorrow to the mission in their address "
        "bar. No model call and no generation: this only reads.\n\n"
        "**404** covers everything a student should not be looking at, without "
        "distinguishing between them: no such row, a mission the validator never passed, "
        "and a mission claimed by a different student. Prepared missions are shared "
        "content and stay readable by everyone."
    ),
)
def mission_by_id(
    mission_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PhasedMissionOut:
    try:
        return missions_service.by_id(db, user_id=user.id, mission_id=mission_id)
    except missions_service.MissionNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/challenges/next",
    response_model=PhasedMissionOut,
    responses={**RESPONSES, 409: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
    summary="Get a challenge from the arena",
    description=(
        "For students who finished the roadmap. Six phases, like any other mission, but "
        "**no scaffolding** and a shorter hint ladder.\n\n"
        "Concepts are mixed and weighted toward the **weakest mastered** one — a challenge "
        "built from what a student is best at flatters them and teaches nothing. Only "
        "concepts at or above the mastery threshold are eligible, so a challenge never "
        "surprises anyone with something they were never taught.\n\n"
        "Returns **409** when too few concepts are mastered to mix: nothing is broken, the "
        "student belongs on the roadmap for now."
    ),
)
def next_challenge(
    body: ChallengeRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PhasedMissionOut:
    try:
        _, mission = missions_service.next_challenge(
            db,
            user_id=user.id,
            world_slug=body.world_slug,
            exclude_level_ids=body.exclude_level_ids,
        )
    except missions_service.NotReadyForTheArena as exc:
        # 409, not 503: nothing is broken, the student simply belongs on the roadmap for
        # now. A challenge built from one mastered concept is not a challenge.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Not ready for the arena yet. {exc}",
        ) from exc
    except missions_service.NoMissionAvailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not build a challenge right now. {exc}",
        ) from exc

    db.commit()
    return mission


@router.post(
    "/missions/generate",
    response_model=GenerateMissionResponse,
    responses={**RESPONSES, 503: {"model": ErrorResponse}},
    summary="Generate one mission explicitly",
    description=(
        "Distinct from `/missions/next`: that one **decides** what this student should "
        "play now, this one **builds** a mission when the caller already knows what they "
        "want. Used for authoring and for pre-warming a lesson.\n\n"
        "Every request field is optional — with an empty body the server derives the "
        "lesson, concept and scaffold from the student's plan. Anything supplied is "
        "still bounded against the manifest before generation runs, so a client cannot "
        "generate a mission outside the world's vocabulary.\n\n"
        "The response is **exercise-shaped and lossy**: a six-phase mission is a journey, "
        "and an `exercises` row has nowhere to put one, so this returns the guided phase's "
        "starter and tests. Call `/v1/missions/next` for the whole thing.\n\n"
        "`scaffoldLevel` is honoured for a teacher and ignored for a student — a student "
        "who could set their own scaffold could ask for none and be handed a blank file."
    ),
)
def generate_mission(
    body: GenerateMissionRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GenerateMissionResponse:
    try:
        _, mission = missions_service.generate_explicit(
            db,
            user_id=user.id,
            lesson_id=body.lesson_id,
            concept_slug=body.concept,
            scaffold_level=body.scaffold_level,
            is_teacher=user.role == "TEACHER",
        )
    except missions_service.NoMissionAvailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not generate a mission. {exc}",
        ) from exc

    db.commit()
    return GenerateMissionResponse(**missions_service.as_exercise(mission))
