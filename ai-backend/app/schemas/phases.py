"""The six-phase mission — the shape the client renders.

A mission is not one exercise. It is **one Egyptian scenario walked through six stages**,
with the help peeled away as the student goes. The scenario never changes; only how much
is done for them.

    1 ENCOUNTER      an NPC states the problem.        No code exists yet.
    2 EXPLORE        TICO asks questions about the     No code. Buttons only.
                     world; they reason it out.
    3 DISCOVER       the concept is named and          No code. A moment of credit.
                     explained. TICO is with them.
    4 UNDERSTAND     the finished code is shown —      They RUN it and watch the
                     read-only but runnable.           world work.
    5 GUIDED_CODING  the same code with blanks.        They fill them in and run.
    6 ADAPT_REMIX    the world changes and their       Their own code, now wrong.
                     code is now wrong.

## Why phase 4 is runnable

Cause and effect before responsibility. The student presses Run on code they did not
write and watches the oven light and the loaves appear. Now they know what "working"
looks like, so when phase 5 asks them to produce it, they are aiming at something they
have seen rather than at a description.

## The two closed vocabularies

Generation may only name things the client can draw. `WorldState.props` uses the world
manifest's vocabulary, and `WorldChange.animate` uses the manifest's animation list.
Anything else is rejected by the validator, so a mission can never ask for a sprite or a
motion that does not exist.
"""

from __future__ import annotations

from pydantic import Field, model_validator

from app.schemas.common import Schema

# --------------------------------------------------------------------------- world


class WorldState(Schema):
    """What the scene shows. Keys are world-manifest vocabulary; the client maps them
    to sprites.

    Values are counts for things you can have several of (`tray: 5`) or a state string
    for things with modes (`oven: "cold"`).
    """

    props: dict[str, int | str] = Field(
        default_factory=dict,
        description='e.g. {"tray": 5, "loaf": 0, "oven": "cold"}',
    )


class WorldChange(Schema):
    """What happens to the scene when the student's code runs.

    `animate` names one motion from the world manifest's closed list. If the client has
    no animation by that name, nothing moves — which is why the validator checks it
    against the manifest rather than trusting the model.
    """

    animate: str | None = Field(
        default=None,
        description='One of the manifest animations, e.g. "trays_into_oven".',
    )
    props: dict[str, int | str] = Field(
        default_factory=dict,
        description="The scene after running. Values may reference a variable from the "
        'student\'s code as "= total".',
    )
    caption_ar: str | None = Field(
        default=None, description="Optional floating label, e.g. '١٠٠ رغيف'."
    )


# ------------------------------------------------------------------------- phase 1


class PhaseEncounter(Schema):
    """A real problem, stated by someone who has it. No programming word appears."""

    speaker: str = Field(
        description="Character id from the world manifest, or 'tico' where the world "
        "has no NPC artwork."
    )
    speaker_name_ar: str
    line_ar: str = Field(description="Egyptian Arabic. One or two sentences.")
    cta_ar: str = Field(default="يلا نبدأ", description="The single button.")
    world: WorldState = Field(
        default_factory=WorldState,
        description="The scene at rest, mid-problem: oven cold, queue stuck.",
    )


# ------------------------------------------------------------------------- phase 2


class ExploreRound(Schema):
    """One question TICO asks about the world. Buttons, never an editor."""

    question_ar: str
    options_ar: list[str] = Field(min_length=2, max_length=4)
    correct_index: int = Field(ge=0)
    nudge_ar: str = Field(
        description="What TICO says on a wrong answer. A narrower question, never a "
        "correction — this phase has no failure state."
    )
    highlight: list[str] = Field(
        default_factory=list,
        description="Props to light up while asking, so the question is about things "
        "they can see and count.",
    )

    @model_validator(mode="after")
    def _correct_index_in_range(self) -> ExploreRound:
        if self.correct_index >= len(self.options_ar):
            raise ValueError("correct_index points past the end of options_ar")
        return self


class PhaseExplore(Schema):
    """They reason before anything is explained, and discover the pattern themselves."""

    tico_intro_ar: str = Field(description="TICO opens. Curious, not testing.")
    rounds: list[ExploreRound] = Field(min_length=1, max_length=3)


# ------------------------------------------------------------------------- phase 3


class PhaseDiscover(Schema):
    """Name what they just did. Credit, not a lesson."""

    concept_slug: str = Field(description="Must match a real concepts.slug.")
    concept_name_ar: str
    explanation_ar: str = Field(description="Three lines at most. No syntax yet.")
    tico_line_ar: str = Field(default="برافو!")


# ------------------------------------------------------------------------- phase 4


class CodeAnnotation(Schema):
    """A line of code tied to a thing in the scene. This link is the whole lesson."""

    line: int = Field(ge=1)
    text_ar: str
    points_at: str | None = Field(
        default=None, description="Prop name the line refers to, for a connector line."
    )


class PhaseUnderstand(Schema):
    """The finished code, read-only — but they press Run and watch it work."""

    intro_ar: str = Field(default="كده بالظبط بنكتبها في بايثون")
    code: str = Field(description="The complete working solution. Nothing is hidden.")
    annotations: list[CodeAnnotation] = Field(default_factory=list)
    run_label_ar: str = Field(default="شغّل وشوف")
    on_run: WorldChange = Field(
        description="What the student watches happen. The point of the phase."
    )


# ------------------------------------------------------------------------- phase 5


class GuidedStep(Schema):
    """The same code with something taken out. Step A takes one value; step B takes more."""

    code: str = Field(
        description="Code with `___` marking each blank, in order."
    )
    blanks: list[str] = Field(
        min_length=1, description="What belongs in each `___`, in order."
    )
    prompt_ar: str = Field(description="What to do, in one line.")
    hint_ar: str | None = Field(
        default=None, description="A first nudge before the hint ladder is called."
    )

    @model_validator(mode="after")
    def _blanks_match_placeholders(self) -> GuidedStep:
        found = self.code.count("___")
        if found != len(self.blanks):
            raise ValueError(
                f"code has {found} blanks but {len(self.blanks)} answers were given"
            )
        return self


class MissionTest(Schema):
    """One check the runner performs. `expected` is derived by running the solution."""

    call: str
    expected: str
    name: str | None = None
    hidden: bool = False


class PhaseGuided(Schema):
    """Their first typing, and it is one blank. Never 'now write the whole program'."""

    steps: list[GuidedStep] = Field(min_length=1, max_length=3)
    solution_code: str = Field(description="Used to check their attempt, never shown.")
    tests: list[MissionTest] = Field(min_length=2)
    on_run: WorldChange


# ------------------------------------------------------------------------- phase 6


class PhaseRemix(Schema):
    """The world changes and their code is now wrong.

    `starting_code` is the phase-5 solution — the client loads it into the editor and
    **does not reset it**. That is what makes this feel like the world moved rather than
    a new exercise arriving.
    """

    twist_ar: str = Field(description="The event, as the world announces it.")
    new_requirement_ar: str = Field(description="What must now also be true.")
    world_change: WorldChange = Field(
        description="What visibly changed — a burnt tray, an ambulance."
    )
    starting_code: str = Field(description="Their working code from phase 5.")
    solution_code: str = Field(description="What it needs to become.")
    tests: list[MissionTest] = Field(
        min_length=2,
        description="Old tests plus new ones. Their earlier behaviour must not break.",
    )
    on_run: WorldChange


# --------------------------------------------------------------------------- whole


class MissionPhases(Schema):
    """All six, for one scenario."""

    encounter: PhaseEncounter
    explore: PhaseExplore
    discover: PhaseDiscover
    understand: PhaseUnderstand
    guided: PhaseGuided
    remix: PhaseRemix


class PhasedMissionOut(Schema):
    """What `POST /v1/missions/next` returns.

    `validated` is set by a Python validator that actually runs the code at every stage.
    An unvalidated mission is never returned, so the client never has to defend against
    an unsolvable one.
    """

    id: str
    world_id: str
    scene_id: str
    target_concept_id: str
    carried_concept_ids: list[str] = Field(default_factory=list)

    title_ar: str
    source: str = Field(description='"model" when Gemini wrote it, "template" on fallback.')
    validated: bool

    phases: MissionPhases

    #: concept -> NONE | PARTIAL | FULL, for the carried concepts only.
    scaffold: dict[str, str] = Field(default_factory=dict)
    difficulty_band: int = Field(default=5, ge=1, le=10)
