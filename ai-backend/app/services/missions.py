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
    PracticeSession,
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

#: `params.prebuilt` marks the prepared set: one validated mission per concept stop,
#: shared by every student rather than claimed, because the narration recorded for each
#: one has to match what is on screen for everybody.
PREBUILT = "prebuilt"


class NoMissionAvailable(RuntimeError):
    """Nothing could be generated. The caller turns this into a 503, not an empty body."""


class UnknownLesson(LookupError):
    """No such world, or no such stop along it. A 404 — the caller asked for a lesson
    that does not exist, which is not the same as generation failing."""


class GenerationDisabled(NoMissionAvailable):
    """`LIVE_MISSION_GENERATION` is off, so nothing here may call a model.

    A subclass of `NoMissionAvailable` on purpose: every caller already turns that into a
    503 with a fallback behind it, and "we will not generate" and "we could not generate"
    are the same event as far as a student is concerned. The message differs so an
    operator reading a log can tell a configuration choice from an outage.
    """


def require_generation(*, because: str) -> None:
    """Refuse unless generation has been deliberately switched on.

    Called immediately before every `mission_gen.generate` in this module — there are two,
    and between them they cover `/v1/missions/next`, `/v1/missions/by-lesson`,
    `/v1/missions/generate` and `/v1/challenges/next`.

    The gate lives here rather than in the routers because the routers are not the only
    way in: `scripts/pregenerate_missions.py` and the eval suite call the service
    directly, and a guard at the edge would have let both past while the endpoints looked
    protected.
    """
    if settings.live_mission_generation:
        return
    log.info("refusing to generate (%s): LIVE_MISSION_GENERATION is off", because)
    raise GenerationDisabled(
        "Mission generation is switched off on this service "
        "(LIVE_MISSION_GENERATION is not set). Missions are served from the prepared set "
        "and the validated pool only."
    )


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
    repetition: int = 1,
) -> GeneratedMission:
    """Write the mission. `content` holds every phase, exactly as the client renders it.

    `repetition` goes in `params`, not in `content`: it is how the row was made, not part
    of the mission the client renders, and `content` is a contract with the frontend. It
    is stored because `find_reusable` needs it — a second-attempt mission has a different
    phase 3 and is not interchangeable with a first.
    """
    row = GeneratedMission(
        template_id=template.id if template else None,
        user_id=user_id,
        scene_id=mission.scene_id,
        params={
            "title_ar": mission.title_ar,
            "source": mission.source,
            "repetition": repetition,
        },
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



def find_reusable(
    db: Session, *, user_id: str, world_id: str, concept_id: str, repetition: int
) -> tuple[GeneratedMission, "P.PhasedMissionOut"] | None:
    """A validated mission for this concept the student has not played yet.

    **This is what makes pre-generation worth anything.** `force_regenerate` was a
    parameter that nothing read, so every call generated: twenty-five seconds and a Gemini
    request per mission, with a 503 whenever the model was busy. In front of a judge that
    is the whole demo.

    Matched on world, target concept and repetition, because a repeat is not
    interchangeable with a first attempt — phase 3 differs. Missions the student has
    already opened a session on are skipped so nobody is handed the same scenario twice.

    Anything unvalidated is ignored. A mission is only reusable if the validator ran the
    code and passed it.

    **The prepared set is not part of this pool.** Those rows are shared content
    addressed by stop — see `find_prebuilt` — and they were being handed out here as
    spares as well, which had two consequences. A prebuilt mission got claimed by
    whichever student asked first, so the mission behind a map node changed under the
    narration recorded for it; and `next_mission` stopped generating at all once the set
    existed, because there was always a "spare" to reuse.
    """
    played = set(
        db.execute(
            select(PracticeSession.generated_mission_id).where(
                PracticeSession.user_id == user_id,
                PracticeSession.generated_mission_id.isnot(None),
            )
        ).scalars()
    )

    rows = db.execute(
        select(GeneratedMission)
        .where(GeneratedMission.validated.is_(True))
        .order_by(GeneratedMission.created_at.desc())
        .limit(80)
    ).scalars()

    for row in rows:
        if row.id in played or not row.content:
            continue
        if (row.params or {}).get(PREBUILT):
            continue  # shared content, served by stop — see the docstring
        if row.content.get("worldId") != world_id:
            continue
        if row.content.get("targetConceptId") != concept_id:
            continue
        if int((row.params or {}).get("repetition") or 1) != repetition:
            continue
        try:
            mission = P.PhasedMissionOut.model_validate(row.content)
        except Exception:  # noqa: BLE001 - a row written by an older shape is not reusable
            continue
        mission.id = row.id
        log.info("reusing mission %s for %s (%s rep %d)", row.id, user_id, concept_id, repetition)
        return row, mission
    return None


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

    # Which of the concept's three stops this is, and what phase 3 already told them.
    repetition, already_taught = _repetition_context(db, user_id, concept.id)

    # Serve a pre-generated one if there is a suitable one going spare. Twenty-five
    # seconds and a model call saved, and no 503 if the model is having a bad afternoon —
    # which is the entire reason `scripts/pregenerate_missions.py` exists.
    #
    # `force_regenerate` skips that, but only where generating is actually permitted.
    # Honouring it with the gate shut would turn a request that had a perfectly good
    # mission waiting for it into a 503, which is the opposite of what the flag is for.
    if not (force_regenerate and settings.live_mission_generation):
        existing = find_reusable(
            db, user_id=user_id, world_id=world.id,
            concept_id=concept.id, repetition=repetition,
        )
        if existing is not None:
            row, mission = existing
            return row, mission, world

    # Nothing below this line is free. Checked before the scene is picked so a refusal
    # costs one branch rather than a half-built request.
    require_generation(because=f"/missions/next for {concept.slug}")

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
            repetition=repetition,
            already_taught=already_taught,
            speaker=_speaker_for(concept.id, repetition),
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
    row = persist(db, mission, user_id=user_id, template=template, repetition=repetition)
    mission.id = row.id

    log.info(
        "mission %s for %s: concept=%s world=%s attempts=%d %dms",
        row.id, user_id, concept.slug, world.id, outcome.attempts, outcome.latency_ms,
    )
    return row, mission, world


# ========================================================================= by the map

def lessons_in_world(db: Session, world_slug: str) -> list[Lesson]:
    """A world's lessons, in the order the map draws them.

    Raises `UnknownLesson` for a world that does not exist, so a typo in a slug is a 404
    naming the slug rather than an empty list that reads as "this world has no content".
    """
    track = db.execute(select(Track).where(Track.slug == world_slug)).scalar_one_or_none()
    if track is None:
        raise UnknownLesson(f"no world with slug '{world_slug}'")

    return list(
        db.execute(
            select(Lesson).where(Lesson.track_id == track.id).order_by(Lesson.order)
        ).scalars()
    )


def resolve_lesson(
    db: Session,
    *,
    world_slug: str,
    lesson_number: int | None = None,
    lesson_slug: str | None = None,
) -> tuple[Lesson, int]:
    """`(lesson, its position along the world)` from a slug or a stop number.

    **The number is a position, not `lessons.order`.** El-forn's orders run 1, 2, 4, 5 —
    lesson 3 was never written — and the map draws four stops, so a student counting
    nodes and the database disagree by one from the third stop on. The map is what the
    student can see, so the map wins and `order` stays an internal sort key.

    A slug outranks a number: a caller that already knows which lesson it wants should
    not have to depend on the count staying stable when a world gains a lesson.
    """
    lessons = lessons_in_world(db, world_slug)
    if not lessons:
        raise UnknownLesson(f"world '{world_slug}' has no lessons")

    if lesson_slug:
        for position, lesson in enumerate(lessons, start=1):
            if lesson.slug == lesson_slug:
                return lesson, position
        raise UnknownLesson(f"world '{world_slug}' has no lesson '{lesson_slug}'")

    if lesson_number is None:
        raise UnknownLesson("send either lessonNumber or lessonSlug")

    if not 1 <= lesson_number <= len(lessons):
        raise UnknownLesson(
            f"world '{world_slug}' has {len(lessons)} lessons; there is no stop {lesson_number}"
        )
    return lessons[lesson_number - 1], lesson_number


def stop_for_lesson(db: Session, *, track_id: str, concept_id: str, lesson_id: str) -> int:
    """Which of its concept's stops this lesson is, 1-based.

    A concept is taught over several lessons in a world — `opening-message` and
    `count-the-trays` both teach `variables` — and each deserves its own scenario. Keying
    the prepared set on the concept alone gave both lessons the identical mission, which
    makes the second stop a re-run of the first.

    Position among the *concept's* lessons, in curriculum order: its first lesson gets
    stop 1, its second gets stop 2. A lesson whose concept could not be resolved is
    stop 1.
    """
    # `order` is in the select list because Postgres requires it there under SELECT
    # DISTINCT, and a lesson with several exercises on the same concept would otherwise
    # appear more than once and shift every later stop.
    rows = db.execute(
        select(Lesson.id, Lesson.order)
        .join(Exercise, Exercise.lesson_id == Lesson.id)
        .join(ExerciseConcept, ExerciseConcept.exercise_id == Exercise.id)
        .where(
            Lesson.track_id == track_id,
            ExerciseConcept.concept_id == concept_id,
            ExerciseConcept.is_primary.is_(True),
        )
        .order_by(Lesson.order)
        .distinct()
    ).all()

    seen: list[str] = []
    for sibling_id, _ in rows:
        if sibling_id not in seen:
            seen.append(sibling_id)

    for index, sibling_id in enumerate(seen, start=1):
        if sibling_id == lesson_id:
            return index
    return 1


def find_prebuilt(
    db: Session, *, world_id: str, concept_id: str, stop: int
) -> tuple[GeneratedMission, "P.PhasedMissionOut"] | None:
    """The prepared mission for one concept stop, if the set covers it.

    Distinct from `find_reusable` in two ways that matter. It matches on the **stop**
    rather than on how many times this student has practised the concept, so the mission
    behind a given node on the map is the same one every time it is opened — which is
    what lets narration be recorded for it. And it does not skip rows other students have
    played, because the prepared set is shared content, not a pool of one-use scenarios.

    Returns None when the set has nothing for this stop, and the caller generates.
    """
    rows = db.execute(
        select(GeneratedMission)
        .where(GeneratedMission.validated.is_(True))
        .order_by(GeneratedMission.created_at)
    ).scalars()

    for row in rows:
        params = row.params or {}
        if not params.get(PREBUILT):
            continue
        if not row.content:
            continue
        if row.content.get("worldId") != world_id:
            continue
        if row.content.get("targetConceptId") != concept_id:
            continue
        if int(params.get("repetition") or 1) != stop:
            continue
        try:
            mission = P.PhasedMissionOut.model_validate(row.content)
        except Exception:  # noqa: BLE001 - a row written by an older shape is not playable
            continue
        # The row's id is the identity. Pre-generation wrote `content.id` as "", and
        # everything downstream keys off it — the narration URL, the session, the hint
        # call. Stamping the real one here fixes all of them at once.
        mission.id = row.id
        log.info("serving prebuilt mission %s (%s stop %d)", row.id, concept_id, stop)
        return row, mission
    return None


def for_lesson(
    db: Session,
    *,
    user_id: str,
    world_slug: str,
    lesson_number: int | None = None,
    lesson_slug: str | None = None,
    force_regenerate: bool = False,
) -> tuple[GeneratedMission, "P.PhasedMissionOut", dict]:
    """One lesson's mission, addressed the way the map addresses it.

    Returns `(row, mission, how)` where `how` carries the lesson it resolved to and how
    the mission was served — the client puts that in front of a judge, and it is also
    what makes the two paths debuggable when they disagree.

    Three sources, and which one runs depends on one setting:

      * `LIVE_MISSION_GENERATION` off (the default) — the prepared mission for this stop,
        one query and no model call. This is the demo path: the same scenario every time,
        so the recorded narration still matches the screen.
      * nothing prepared for this stop — an unplayed row from the pool, then generation,
        both via `next_mission`, so an unprepared world still plays.
      * `LIVE_MISSION_GENERATION` on, or `forceRegenerate` — straight to generation.
        Gemini writes a scenario, the validator runs its code, and the student plays
        something that did not exist when they clicked.

    Raises `UnknownLesson` for a bad world or stop, and `NoMissionAvailable` when
    generation was the only option left and could not produce something playable.
    """
    users.ensure(db, user_id)

    lesson, position = resolve_lesson(
        db, world_slug=world_slug, lesson_number=lesson_number, lesson_slug=lesson_slug
    )

    concept = concept_for_lesson(db, lesson.id) or next_concept(db, user_id)
    world = world_for(db, concept.slug, lesson.id)
    stop = stop_for_lesson(
        db, track_id=lesson.track_id, concept_id=concept.id, lesson_id=lesson.id
    )

    # `force_regenerate` asks to skip reuse; it does not grant permission to call a model.
    # It used to be OR'd into this, which meant any client could spend a Gemini call on a
    # service configured not to make them — the gate was a suggestion.
    live = bool(settings.live_mission_generation)
    if force_regenerate and not live:
        log.info(
            "ignoring forceRegenerate for %s/%s: LIVE_MISSION_GENERATION is off",
            world_slug, lesson.slug,
        )

    def described(row: GeneratedMission, mission: "P.PhasedMissionOut", delivery: str):
        return row, mission, {
            "lesson_id": lesson.id,
            "lesson_slug": lesson.slug,
            "lesson_number": position,
            "world_slug": world_slug,
            "stop": stop,
            "delivery": delivery,
            "live": live,
        }

    if not live:
        prepared = find_prebuilt(db, world_id=world.id, concept_id=concept.id, stop=stop)
        if prepared is not None:
            return described(*prepared, "prebuilt")
        log.info(
            "no prebuilt mission for %s stop %d in %s; falling through to the pipeline",
            concept.slug, stop, world.id,
        )

    # The same two steps `next_mission` takes, run here rather than delegated, because
    # this endpoint has to *report* which one happened. Asking `next_mission` afterwards
    # would mean guessing from the row, and a guess is exactly what `delivery` is for
    # replacing.
    # This endpoint answers an exact map click, not "what should I play next?". The
    # student's mastery may already be on repetition 2, but replaying the first lesson
    # must still reuse or generate repetition 1 when its pinned row is unavailable.
    _, already_taught = _repetition_context(db, user_id, concept.id)
    repetition = stop

    if not live:
        spare = find_reusable(
            db,
            user_id=user_id,
            world_id=world.id,
            concept_id=concept.id,
            repetition=repetition,
        )
        if spare is not None:
            return described(*spare, "reused")

    scaffold = scaffold_plan(db, user_id, world, concept.slug, lesson_id=lesson.id)
    row, mission = _compose(
        db,
        user_id=user_id,
        world=world,
        concept=concept,
        carried=sorted(scaffold),
        scaffold=scaffold,
        repetition=repetition,
        already_taught=already_taught,
    )
    return described(row, mission, "generated")


class MissionNotFound(LookupError):
    """No such mission, or not one this student may open. A 404 either way — telling an
    attacker apart from a typo is not worth confirming that a row exists."""


#: The account `scripts/pregenerate_missions.py` writes under. Its rows are prepared
#: content, not anybody's play, so they are readable by everyone.
CONTENT_PREP_USER = "system-content-prep"


def by_id(db: Session, *, user_id: str, mission_id: str) -> "P.PhasedMissionOut":
    """One stored mission, all six phases, as the player renders it.

    The counterpart to `for_lesson`: that decides *which* mission, this returns one the
    caller already has the id of — a student reloading the page, or coming back tomorrow
    to the mission in their address bar.

    Three things are refused, all as `MissionNotFound`, because none of them is something
    a student should be looking at:

      * no such row;
      * `validated` false — an unvalidated mission may be unsolvable, and an unsolvable
        mission in front of a child who is already unsure is the worst thing here;
      * a row claimed by a different student. Prepared and unclaimed rows are shared and
        stay readable.
    """
    row = db.get(GeneratedMission, mission_id)
    if row is None or not row.content:
        raise MissionNotFound(f"no mission '{mission_id}'")

    if not row.validated:
        raise MissionNotFound(f"mission '{mission_id}' has not been validated")

    if row.user_id not in (None, user_id, CONTENT_PREP_USER):
        raise MissionNotFound(f"no mission '{mission_id}'")

    try:
        mission = P.PhasedMissionOut.model_validate(row.content)
    except Exception as exc:  # noqa: BLE001
        # A row whose `content` lost its phases renders as six empty panels. Treat it as
        # missing rather than showing it.
        raise MissionNotFound(f"mission '{mission_id}' is not playable") from exc

    mission.id = row.id
    return mission


# =============================================================================== explicit


def generate_explicit(
    db: Session,
    *,
    user_id: str,
    lesson_id: str | None = None,
    concept_slug: str | None = None,
    scaffold_level: ScaffoldLevel | None = None,
    is_teacher: bool = False,
    repetition: int | None = None,
    already_taught: list[str] | None = None,
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

    derived_rep, derived_taught = _repetition_context(db, user_id, concept.id)
    repetition = repetition if repetition is not None else derived_rep
    taught = already_taught if already_taught is not None else derived_taught

    return _compose(
        db,
        user_id=user_id,
        world=world,
        concept=concept,
        carried=sorted(scaffold),
        scaffold=scaffold,
        repetition=repetition,
        already_taught=taught,
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



def _repetition_context(db: Session, user_id: str, concept_id: str) -> tuple[int, list[str]]:
    """Which stop of this concept the student is on, and what phase 3 already told them.

    The number is `concept_mastery.evidence_count + 1` — the same count the map draws, so
    phase 3 and the path on screen cannot disagree about which of the three this is.

    The explanations come from the student's own earlier missions on this concept. Without
    them the model reworded the definition every time: three missions on `variables` each
    opened by explaining what a variable is, and a child who played all three was taught
    the same sentence three times.
    """
    row = student_q.mastery_for(db, user_id, concept_id)
    repetition = (row.evidence_count if row else 0) + 1

    if repetition <= 1:
        return 1, []

    previous = db.execute(
        select(GeneratedMission.content)
        .where(GeneratedMission.user_id == user_id)
        .order_by(GeneratedMission.created_at.desc())
        .limit(12)
    ).scalars()

    taught: list[str] = []
    for content in previous:
        if not content or content.get("targetConceptId") != concept_id:
            continue
        explanation = (content.get("phases") or {}).get("discover", {}).get("explanationAr")
        if explanation:
            taught.append(explanation)
    return repetition, taught



#: Who opens phase 1, by repetition. Hassan is the baker and belongs behind the oven, so
#: he is not in the rotation — a mission about counting somebody's order belongs to the
#: person waiting for it. Salma runs the queue and is likewise not a customer.
#:
#: A fixed rotation rather than a random pick: three missions on a concept then always
#: introduce three different people, which is the thing that was actually wanted.
_SPEAKERS = ["mariam", "omar", "dina", "youssef", "amina", "nour", "hoda", "farid"]


def _speaker_for(concept_id: str, repetition: int) -> str:
    """A different customer for each of a concept's three stops.

    Chosen here rather than asked for. Seven missions out of seven opened with Hassan when
    the customers had no descriptions, and three out of three opened with Mariam once they
    did — a model has no memory of the previous mission, so "vary this" is not an
    instruction it can follow.
    """
    offset = sum(ord(c) for c in concept_id)
    return _SPEAKERS[(offset + max(repetition, 1) - 1) % len(_SPEAKERS)]


def _apply_authored_note(mission, world: World, concept_slug: str, repetition: int) -> None:
    """Replace phase 3's explanation with the authored one, on repeats.

    Written over after generation rather than asked for in the prompt, because asking did
    not work: four prompt shapes, and the model defined the concept every time. This cannot
    be ignored.

    The first mission keeps whatever the model wrote — an introduction should suit the
    scenario it arrives in. A concept with no authored note keeps it too.
    """
    if repetition < 2:
        return
    note = (world.concept_notes.get(concept_slug) or {}).get(repetition)
    if not note:
        return
    mission.phases.discover.explanation_ar = " ".join(note.split())


def _compose(
    db: Session,
    *,
    user_id: str,
    world: World,
    concept: Concept,
    carried: list[str],
    scaffold: dict,
    repetition: int = 1,
    already_taught: list[str] | None = None,
) -> tuple[GeneratedMission, "P.PhasedMissionOut"]:
    """Generate, log, persist. The half of `next_mission` after the decision is made."""
    # The shared door. `for_lesson`, `generate_explicit` and `next_challenge` all arrive
    # here, so one check covers three endpoints.
    require_generation(because=f"composing {concept.slug} in {world.id}")

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
            repetition=repetition,
            already_taught=already_taught,
            speaker=_speaker_for(concept.id, repetition),
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

    # Phase 3 on a repeat is authored, not generated. Applied before persisting so the row
    # and the response carry the same text.
    _apply_authored_note(mission, world, concept.slug, repetition)

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

    row = persist(db, mission, user_id=user_id,
                  template=_template_for(db, world, concept), repetition=repetition)
    mission.id = row.id
    return row, mission
