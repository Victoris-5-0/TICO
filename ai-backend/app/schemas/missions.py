"""Mission generation and the challenge arena — endpoints 5 and 7.

`POST /v1/missions/next` runs the whole create-and-adapt pipeline in one call: the lesson
plan says which lesson is next, the student model supplies mastery, the composer sets
scaffolding and difficulty, generation composes a scenario from the world manifest, and a
Python validator checks every id and verb against that same manifest before anything is
returned.
"""

from __future__ import annotations

from pydantic import Field

from app.schemas.common import ScaffoldLevel, Schema
from app.schemas.phases import PhasedMissionOut


class ScaffoldPlan(Schema):
    """What the composer decided, per carried concept. Also part of the hint cache key —
    TICO must not hint about a concept that was scaffolded away."""

    scaffold: dict[str, ScaffoldLevel] = Field(
        default_factory=dict, description="concept_id -> how much is pre-filled."
    )
    difficulty_band: int = Field(ge=1, le=10)
    rep_number: int = Field(
        ge=1, description="1 on a first attempt, higher when the composer scheduled extra practice."
    )


class MissionTest(Schema):
    """One check the engine runs against the student's code. The validator asserts the
    generated solution passes all of these before the mission ships."""

    name: str
    call: str = Field(description="Python expression to evaluate, using only manifest verbs.")
    expected: str


class GeneratedMissionOut(Schema):
    id: str
    level_id: str
    world_id: str = Field(description="Fixed by the roadmap. Generation never changes the world.")
    scene_id: str = Field(description="Chosen from the manifest's scene list.")
    target_concept_id: str
    carried_concept_ids: list[str] = Field(default_factory=list)

    title: str = Field(
        description="Short mission name, shown on the card and the results screen."
    )
    instructions: str = Field(
        description="What to actually write, including the required function signature. "
        "This is what the student reads above the editor."
    )
    brief: str = Field(
        description="The situation, in TICO's voice. Flavour; `instructions` is the task."
    )
    starter_code: str = Field(description="Python, with the scaffold plan already applied.")
    tests: list[MissionTest] = Field(default_factory=list)

    scaffold_plan: ScaffoldPlan
    params: dict[str, object] = Field(
        default_factory=dict, description="What generation filled in, bounded by param_schema."
    )
    validated: bool = Field(
        description="Set by the validator function, never by the model. An unvalidated mission is never returned."
    )
    reused: bool = Field(
        default=False,
        description="An equivalent params + scaffold combination already existed and was reused.",
    )


class NextMissionRequest(Schema):
    """docs/06 endpoint 5: "learner profile, lesson, world manifest version".

    The *learner* half is deliberately absent. The student comes from the verified JWT,
    never from the body — a client that could name the student could ask for another
    child's next mission. Same reason `worldId` is not here: the roadmap fixes it.
    """

    lesson_id: str | None = Field(
        default=None,
        description="Which lesson to compose for. Omit and the server takes the next one "
        "from the student's LessonPlan, which is the normal path.",
    )
    world_manifest_version: str | None = Field(
        default=None,
        description="Pin generation to a manifest version. Omit for current. The server "
        "still validates every prop and verb against that manifest.",
    )
    force_regenerate: bool = Field(
        default=False, description="Skip reuse and compose a fresh scenario. Costs a model call."
    )


class LessonMissionRequest(Schema):
    """Address a mission the way the map does: a world, and which stop along it.

    `/missions/next` asks "what should this student play now" and answers from mastery.
    This asks "what is behind stop 3 of the bakery", which is the question a student
    clicking a node on the painted map is actually asking — and the one the client used
    to answer for itself by reading `generated_missions` directly.
    """

    world_slug: str = Field(description="The world's `tracks.slug`, e.g. 'el-forn'.")
    lesson_number: int | None = Field(
        default=None,
        ge=1,
        description="Which stop along the world, 1-based, counting the way the map draws "
        "them. **Position, not `lessons.order`** — el-forn's orders run 1, 2, 4, 5, and "
        "the map shows four stops, so stop 4 is the lesson whose order is 5. Omit only "
        "when sending `lessonSlug`.",
    )
    lesson_slug: str | None = Field(
        default=None,
        description="The lesson's own slug, e.g. 'count-the-trays'. Wins over "
        "`lessonNumber` when both are sent, which is how a client that already knows the "
        "lesson avoids depending on the count.",
    )
    force_regenerate: bool = Field(
        default=False,
        description="Compose a fresh mission for this one call, whatever "
        "`LIVE_MISSION_GENERATION` says. Costs a model call and 20-30 seconds.",
    )


class LessonMissionOut(PhasedMissionOut):
    """One lesson's mission, plus how it got here.

    The extra fields exist so a caller — and a judge watching the network tab — can tell
    a mission that was waiting in the database from one Gemini wrote a moment ago. The
    mission itself is identical either way: both went through the same validator.
    """

    lesson_id: str = Field(description="The lesson this mission belongs to.")
    lesson_slug: str
    lesson_number: int = Field(description="Its position along the world, as the map draws it.")
    world_slug: str = Field(description="`tracks.slug`, not the manifest's `worldId`.")
    stop: int = Field(
        ge=1,
        description="Which of the target concept's stops this lesson is. A concept is "
        "taught over several lessons and each gets its own scenario, so this is what "
        "distinguishes them.",
    )
    delivery: str = Field(
        description='How it was served: "prebuilt" (the prepared set), "reused" (an '
        'unplayed row from the pool) or "generated" (composed on this request).'
    )
    live: bool = Field(
        description="Whether generation was live for this call — `LIVE_MISSION_GENERATION` "
        "or `forceRegenerate`. True with `delivery: generated` means the student is "
        "playing something that did not exist before they asked."
    )


class ChallengeRequest(Schema):
    """The arena, for students who finished the roadmap. No scaffolding, shorter hint
    ladder, concepts mixed and weighted toward the weakest — a challenge should stretch,
    not flatter."""

    world_slug: str | None = Field(
        default=None,
        description="Restrict the arena to one world, e.g. 'cairo_metro'. Omit to mix "
        "across everything the student has unlocked.",
    )
    exclude_level_ids: list[str] = Field(
        default_factory=list, description="Recently played, to avoid repeats."
    )


class GenerateMissionRequest(Schema):
    """Explicit generation, as opposed to `/missions/next` which *decides* what is next.

    Every field is optional: with an empty body the server derives all of it from the
    student's plan and mastery. That is the "server narrows, the model chooses" rule —
    anything the client may pass here is a hint, and the server still bounds it against
    the world manifest before generation runs.
    """

    lesson_id: str | None = None
    concept: str | None = Field(default=None, description="Concept slug, e.g. 'loops'.")
    world_manifest_version: str | None = None
    scaffold_level: ScaffoldLevel | None = Field(
        default=None, description="Override the composer. Ignored unless the caller is a teacher."
    )
    locale: str = Field(default="ar-EG")


class GenerateMissionResponse(Schema):
    """Exercise-shaped, because this is what gets written to an `exercises` row.

    Deliberately flatter than `GeneratedMissionOut`: that one describes a mission chosen
    *for a student* and carries the per-student scaffold reasoning, this one describes the
    authored artefact.
    """

    mission_id: str
    title: str
    instructions: str
    starter_code: str
    test_cases: list[dict] = Field(
        default_factory=list,
        description="[{input, expectedOutput, isHidden?}] — the `exercises.testCases` shape.",
    )
    hints: list[str] = Field(
        default_factory=list,
        description="Authored fallback, one per rung. Used when the model is unavailable "
        "or the answer-leak assertion rejects its output.",
    )
    concepts: dict = Field(
        default_factory=dict, description='{"primary": slug, "carried": [slug, ...]}'
    )
    scaffold_plan: dict = Field(default_factory=dict)
    validated: bool = Field(
        description="Set by the Python validator, never by the model. False is never shipped to a student."
    )
    engine_version: str
