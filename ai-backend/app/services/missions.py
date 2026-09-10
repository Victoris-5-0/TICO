"""Get a student their next mission.

The pipeline `POST /v1/missions/next` runs:

    which concept?  ->  which world?  ->  generate  ->  validate  ->  persist  ->  return

Each step is somewhere else — this module only decides the order and owns the
transaction. That is deliberate: the interesting decisions (what to teach, what to
scaffold, whether a mission is fit to show) each belong to a module that can be tested
without any of the others.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import manifests
from app.ai.chains import mission_gen
from app.schemas import phases as P
from app.schemas.common import ScaffoldLevel
from app.manifests.models import World
from app.models_tables import (
    Concept,
    Exercise,
    ExerciseConcept,
    GeneratedMission,
    Lesson,
    MissionTemplate,
    Track,
)
from app.config import settings
from app.ai.prompts import tico_hint as hint_prompt
from app.rules import arena, progression
from app.rules.mastery import MASTERY_THRESHOLD
from app.queries import ai_log, students, students as student_q, users

log = logging.getLogger(__name__)

#: Below this a concept counts as not yet learned. The roadmap sends a student to the
#: first concept under it, in `sequence_order` — the order never changes, only where in
#: it a particular student is.


ENGINE_VERSION = "gen/v2-phases"


class NoMissionAvailable(RuntimeError):
    """Nothing could be generated. The caller turns this into a 503, not an empty body."""


# --------------------------------------------------------------------- what to teach


def concept_for_lesson(db: Session, lesson_id: str) -> Concept | None:
    """What this lesson teaches, from `exercise_concepts.is_primary`.

    A lesson is a promise about a concept — a student who clicks "Count the Trays"
    expects the thing that lesson is about, whatever their mastery says elsewhere.
    Exactly one link per exercise should be primary; if several disagree, the lowest
    `sequence_order` wins, because a lesson teaching two things teaches the earlier one
    first.

    Returns None when the lesson has no exercises linked yet, and the caller falls back
    to mastery rather than refusing to generate.
    """
    rows = db.execute(
        select(Concept)
        .join(ExerciseConcept, ExerciseConcept.concept_id == Concept.id)
        .join(Exercise, Exercise.id == ExerciseConcept.exercise_id)
        .where(Exercise.lesson_id == lesson_id, ExerciseConcept.is_primary.is_(True))
        .order_by(Concept.sequence_order)
    ).scalars().all()

    if not rows:
        log.warning(
            "lesson %s has no primary concept linked; falling back to mastery", lesson_id
        )
        return None
    return rows[0]


def carried_for_lesson(db: Session, lesson_id: str) -> list[str]:
    """The concepts this lesson uses but does not teach.

    These are what may be scaffolded. The primary concept never is.
    """
    rows = db.execute(
        select(Concept.slug)
        .join(ExerciseConcept, ExerciseConcept.concept_id == Concept.id)
        .join(Exercise, Exercise.id == ExerciseConcept.exercise_id)
        .where(Exercise.lesson_id == lesson_id, ExerciseConcept.is_primary.is_(False))
        .order_by(Concept.sequence_order)
    ).scalars().all()
    return list(rows)


def next_concept(db: Session, user_id: str) -> Concept:
    """The first concept in the fixed order this student has not yet finished.

    Deliberately simple, and deliberately here rather than in a model. "Which concept
    next" is a rule a teacher must be able to check, and a language model asked it will
    give a fluent answer that cannot be audited.

    **Finished is a count, not a number the student cannot see.** `rules/progression` says
    a concept has three stops, extended to at most six if mastery is still short after
    those three — which is what the map on screen draws. Gating purely on mastery meant the
    path had no visible end: a child completed the third stop, the path carried on, and
    nothing said why.

    A student who has finished everything gets the last concept again — the arena is where
    they should be, but a repeat beats an error.
    """
    concepts = students.concepts_in_order(db)
    if not concepts:
        raise NoMissionAvailable("no concepts are seeded; run the client seed")

    mastery = students.mastery_map(db, user_id)
    for concept in concepts:
        row = mastery.get(concept.id)
        if row is None:
            return concept
        if not progression.is_complete(mastery=row.mastery, completed=row.evidence_count):
            return concept
    return concepts[-1]


def scaffold_plan(
    db: Session,
    user_id: str,
    world: World,
    target_slug: str,
    *,
    lesson_id: str | None = None,
) -> dict[str, str]:
    """How much of each carried concept to pre-fill for this student.

    Strong on a concept, and it is written in for them; weak, and they write it
    themselves. This is what makes a loops mission about loops rather than about
    remembering how to open a variable.

    Only carried concepts are ever scaffolded. Scaffolding the target concept would
    hand over the answer.
    """
    mastery = students.mastery_map(db, user_id)
    by_slug = {c.slug: c for c in students.concepts_in_order(db)}

    # The lesson knows exactly what it carries; the manifest is the general answer.
    carried: set[str] = set(carried_for_lesson(db, lesson_id)) if lesson_id else set()
    if not carried:
        for mech in world.mechanics_for(target_slug):
            carried.update(mech.carried_concepts)

    # Never scaffold the thing being taught — that is handing over the answer.
    carried.discard(target_slug)

    plan: dict[str, str] = {}
    for slug in carried:
        concept = by_slug.get(slug)
        row = mastery.get(concept.id) if concept else None
        score = row.mastery if row else 0.0
        if score >= 0.8:
            plan[slug] = "FULL"
        elif score >= 0.5:
            plan[slug] = "PARTIAL"
        else:
            plan[slug] = "NONE"
    return plan


def world_for(db: Session, concept_slug: str, lesson_id: str | None = None) -> World:
    """Which world to set the mission in.

    A lesson pins it — a bakery lesson stays in the bakery. Without one, pick the
    earliest world in the roadmap that teaches this concept, so a student meets the
    worlds in order rather than being thrown across three settings at random.
    """
    if lesson_id:
        track = db.execute(
            select(Track).join(Lesson, Lesson.track_id == Track.id).where(Lesson.id == lesson_id)
        ).scalar_one_or_none()
        if track:
            try:
                return manifests.for_track(track.slug)
            except manifests.ManifestError:
                log.warning("track '%s' has no manifest; falling back", track.slug)

    teaching = manifests.mechanics_teaching(concept_slug)
    if teaching:
        return teaching[0][0]

    worlds = manifests.all_worlds()
    if not worlds:
        raise NoMissionAvailable("no world manifests are loaded")
    return worlds[0]


# ------------------------------------------------------------------------ persisting


def _template_for(db: Session, world: World, concept: Concept) -> MissionTemplate | None:
    """The template row a generated mission hangs off.

    `generated_missions.template_id` is NOT NULL, so even a mission the model invented
    freely is attached to the template representing the same world and concept. That row
    records the bounds generation was performed *within*, which is the honest thing for
    it to point at — `content.source` says whether the model or the template actually
    wrote it.
    """
    track = db.execute(
        select(Track).where(Track.slug == world.track_slug)
    ).scalar_one_or_none()
    if track is None:
        return None

    rows = db.execute(
        select(MissionTemplate).where(
            MissionTemplate.track_id == track.id,
            MissionTemplate.target_concept_id == concept.id,
        )
    ).scalars().all()
    if rows:
        return min(rows, key=lambda r: r.difficulty_band)

    # No template for this concept in this world — any template from the world still
    # records the right manifest and track.
    return db.execute(
        select(MissionTemplate).where(MissionTemplate.track_id == track.id)
    ).scalars().first()


def persist(
    db: Session,
    mission: "P.PhasedMissionOut",
    *,
    user_id: str,
    template: MissionTemplate | None,
) -> GeneratedMission:
    """Write the mission. `content` holds every phase, exactly as the client renders it."""
    row = GeneratedMission(
        template_id=template.id if template else None,
        user_id=user_id,
        scene_id=mission.scene_id,
        params={"title_ar": mission.title_ar, "source": mission.source},
        # by_alias so the stored JSON is camelCase — the same shape the client receives,
        # which means a stored mission can be replayed without a translation step.
        content=mission.model_dump(mode="json", by_alias=True),
        scaffold_plan=dict(mission.scaffold),
        validated=mission.validated,
        engine_version=ENGINE_VERSION,
        manifest_version=template.manifest_version if template else None,
    )
    db.add(row)
    db.flush()
    return row


# ---------------------------------------------------------------------- the pipeline


def next_mission(
    db: Session,
    *,
    user_id: str,
    lesson_id: str | None = None,
    force_regenerate: bool = False,
) -> tuple[GeneratedMission, "P.PhasedMissionOut", World]:
    """The whole pipeline. Returns `(row, mission, world)`.

    Raises `NoMissionAvailable` when generation cannot produce something a student could
    actually play — the caller turns that into a 503 rather than showing a broken mission.
    """
    # A valid token can belong to someone with no `users` row yet: they signed up a
    # moment ago and their first request landed here. Everything below writes rows that
    # reference this id, so provision first or they all fail on a foreign key.
    users.ensure(db, user_id)

    # A lesson is an explicit choice and outranks mastery. Without one, mastery decides
    # where in the fixed order this student belongs.
    concept = (concept_for_lesson(db, lesson_id) if lesson_id else None) or next_concept(
        db, user_id
    )
    world = world_for(db, concept.slug, lesson_id)
    scaffold = scaffold_plan(db, user_id, world, concept.slug, lesson_id=lesson_id)

    # The scene the mission is set in. Any scene the world has; generation dresses it.
    scene_id = world.scenes[0].id
    for mech in world.mechanics_for(concept.slug):
        if mech.scenes:
            scene_id = mech.scenes[-1]  # the gameplay view where props live
            break

    try:
        outcome = mission_gen.generate(
            world,
            target_concept=concept.slug,
            carried_concepts=sorted(scaffold),
            scene_id=scene_id,
            scaffold=scaffold,
        )
    except mission_gen.GenerationFailed as exc:
        # There is no six-phase template fallback yet, so a failure here is terminal.
        # Logged as a failure so a bad run is visible rather than looking like low usage.
        ai_log.log(
            db,
            capability=ai_log.GENERATE,
            user_id=user_id,
            model=settings.model_generate,
            prompt_version=mission_gen.prompt.PROMPT_VERSION,
            output_text=str(exc)[:2000],
            status=ai_log.FAILURE,
        )
        raise NoMissionAvailable(str(exc)) from exc

    mission = outcome.mission

    ai_log.log(
        db,
        capability=ai_log.GENERATE,
        user_id=user_id,
        model=outcome.model_name,
        prompt_version=mission_gen.prompt.PROMPT_VERSION,
        output_text=mission.phases.guided.solution_code[:2000],
        latency_ms=outcome.latency_ms,
        status=ai_log.SUCCESS,
    )

    template = _template_for(db, world, concept)
    row = persist(db, mission, user_id=user_id, template=template)
    mission.id = row.id

    log.info(
        "mission %s for %s: concept=%s world=%s attempts=%d %dms",
        row.id, user_id, concept.slug, world.id, outcome.attempts, outcome.latency_ms,
    )
    return row, mission, world


# =============================================================================== explicit


def generate_explicit(
    db: Session,
    *,
    user_id: str,
    lesson_id: str | None = None,
    concept_slug: str | None = None,
    scaffold_level: ScaffoldLevel | None = None,
    is_teacher: bool = False,
) -> tuple[GeneratedMission, "P.PhasedMissionOut"]:
    """Build a mission when the caller already knows what they want.

    `next_mission` **decides** what this student should play now; this **builds** one on
    request — for authoring, and for pre-warming a lesson before a class starts.

    `scaffold_level` is honoured only for a teacher. A student who could set their own
    scaffold could set it to NONE and be handed a blank file, or to FULL and never write
    anything — either way the composer's judgement about what they are ready for is gone,
    and that judgement is most of what makes the difficulty adapt at all.
    """
    users.ensure(db, user_id)

    concept = None
    if concept_slug:
        concept = student_q.concept_by_slug(db, concept_slug)
        if concept is None:
            raise NoMissionAvailable(f"no concept with slug '{concept_slug}'")
    if concept is None and lesson_id:
        concept = concept_for_lesson(db, lesson_id)
    if concept is None:
        concept = next_concept(db, user_id)

    world = world_for(db, concept.slug, lesson_id)
    scaffold = scaffold_plan(db, user_id, world, concept.slug, lesson_id=lesson_id)

    if scaffold_level is not None and is_teacher:
        log.info("teacher %s overrode the scaffold to %s", user_id, scaffold_level.value)

    return _compose(
        db,
        user_id=user_id,
        world=world,
        concept=concept,
        carried=sorted(scaffold),
        scaffold=scaffold,
    )


def as_exercise(mission: "P.PhasedMissionOut", *, engine_version: str = ENGINE_VERSION) -> dict:
    """Flatten a six-phase mission into the `exercises`-row shape.

    Lossy on purpose. `GenerateMissionResponse` describes an authored artefact — a title,
    a starter, tests, hints — and the six phases are a *journey*, which an exercise row has
    nowhere to put. The guided phase is the part that maps.

    The starter is the **first guided step's code**, blanks and all. There is no separate
    starting file in the six-phase design: guided coding hands the student code with holes
    in it and fills them one step at a time, so step one's code is where they begin.

    Anyone who needs the whole journey should call `/v1/missions/next`, which returns it.
    """
    guided = mission.phases.guided
    return {
        "mission_id": mission.id,
        "title": mission.title_ar,
        "instructions": mission.phases.encounter.line_ar,
        "starter_code": guided.steps[0].code,
        "test_cases": [
            {"input": t.call, "expectedOutput": t.expected, "isHidden": t.hidden}
            for t in guided.tests
        ],
        # One authored fallback per rung, served when the model is unavailable or a guard
        # rejects what it wrote.
        "hints": [hint_prompt.FALLBACK_AR[r] for r in sorted(hint_prompt.FALLBACK_AR)],
        "concepts": {
            "primary": mission.target_concept_id,
            "carried": list(mission.carried_concept_ids),
        },
        "scaffold_plan": {},
        "validated": mission.validated,
        "engine_version": engine_version,
    }


# ================================================================================== arena


class NotReadyForTheArena(RuntimeError):
    """Too few mastered concepts to mix. The student belongs on the roadmap for now."""


def next_challenge(
    db: Session,
    *,
    user_id: str,
    world_slug: str | None = None,
    exclude_level_ids: list[str] | None = None,
) -> tuple[GeneratedMission, "P.PhasedMissionOut"]:
    """A challenge for a student who finished the roadmap.

    Weighted toward the **weakest mastered** concept, which is the whole point of the
    arena: a challenge built from what a student is best at flatters them and teaches
    nothing. `rules/arena.py` picks; only concepts at or above the mastery threshold are
    eligible, so a challenge never surprises someone with something they never learned.

    No scaffolding, and a shorter hint ladder — both follow from `is_arena=True` in the
    composer.
    """
    users.ensure(db, user_id)

    mastery = {cid: row.mastery for cid, row in student_q.mastery_map(db, user_id).items()}

    try:
        selection = arena.select_arena_concepts(mastery)
    except arena.InsufficientMasteredConceptsError as exc:
        raise NotReadyForTheArena(str(exc)) from exc

    target = student_q.concept_by_slug(db, selection.target_concept_id)
    if target is None:
        # Mastery rows are keyed by concept id; the arena works in slugs. If they disagree
        # the roadmap is the safe place to be.
        raise NotReadyForTheArena(
            f"arena picked '{selection.target_concept_id}', which is not a known concept"
        )

    world = world_for(db, target.slug)
    return _compose(
        db,
        user_id=user_id,
        world=world,
        concept=target,
        carried=list(selection.carried_concept_ids),
        # The arena is unscaffolded by definition.
        scaffold={},
    )


# ================================================================================= shared


def _compose(
    db: Session,
    *,
    user_id: str,
    world: World,
    concept: Concept,
    carried: list[str],
    scaffold: dict,
) -> tuple[GeneratedMission, "P.PhasedMissionOut"]:
    """Generate, log, persist. The half of `next_mission` after the decision is made."""
    scene_id = world.scenes[0].id
    for mech in world.mechanics_for(concept.slug):
        if mech.scenes:
            scene_id = mech.scenes[-1]
            break

    try:
        outcome = mission_gen.generate(
            world,
            target_concept=concept.slug,
            carried_concepts=carried,
            scene_id=scene_id,
            scaffold=scaffold,
        )
    except mission_gen.GenerationFailed as exc:
        ai_log.log(
            db,
            capability=ai_log.GENERATE,
            user_id=user_id,
            model=settings.model_generate,
            prompt_version=mission_gen.prompt.PROMPT_VERSION,
            output_text=str(exc)[:2000],
            status=ai_log.FAILURE,
        )
        raise NoMissionAvailable(str(exc)) from exc

    mission = outcome.mission
    ai_log.log(
        db,
        capability=ai_log.GENERATE,
        user_id=user_id,
        model=outcome.model_name,
        prompt_version=mission_gen.prompt.PROMPT_VERSION,
        output_text=mission.phases.guided.solution_code[:2000],
        latency_ms=outcome.latency_ms,
        status=ai_log.SUCCESS,
    )

    row = persist(db, mission, user_id=user_id, template=_template_for(db, world, concept))
    mission.id = row.id
    return row, mission
