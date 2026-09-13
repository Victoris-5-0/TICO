"""The mission pipeline against a real database.

`/v1/missions/next` stopped being a stub: it picks a concept from the student's mastery,
generates a mission, validates it by running the code, and persists it. That needs a
database, so these skip when none is reachable — `test_generation.py` covers the parts
that work offline.

Gemini is stubbed for all but one of these, using the real generated mission committed at
`docs/example-mission-response.json`. What they are about is **selection, persistence and
logging** — which concept gets chosen, whether the row is written, whether the call is
logged — and none of that needs a live model. Whether Gemini writes *good* missions is a
question for an eval, not for a test that runs on every push.

`test_the_pipeline_produces_and_persists_a_valid_mission` is the exception: it calls the
real model, because "the whole thing works end to end" cannot be proved with a stub. It is
marked `slow`, so `-m "not slow"` skips it.
"""

from __future__ import annotations

import os
import pathlib

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app import manifests
from app.models_tables import Concept, ConceptMastery, GeneratedMission, User
from app.services import missions as svc

DB_URL = os.environ.get("REAL_DATABASE_URL") or os.environ.get("TEST_DATABASE_URL")


def _reachable(url: str) -> bool:
    try:
        with create_engine(url, connect_args={"connect_timeout": 8}).connect() as c:
            c.execute(text("select 1"))
        return True
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(
    not DB_URL or not _reachable(DB_URL),
    reason="no reachable database (set REAL_DATABASE_URL to run these)",
)


@pytest.fixture(scope="session")
def engine():
    e = create_engine(DB_URL, connect_args={"connect_timeout": 15}, pool_size=2, max_overflow=0)
    yield e
    e.dispose()


@pytest.fixture
def db(engine):
    """Rolled back after every test, so nothing here reaches the real data."""
    conn = engine.connect()
    trans = conn.begin()
    s = Session(bind=conn)
    try:
        yield s
    finally:
        s.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def student(db) -> User:
    u = User(email="pytest-missions@tico.invalid", name="pytest")
    db.add(u)
    db.flush()
    return u


# ------------------------------------------------------------------ concept choice


def test_a_new_student_starts_at_the_first_concept(db, student):
    """No mastery anywhere means the beginning of the fixed order."""
    assert svc.next_concept(db, student.id).sequence_order == 1


def test_mastery_advances_the_student_through_the_fixed_order(db, student):
    concepts = {c.slug: c for c in db.execute(select(Concept)).scalars()}

    db.add(ConceptMastery(user_id=student.id, concept_id=concepts["variables"].id,
                          mastery=0.9, confidence=0.8, evidence_count=6))
    db.flush()
    assert svc.next_concept(db, student.id).slug == "conditionals"

    db.add(ConceptMastery(user_id=student.id, concept_id=concepts["conditionals"].id,
                          mastery=0.85, confidence=0.8, evidence_count=5))
    db.flush()
    assert svc.next_concept(db, student.id).slug == "loops"


def test_partial_mastery_does_not_advance(db, student):
    """Below the threshold the student stays where they are. Half-learned is not learned."""
    concepts = {c.slug: c for c in db.execute(select(Concept)).scalars()}
    db.add(ConceptMastery(user_id=student.id, concept_id=concepts["variables"].id,
                          mastery=0.5, confidence=0.4, evidence_count=3))
    db.flush()
    assert svc.next_concept(db, student.id).slug == "variables"


# -------------------------------------------------------------------- scaffolding


def test_scaffold_reflects_what_the_student_knows(db, student):
    """Strong on a carried concept, and it gets written in for them."""
    world = manifests.get("el_mahatta")
    concepts = {c.slug: c for c in db.execute(select(Concept)).scalars()}

    db.add(ConceptMastery(user_id=student.id, concept_id=concepts["variables"].id,
                          mastery=0.95, confidence=0.9, evidence_count=10))
    db.flush()

    plan = svc.scaffold_plan(db, student.id, world, "loops")
    assert plan.get("variables") == "FULL"


def test_a_weak_student_gets_no_scaffold(db, student):
    world = manifests.get("el_mahatta")
    plan = svc.scaffold_plan(db, student.id, world, "loops")
    assert set(plan.values()) <= {"NONE"}


def test_the_target_concept_is_never_scaffolded(db, student):
    """Scaffolding the thing being taught would hand over the answer."""
    world = manifests.get("el_mahatta")
    concepts = {c.slug: c for c in db.execute(select(Concept)).scalars()}
    for slug in ("variables", "conditionals", "loops"):
        db.add(ConceptMastery(user_id=student.id, concept_id=concepts[slug].id,
                              mastery=0.99, confidence=0.9, evidence_count=10))
    db.flush()

    assert "loops" not in svc.scaffold_plan(db, student.id, world, "loops")


# ------------------------------------------------------------------- world choice


def test_world_selection_prefers_the_earliest_world_teaching_it(db):
    world = svc.world_for(db, "conditionals")
    assert any(m.target_concept == "conditionals" for m in world.mechanics)



# --------------------------------------------------------------------------- the stub

EXAMPLE_MISSION = pathlib.Path(__file__).resolve().parents[1] / "docs" / "example-mission-response.json"


@pytest.fixture
def stub_model(monkeypatch):
    """Return the committed example mission instead of calling Gemini.

    A real mission, generated by the real pipeline and checked in — so these tests run
    against the shape the service actually produces rather than a hand-written fake that
    can drift away from it.

    Opens the `LIVE_MISSION_GENERATION` gate for the test's duration. A test that stubs
    the model is a test *about* the generation path, so it opts in the same way
    `scripts/pregenerate_missions.py` does — and leaving the gate shut here would have
    made every one of them fail for the wrong reason.
    """
    import json

    from app.ai.chains import mission_gen
    from app.config import settings
    from app.schemas import phases as P

    monkeypatch.setattr(settings, "live_mission_generation", True)

    payload = json.loads(EXAMPLE_MISSION.read_text(encoding="utf-8"))["data"]

    def _generate(world, *, target_concept, carried_concepts, scene_id, scaffold, **kw):
        mission = P.PhasedMissionOut.model_validate(payload)
        # Follow whatever the caller decided, so the selection tests are still meaningful.
        mission.world_id = world.id
        mission.scene_id = scene_id
        mission.target_concept_id = target_concept
        mission.carried_concept_ids = list(carried_concepts)
        mission.scaffold = dict(scaffold)
        return mission_gen.GenerationOutcome(
            mission=mission,
            source="model",
            attempts=1,
            latency_ms=1234,
            model_name="stub",
        )

    monkeypatch.setattr(mission_gen, "generate", _generate)
    monkeypatch.setattr(svc.mission_gen, "generate", _generate)
    return _generate


# ---------------------------------------------------------------- the whole thing


@pytest.mark.slow
def test_the_pipeline_produces_and_persists_a_valid_mission(db, student, live_model):
    """The real thing: Gemini writes six phases, the validator runs the code, the row lands.

    The only test here that calls the model. Takes 20-30 seconds and costs money, so it
    needs `TICO_LIVE_MODEL=1` as well as a database — but a pipeline that is only ever
    exercised with a stub is not a pipeline anyone has checked.

        TICO_LIVE_MODEL=1 REAL_DATABASE_URL=... pytest tests/test_missions_live.py -m slow
    """
    row, mission, world = svc.next_mission(db, user_id=student.id)

    assert mission.source == "model"
    assert row.validated is True, "an unvalidated mission must never be persisted"
    assert mission.validated is True

    # Persisted with everything the client needs to render all six phases.
    stored = db.get(GeneratedMission, row.id)
    assert stored is not None
    assert stored.user_id == student.id
    assert stored.scene_id == mission.scene_id
    assert stored.engine_version == svc.ENGINE_VERSION

    phases = stored.content["phases"]
    assert set(phases) == {"encounter", "explore", "discover", "understand", "guided", "remix"}
    assert phases["guided"]["solutionCode"]
    assert len(phases["guided"]["tests"]) >= 1


def test_the_persisted_mission_is_actually_solvable(db, student, stub_model):
    """The strongest assertion available: run the stored solution against the stored tests.

    An unsolvable mission in front of a child who is already unsure is the worst thing this
    system can do, so this runs the code rather than trusting `validated`.
    """
    from app.ai import sandbox

    row, _, _ = svc.next_mission(db, user_id=student.id)
    guided = row.content["phases"]["guided"]

    ok, failures = sandbox.passes(
        guided["solutionCode"],
        [(t["call"], t["expected"]) for t in guided["tests"]],
    )
    assert ok, f"a stored mission is unsolvable: {failures}"


def test_the_stored_remix_really_does_break_their_code(db, student, stub_model):
    """Phase 6 hands back the phase-5 solution and changes the rules under it.

    If the old solution still passed the new tests there would be nothing to adapt, and the
    twist would be a cutscene rather than a lesson.
    """
    from app.ai import sandbox

    row, _, _ = svc.next_mission(db, user_id=student.id)
    remix = row.content["phases"]["remix"]

    ok, _ = sandbox.passes(
        remix["startingCode"],
        [(t["call"], t["expected"]) for t in remix["tests"]],
    )
    assert not ok, "the remix starter already passes — nothing for the student to adapt"


def test_the_mission_matches_the_concept_the_student_needs(db, student, stub_model):
    concept = svc.next_concept(db, student.id)
    _, mission, _ = svc.next_mission(db, user_id=student.id)
    assert mission.target_concept_id == concept.slug


def test_every_generated_mission_is_logged(db, student, stub_model):
    """`ai_interactions` is how a fallback is noticed. A silent one looks like success.

    `force_regenerate` because reuse is not logged and should not be: it makes no model
    call, so there is nothing to record. Without it this test passed only while the pool
    happened to be empty, and started failing the day pre-generation filled it.
    """
    from app.models_tables import AiInteraction

    svc.next_mission(db, user_id=student.id, force_regenerate=True)

    row = db.execute(
        select(AiInteraction)
        .where(AiInteraction.user_id == student.id, AiInteraction.capability == "MISSION_GEN")
        .order_by(AiInteraction.created_at.desc())
        .limit(1)
    ).scalar_one()
    assert row.latency_ms is not None


def test_two_calls_give_two_missions(db, student, stub_model):
    """Each *generation* is a fresh row, so a student's history is real rather than
    reconstructed.

    Not each call: reuse deliberately hands back an existing row, which is what makes
    pre-generation worth anything. `force_regenerate` is what distinguishes the two, and
    is the thing this test is actually about.
    """
    a, _, _ = svc.next_mission(db, user_id=student.id, force_regenerate=True)
    b, _, _ = svc.next_mission(db, user_id=student.id, force_regenerate=True)
    assert a.id != b.id


# ------------------------------------------------------- the lesson decides


def test_the_lesson_decides_what_is_taught_not_mastery(db, student, stub_model):
    """A student who clicks a loops lesson gets loops, whatever their mastery says.

    This was a real bug: the pipeline always chose the concept from mastery, so asking
    for a mission on `ticket-queue` gave a *variables* mission to any student who had not
    mastered variables yet. They clicked one thing and got another.
    """
    from app.models_tables import Lesson

    lesson = db.execute(
        select(Lesson).where(Lesson.slug == "ticket-queue")
    ).scalar_one_or_none()
    if lesson is None:
        pytest.skip("ticket-queue is not seeded")

    # This student has mastered nothing, so mastery alone would say "variables".
    assert svc.next_concept(db, student.id).slug == "variables"

    concept = svc.concept_for_lesson(db, lesson.id)
    assert concept.slug == "loops"

    _, mission, world = svc.next_mission(db, user_id=student.id, lesson_id=lesson.id)
    assert mission.target_concept_id == "loops"
    assert world.id == "el_mahatta"


def test_without_a_lesson_mastery_decides(db, student, stub_model):
    _, mission, _ = svc.next_mission(db, user_id=student.id)
    assert mission.target_concept_id == svc.next_concept(db, student.id).slug


def test_a_lesson_pins_the_world(db, student):
    """A bakery lesson stays in the bakery, even though other worlds teach the concept."""
    from app.models_tables import Lesson

    lesson = db.execute(
        select(Lesson).where(Lesson.slug == "signal-rules")
    ).scalar_one_or_none()
    if lesson is None:
        pytest.skip("signal-rules is not seeded")

    assert svc.world_for(db, "functions", lesson.id).id == "isharet_cairo"


def test_carried_concepts_come_from_the_lesson(db, student):
    """`exercise_concepts` is where a lesson says what it uses but does not teach."""
    from app.models_tables import Lesson

    lesson = db.execute(
        select(Lesson).where(Lesson.slug == "ticket-queue")
    ).scalar_one_or_none()
    if lesson is None:
        pytest.skip("ticket-queue is not seeded")

    assert svc.carried_for_lesson(db, lesson.id) == ["conditionals"]


def test_the_taught_concept_is_never_scaffolded_away(db, student):
    """Scaffolding what the lesson teaches would hand over the answer."""
    from app.models_tables import Concept, ConceptMastery, Lesson

    lesson = db.execute(
        select(Lesson).where(Lesson.slug == "ticket-queue")
    ).scalar_one_or_none()
    if lesson is None:
        pytest.skip("ticket-queue is not seeded")

    # Make the student excellent at everything, including loops.
    for concept in db.execute(select(Concept)).scalars():
        db.add(ConceptMastery(user_id=student.id, concept_id=concept.id,
                              mastery=0.99, confidence=0.9, evidence_count=10))
    db.flush()

    world = svc.world_for(db, "loops", lesson.id)
    plan = svc.scaffold_plan(db, student.id, world, "loops", lesson_id=lesson.id)

    assert "loops" not in plan
    assert plan.get("conditionals") == "FULL"


def test_an_unlinked_lesson_falls_back_to_mastery(db, student, stub_model):
    """A lesson with no primary concept must not stop a student getting a mission."""
    assert svc.concept_for_lesson(db, "no-such-lesson") is None
    _, mission, _ = svc.next_mission(db, user_id=student.id, lesson_id="no-such-lesson")
    assert mission.validated


# --------------------------------------------------------------- addressed by the map
#
# `/v1/missions/by-lesson` is how the client asks for a mission now: a world and which
# stop along it, rather than a lesson cuid it had to look up first. These cover the two
# things that can quietly go wrong — a stop number resolving to the wrong lesson, and the
# prepared set being bypassed when it should not be.


def test_a_stop_number_is_a_position_not_an_order_column(db):
    """El-forn's `order` values run 1, 2, 4, 5 and the map draws four stops.

    Reading the number as `lessons.order` would make stop 3 a 404 and stop 4 the wrong
    lesson, which is the bug this indirection exists to prevent.
    """
    lessons = svc.lessons_in_world(db, "el-forn")
    if [l.slug for l in lessons] != ["opening-message", "count-the-trays", "fair-share", "morning-batches"]:
        pytest.skip("el-forn is not seeded as expected")

    assert svc.resolve_lesson(db, world_slug="el-forn", lesson_number=3)[0].slug == "fair-share"
    assert svc.resolve_lesson(db, world_slug="el-forn", lesson_number=4)[0].slug == "morning-batches"
    # And the order column really does skip 3, so the two readings differ.
    assert [l.order for l in lessons] == [1, 2, 4, 5]


def test_a_slug_outranks_a_number(db):
    """A caller that already knows its lesson should not depend on the count."""
    lesson, position = svc.resolve_lesson(
        db, world_slug="el-forn", lesson_number=1, lesson_slug="morning-batches"
    )
    assert lesson.slug == "morning-batches"
    assert position == 4


def test_an_unknown_world_or_stop_is_a_lookup_failure_not_a_generation_one(db):
    """Both are 404s. Raising `NoMissionAvailable` would make a typo look like an outage."""
    with pytest.raises(svc.UnknownLesson):
        svc.resolve_lesson(db, world_slug="no-such-world", lesson_number=1)
    with pytest.raises(svc.UnknownLesson):
        svc.resolve_lesson(db, world_slug="el-forn", lesson_number=99)
    with pytest.raises(svc.UnknownLesson):
        svc.resolve_lesson(db, world_slug="el-forn", lesson_slug="no-such-lesson")
    with pytest.raises(svc.UnknownLesson):
        svc.resolve_lesson(db, world_slug="el-forn")


def test_two_lessons_teaching_one_concept_are_different_stops(db):
    """`opening-message` and `count-the-trays` both teach `variables`.

    Keying the prepared set on the concept alone gave both the identical mission, which
    makes the second lesson a re-run of the first.
    """
    from app.models_tables import Lesson, Track

    track = db.execute(select(Track).where(Track.slug == "el-forn")).scalar_one_or_none()
    if track is None:
        pytest.skip("el-forn is not seeded")

    first = db.execute(select(Lesson).where(Lesson.slug == "opening-message")).scalar_one_or_none()
    second = db.execute(select(Lesson).where(Lesson.slug == "count-the-trays")).scalar_one_or_none()
    if first is None or second is None:
        pytest.skip("the two variables lessons are not seeded")

    stops = {
        lesson.slug: svc.stop_for_lesson(
            db, track_id=track.id, concept_id="variables", lesson_id=lesson.id
        )
        for lesson in (first, second)
    }
    assert stops == {"opening-message": 1, "count-the-trays": 2}


def test_exact_lesson_fallback_uses_its_stop_not_student_progress(db, student, monkeypatch):
    """A completed lesson remains replayable even when its pinned row is unavailable."""
    class Selected(Exception):
        pass

    monkeypatch.setattr(svc.settings, "live_mission_generation", False)
    monkeypatch.setattr(svc, "find_prebuilt", lambda *args, **kwargs: None)
    monkeypatch.setattr(svc, "_repetition_context", lambda *args, **kwargs: (2, []))
    monkeypatch.setattr(svc, "scaffold_plan", lambda *args, **kwargs: {})

    def capture(*args, **kwargs):
        assert kwargs["repetition"] == 1
        raise Selected

    monkeypatch.setattr(svc, "find_reusable", lambda *args, **kwargs: None)
    monkeypatch.setattr(svc, "_compose", capture)

    with pytest.raises(Selected):
        svc.for_lesson(
            db,
            user_id=student.id,
            world_slug="el-forn",
            lesson_slug="opening-message",
        )


def test_the_prepared_set_is_served_without_a_model_call(db, student, monkeypatch):
    """The demo path. A prepared mission for this stop means no generation at all.

    The model is replaced with something that raises: if this test passes, nothing on the
    path reached for it — which is the claim, not just the speed.
    """
    monkeypatch.setattr(
        svc.mission_gen,
        "generate",
        lambda *a, **k: pytest.fail("the prepared set must not call the model"),
    )
    monkeypatch.setattr(svc.settings, "live_mission_generation", False)

    prepared = svc.find_prebuilt(db, world_id="el_forn", concept_id="variables", stop=1)
    if prepared is None:
        pytest.skip("no prepared mission for el_forn/variables stop 1")

    _, mission, how = svc.for_lesson(
        db, user_id=student.id, world_slug="el-forn", lesson_number=1
    )
    assert how["delivery"] == "prebuilt"
    assert how["live"] is False
    assert how["stop"] == 1
    assert how["lesson_slug"] == "opening-message"
    assert mission.id == prepared[0].id
    assert mission.validated


def test_the_prepared_set_is_shared_rather_than_claimed(db, student):
    """Two students opening the same stop get the same mission.

    The opposite of `find_reusable`, which hands each student their own row. Narration is
    recorded once per prepared mission, so it has to be the same one for everybody.
    """
    from app.models_tables import User

    other = User(email="pytest-other@tico.invalid", name="pytest other")
    db.add(other)
    db.flush()

    if svc.find_prebuilt(db, world_id="el_forn", concept_id="variables", stop=1) is None:
        pytest.skip("no prepared mission for el_forn/variables stop 1")

    mine = svc.for_lesson(db, user_id=student.id, world_slug="el-forn", lesson_number=1)[1]
    theirs = svc.for_lesson(db, user_id=other.id, world_slug="el-forn", lesson_number=1)[1]
    assert mine.id == theirs.id


def test_the_live_flag_bypasses_the_prepared_set(db, student, stub_model):
    """With generation live, a stop that *has* a prepared mission still composes a new one.

    That is the whole point of the flag: the same click, and the student plays something
    that did not exist when they made it.
    """
    prepared = svc.find_prebuilt(db, world_id="el_forn", concept_id="variables", stop=1)
    if prepared is None:
        pytest.skip("no prepared mission for el_forn/variables stop 1")

    _, mission, how = svc.for_lesson(
        db, user_id=student.id, world_slug="el-forn", lesson_number=1, force_regenerate=True
    )
    assert how["delivery"] == "generated"
    assert how["live"] is True
    assert mission.id != prepared[0].id


def test_reading_a_mission_by_id_refuses_what_a_student_should_not_see(db, student, stub_model):
    """Missing, unvalidated and someone else's are all the same 404.

    Distinguishing them would confirm that a row exists, and a student has no use for
    any of the three.
    """
    from app.models_tables import User

    with pytest.raises(svc.MissionNotFound):
        svc.by_id(db, user_id=student.id, mission_id="no-such-mission")

    # Claimed explicitly rather than taken as it comes: `next_mission` may legitimately
    # hand back a *shared* prepared row, and a shared row is readable by everyone, so
    # the ownership rule would look broken when it was simply not being exercised.
    row, _, _ = svc.next_mission(db, user_id=student.id)
    row.user_id = student.id
    db.flush()

    assert svc.by_id(db, user_id=student.id, mission_id=row.id).id == row.id

    other = User(email="pytest-thief@tico.invalid", name="pytest thief")
    db.add(other)
    db.flush()
    with pytest.raises(svc.MissionNotFound):
        svc.by_id(db, user_id=other.id, mission_id=row.id)

    row.validated = False
    db.flush()
    with pytest.raises(svc.MissionNotFound):
        svc.by_id(db, user_id=student.id, mission_id=row.id)


def test_a_shared_prepared_mission_stays_readable_by_anyone(db, student):
    """The other half of the ownership rule.

    Prepared missions have no owner on purpose — every student plays the same one — so
    refusing an unclaimed row would make the whole prepared set unopenable.
    """
    from app.models_tables import User

    prepared = svc.find_prebuilt(db, world_id="el_forn", concept_id="variables", stop=1)
    if prepared is None:
        pytest.skip("no prepared mission for el_forn/variables stop 1")

    other = User(email="pytest-reader@tico.invalid", name="pytest reader")
    db.add(other)
    db.flush()

    assert svc.by_id(db, user_id=other.id, mission_id=prepared[0].id).id == prepared[0].id


# ------------------------------------------------------------- the generation gate
#
# `LIVE_MISSION_GENERATION` defaults off and is a hard gate, not a preference: an unset
# variable in production is the normal state of a fresh deploy, and defaulting the other
# way costs a 25-second wait and a Gemini bill on somebody's first click.


def test_nothing_calls_the_model_while_the_gate_is_shut(db, student, monkeypatch):
    """Every mission endpoint, with generation off and no prepared mission to fall on.

    The model is replaced with something that raises, so a pass means nothing reached for
    it — not merely that the result looked right.
    """
    monkeypatch.setattr(svc.settings, "live_mission_generation", False)
    monkeypatch.setattr(
        svc.mission_gen,
        "generate",
        lambda *a, **k: pytest.fail("the gate is shut; nothing may call the model"),
    )

    from app.models_tables import Lesson

    # el-mahatta has neither a prepared set nor anything in the pool, so each of these
    # reaches the generation branch with nothing to fall back on. Pinning the lesson
    # matters: left to mastery, `next_mission` would find a reusable `variables` mission
    # and never get as far as the gate — which is correct, and covered separately.
    mahatta = db.execute(
        select(Lesson).where(Lesson.slug == "ticket-queue")
    ).scalar_one_or_none()
    if mahatta is None:
        pytest.skip("ticket-queue is not seeded")

    with pytest.raises(svc.GenerationDisabled):
        svc.for_lesson(db, user_id=student.id, world_slug="el-mahatta", lesson_number=1)

    with pytest.raises(svc.GenerationDisabled):
        svc.next_mission(db, user_id=student.id, lesson_id=mahatta.id)

    with pytest.raises(svc.GenerationDisabled):
        svc.generate_explicit(db, user_id=student.id, concept_slug="functions")

    # The arena needs two mastered concepts before it will even pick, so a fresh student
    # is turned away by `NotReadyForTheArena` long before the gate. Mastery first, then
    # the refusal being tested is the one that fires.
    from app.models_tables import Concept, ConceptMastery

    for slug in ("variables", "conditionals"):
        concept = db.execute(select(Concept).where(Concept.slug == slug)).scalar_one()
        db.add(ConceptMastery(user_id=student.id, concept_id=concept.id,
                              mastery=0.95, confidence=0.9, evidence_count=6))
    db.flush()

    with pytest.raises(svc.GenerationDisabled):
        svc.next_challenge(db, user_id=student.id)


def test_force_regenerate_does_not_open_the_gate(db, student, monkeypatch):
    """A gate a client can talk its way past is not a gate.

    `forceRegenerate` was OR'd into the live flag, so any caller could spend a model call
    on a service configured not to make them.
    """
    monkeypatch.setattr(svc.settings, "live_mission_generation", False)
    monkeypatch.setattr(
        svc.mission_gen,
        "generate",
        lambda *a, **k: pytest.fail("forceRegenerate must not reach the model"),
    )

    if svc.find_prebuilt(db, world_id="el_forn", concept_id="variables", stop=1) is None:
        pytest.skip("no prepared mission for el_forn/variables stop 1")

    # The prepared mission is still served, and `live` reports the truth rather than
    # echoing what the caller asked for.
    _, _, how = svc.for_lesson(
        db, user_id=student.id, world_slug="el-forn", lesson_number=1, force_regenerate=True
    )
    assert how["delivery"] == "prebuilt"
    assert how["live"] is False


def test_the_shut_gate_still_serves_a_reusable_mission(db, student, monkeypatch):
    """Refusing to generate is not refusing to serve.

    `force_regenerate` skips the reuse check, and honouring that with the gate shut would
    turn a request with a perfectly good mission waiting for it into a 503.
    """
    monkeypatch.setattr(svc.settings, "live_mission_generation", False)
    monkeypatch.setattr(
        svc.mission_gen,
        "generate",
        lambda *a, **k: pytest.fail("a reusable mission was available; nothing to generate"),
    )

    concept = svc.next_concept(db, student.id)
    world = svc.world_for(db, concept.slug)
    repetition, _ = svc._repetition_context(db, student.id, concept.id)
    if svc.find_reusable(
        db, user_id=student.id, world_id=world.id,
        concept_id=concept.id, repetition=repetition,
    ) is None:
        pytest.skip("no spare mission in the pool for this concept")

    _, mission, _ = svc.next_mission(db, user_id=student.id, force_regenerate=True)
    assert mission.validated


def test_a_refusal_is_distinguishable_from_an_outage(db, student, monkeypatch):
    """`GenerationDisabled` is a `NoMissionAvailable`, so every caller's 503 still works.

    It is a distinct type so an operator reading a log can tell a configuration choice
    from Gemini having a bad afternoon.
    """
    monkeypatch.setattr(svc.settings, "live_mission_generation", False)

    assert issubclass(svc.GenerationDisabled, svc.NoMissionAvailable)
    with pytest.raises(svc.NoMissionAvailable) as caught:
        svc.require_generation(because="a test")
    assert "LIVE_MISSION_GENERATION" in str(caught.value)
