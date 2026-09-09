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
    """
    import json

    from app.ai.chains import mission_gen
    from app.schemas import phases as P

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
    """`ai_interactions` is how a fallback is noticed. A silent one looks like success."""
    from app.models_tables import AiInteraction

    svc.next_mission(db, user_id=student.id)

    row = db.execute(
        select(AiInteraction)
        .where(AiInteraction.user_id == student.id, AiInteraction.capability == "MISSION_GEN")
        .order_by(AiInteraction.created_at.desc())
        .limit(1)
    ).scalar_one()
    assert row.latency_ms is not None


def test_two_calls_give_two_missions(db, student, stub_model):
    """Each call is a fresh row, so a student's history is real rather than reconstructed."""
    a, _, _ = svc.next_mission(db, user_id=student.id)
    b, _, _ = svc.next_mission(db, user_id=student.id)
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
