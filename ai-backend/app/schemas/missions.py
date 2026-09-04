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

    brief: str = Field(description="The situation, in TICO's voice.")
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
    """The student comes from the verified JWT, never from the body."""

    force_regenerate: bool = Field(
        default=False, description="Skip reuse and compose a fresh scenario. Costs a model call."
    )


class ChallengeRequest(Schema):
    """The arena, for students who finished the roadmap. No scaffolding, shorter hint
    ladder, concepts mixed and weighted toward the weakest — a challenge should stretch,
    not flatter."""

    exclude_level_ids: list[str] = Field(
        default_factory=list, description="Recently played, to avoid repeats."
    )
