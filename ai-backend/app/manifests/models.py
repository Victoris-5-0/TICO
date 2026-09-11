"""Typed view of a world manifest.

A manifest is the closed set generation may draw from. Parsing it into these models
rather than passing dictionaries around buys two things:

* **Failures happen at boot, not mid-request.** A malformed manifest raises when the
  service starts, so a bad edit is caught by the deploy rather than by a child waiting
  on a mission.
* **The prompt builder cannot reach past the fence.** If the composer can only see a
  `Mechanic` object, it cannot accidentally offer the model a scene from another world.

Read `content/worlds/el_forn.yaml` alongside this; the comments there explain why each
section exists.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ManifestModel(BaseModel):
    """Strict by default. An unknown key in a manifest is a typo, not an extension."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class Scene(ManifestModel):
    id: str
    #: Path under `client/public/assets/`. A scene with no artwork renders blank, so
    #: `check_manifests.py` asserts the file exists.
    asset: str | None = None
    description_en: str | None = None
    description_ar: str | None = None
    #: Which vocabulary entries make sense here. A bakery yard has flour sacks, not
    #: customers, and a mission that mixes them reads as though nobody looked.
    supports_vocabulary: list[str] = Field(default_factory=list)


class Character(ManifestModel):
    id: str
    role: str
    asset: str | None = None
    name_ar: str | None = None
    description: str | None = None
    voice: str | None = None
    language: str | None = None
    #: Moments this character may have a generated line for.
    beats: list[str] = Field(default_factory=list)


class VocabularyEntry(ManifestModel):
    """One noun of the world, and what values it may plausibly take."""

    en: str
    ar: str
    type: str
    #: For numeric nouns. Generation picks inside this, so a bakery never bakes -4 loaves.
    plausible_range: list[int] | None = None
    #: For string nouns. A closed list, because invented Cairo districts read as fake.
    options: list[str] | None = None

    @model_validator(mode="after")
    def _numeric_or_categorical(self) -> VocabularyEntry:
        if self.type == "int" and self.plausible_range and len(self.plausible_range) != 2:
            raise ValueError("plausible_range must be [min, max]")
        return self


class Test(ManifestModel):
    """One assertion, in the shape Pyodide runs: call an expression, compare the result."""

    input: str
    expected: str
    name: str | None = None


class Mechanic(ManifestModel):
    """An authored template. Becomes one `mission_templates` row.

    The generator fills `param_schema` and writes the prose. It never invents a mechanic,
    never changes `target_concept`, and never alters the arity or types in `signature` —
    the tests call exactly that, so a renamed function produces tests nothing can pass.
    """

    id: str
    target_concept: str
    carried_concepts: list[str] = Field(default_factory=list)
    scenes: list[str]
    difficulty_band: int = Field(ge=1, le=10)
    signature: str
    goal_shape: str
    vocabulary_used: list[str] = Field(default_factory=list)
    param_schema: dict = Field(default_factory=dict)
    starter_template: str
    solution_template: str
    tests: list[Test]

    @model_validator(mode="after")
    def _enough_tests(self) -> Mechanic:
        if len(self.tests) < 2:
            # One test is almost always the happy path, which passes for the wrong
            # reasons. The second is where the empty list and the boundary live.
            raise ValueError(f"mechanic '{self.id}' needs at least 2 tests")
        return self


class SpriteSpec(ManifestModel):
    """One thing the client can draw."""

    asset: str | None = None
    #: True when there is no artwork and the client draws a DOM overlay instead. Two of
    #: the three worlds are entirely overlay-based, which is a real constraint on what
    #: generation may ask for.
    overlay: bool = False
    #: Can there be several of it? `tray: 5` only makes sense for a countable sprite.
    countable: bool = False
    max_shown: int | None = None
    states: list[str] = Field(default_factory=list)


class Visual(ManifestModel):
    """The closed vocabulary the client can draw and move.

    The second fence, and the contract with the frontend. Generation may only name a
    sprite, a state or an animation from here — a mission asking for artwork nobody drew
    renders as a dead screen while its code still looks perfectly correct, which is
    exactly the kind of failure nothing else would catch.
    """

    backdrop: str
    establishing: str | None = None
    sprites: dict[str, SpriteSpec] = Field(default_factory=dict)
    states: dict[str, list[str]] = Field(default_factory=dict)
    animations: list[str] = Field(default_factory=list)

    def can_draw(self, prop: str) -> bool:
        return prop in self.sprites

    def can_animate(self, name: str) -> bool:
        return name in self.animations


class Control(ManifestModel):
    """One button the player can actually press."""

    id: str
    label_en: str
    label_ar: str
    effect: str | None = None


class Simulation(ManifestModel):
    """The scene's own arithmetic, and the verbs it offers.

    The third fence. `visual` says what can be *drawn*; this says what is *true* about it
    once drawn, which is a different constraint and the one that was missing.

    A generated mission is a story about numbers, and the scene is already committed to
    its own: the bakery-v2 demo bakes eight loaves a batch and hands two to each customer,
    because `simulation.ts` says so and the sprites are placed accordingly. A mission that
    teaches `loaves_per_tray = 12` is not wrong in Python — it runs, it passes its tests,
    the validator is satisfied — and a child still watches a tray fill with eight loaves
    while being told there are twelve. Nothing else in the pipeline can catch that, because
    every part of it is individually correct.

    `quantities` is therefore a closed set of facts generation must agree with, and
    `controls` is a closed set of verbs it may ask the player to use. A mission needing a
    button the scene does not have is unplayable in a way the code does not reveal.
    """

    #: Fixed numbers the scene draws. Generation may use these values and must not
    #: contradict them. Keys are free-form because each world counts different things.
    quantities: dict[str, int] = Field(default_factory=dict)
    #: What the player can do. A mission expecting any other verb has no button.
    controls: list[Control] = Field(default_factory=list)
    #: Rules the scene enforces that are not a single number.
    rules: list[str] = Field(default_factory=list)

    def contradicts(self, name: str, value: int) -> bool:
        """True when `value` disagrees with a quantity the scene has already committed to."""
        known = self.quantities.get(name)
        return known is not None and known != value

    def has_control(self, control_id: str) -> bool:
        return any(c.id == control_id for c in self.controls)


class Constraints(ManifestModel):
    may_vary: list[str] = Field(default_factory=list)
    may_not_vary: list[str] = Field(default_factory=list)
    locale: str = "ar-EG"
    reading_age: str | None = None
    max_starter_lines: int = 12
    must_hold: list[str] = Field(default_factory=list)
    #: Vocabulary whose values are compared literally by Pyodide. "اخضر" without the
    #: hamza fails a test the student cannot see.
    exact_strings: list[str] = Field(default_factory=list)


class WorldInfo(ManifestModel):
    id: str
    name_en: str
    name_ar: str
    order: int
    #: Joins this file to `tracks.slug`. The one field that must match the database.
    track_slug: str
    mentor_persona: str | None = None
    premise_ar: str | None = None


class World(ManifestModel):
    """A whole manifest, parsed and self-consistent."""

    world: WorldInfo
    scenes: list[Scene]
    characters: list[Character] = Field(default_factory=list)
    vocabulary: dict[str, VocabularyEntry]
    visual: Visual
    #: Optional: only a world with a running interactive scene has one.
    simulation: Simulation | None = None
    #: What phase 3 says on the second and third mission of a concept, keyed by concept
    #: slug then by repetition. Authored, because generation would not stop defining the
    #: concept however it was asked — see the block in `el_forn.yaml`.
    concept_notes: dict[str, dict[int, str]] = Field(default_factory=dict)
    mechanics: list[Mechanic]
    carried_scaffold: dict[str, dict[str, str]] = Field(default_factory=dict)
    constraints: Constraints

    # ------------------------------------------------------------------ lookups

    @property
    def id(self) -> str:
        return self.world.id

    @property
    def track_slug(self) -> str:
        return self.world.track_slug

    def scene(self, scene_id: str) -> Scene | None:
        return next((s for s in self.scenes if s.id == scene_id), None)

    def mechanic(self, mechanic_id: str) -> Mechanic | None:
        return next((m for m in self.mechanics if m.id == mechanic_id), None)

    def mechanics_for(self, concept_slug: str) -> list[Mechanic]:
        """Mechanics that TEACH this concept, easiest first.

        Only `target_concept` counts. A mechanic that merely carries a concept is not a
        way to teach it — that is the whole point of the primary/carried distinction.
        """
        return sorted(
            (m for m in self.mechanics if m.target_concept == concept_slug),
            key=lambda m: m.difficulty_band,
        )

    def scaffold_for(self, concept_slug: str, level: str) -> str:
        """The pre-filled line for a carried concept at a scaffold level.

        Returns "" when the manifest has no entry, which is also what NONE means — a
        missing scaffold degrades to no scaffold rather than crashing a mission.
        """
        return (self.carried_scaffold.get(concept_slug) or {}).get(level, "")

    @model_validator(mode="after")
    def _internally_consistent(self) -> World:
        """Everything a mechanic names must exist in this file.

        This is the check that stops a mission being generated for a scene that has no
        artwork, or dressed in a noun nobody defined.
        """
        scene_ids = {s.id for s in self.scenes}
        vocab = set(self.vocabulary)
        problems: list[str] = []

        for s in self.scenes:
            for v in s.supports_vocabulary:
                if v not in vocab:
                    problems.append(f"scene '{s.id}' supports unknown vocabulary '{v}'")

        for m in self.mechanics:
            for sc in m.scenes:
                if sc not in scene_ids:
                    problems.append(f"mechanic '{m.id}' names unknown scene '{sc}'")
            for v in m.vocabulary_used:
                if v not in vocab:
                    problems.append(f"mechanic '{m.id}' uses unknown vocabulary '{v}'")
            if not m.scenes:
                problems.append(f"mechanic '{m.id}' has no scenes")

        # Every state a sprite declares must be listed, and vice versa, or the client
        # and the generator disagree about what a prop can look like.
        for prop, states in self.visual.states.items():
            if prop not in self.visual.sprites:
                problems.append(f"visual.states names '{prop}', which is not a sprite")
        if not self.visual.animations:
            problems.append("visual.animations is empty — nothing can react to code")

        if problems:
            raise ValueError(f"{self.world.id}: " + "; ".join(problems))
        return self
