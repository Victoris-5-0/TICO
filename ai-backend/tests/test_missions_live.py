"""The mission pipeline against a real database.

`/v1/missions/next` stopped being a stub: it picks a concept from the student's mastery,
generates a mission, validates it by running the code, and persists it. That needs a
database, so these skip when none is reachable — `test_generation.py` covers the parts
that work offline.

The model is not called here. `allow_model=False` takes the template path, which keeps
these fast, free and deterministic. Whether Gemini produces good missions is a question
for an eval, not for a test that runs on every push.
"""

from __future__ import annotations

import os

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


# ---------------------------------------------------------------- the whole thing


def test_the_pipeline_produces_and_persists_a_valid_mission(db, student):
    """End to end on the template path — no model call, so this is fast and free."""
    row, mission, world, source = svc.next_mission(
        db, user_id=student.id, allow_model=False
    )

    assert source == "template"
    assert row.validated is True
    assert mission.validated is True

    # Persisted with everything the client needs to render it.
    stored = db.get(GeneratedMission, row.id)
    assert stored is not None
    assert stored.user_id == student.id
    assert stored.scene_id == mission.scene_id
    assert stored.content["starter_code"]
    assert stored.content["source"] == "template"
    assert len(stored.content["tests"]) >= 2
    assert stored.engine_version == svc.ENGINE_VERSION


def test_the_persisted_mission_is_actually_solvable(db, student):
    """The strongest assertion available: run the stored solution against the stored tests."""
    from app.ai import sandbox

    row, mission, _, _ = svc.next_mission(db, user_id=student.id, allow_model=False)
    content = row.content

    ok, failures = sandbox.passes(
        content["solution_code"],
        [(t["call"], t["expected"]) for t in content["tests"]],
    )
    assert ok, f"a stored mission is unsolvable: {failures}"


def test_the_stored_starter_does_not_already_pass(db, student):
    from app.ai import sandbox

    row, _, _, _ = svc.next_mission(db, user_id=student.id, allow_model=False)
    content = row.content

    ok, _ = sandbox.passes(
        content["starter_code"],
        [(t["call"], t["expected"]) for t in content["tests"]],
    )
    assert not ok, "the stored starter already passes — nothing for the student to do"


def test_the_mission_matches_the_concept_the_student_needs(db, student):
    concept = svc.next_concept(db, student.id)
    _, mission, _, _ = svc.next_mission(db, user_id=student.id, allow_model=False)
    assert mission.target_concept == concept.slug


def test_every_generated_mission_is_logged(db, student):
    """`ai_interactions` is how a fallback is noticed. A silent one looks like success."""
    from app.models_tables import AiInteraction

    svc.next_mission(db, user_id=student.id, allow_model=False)

    row = db.execute(
        select(AiInteraction)
        .where(AiInteraction.user_id == student.id, AiInteraction.capability == "MISSION_GEN")
        .order_by(AiInteraction.created_at.desc())
        .limit(1)
    ).scalar_one()
    assert row.latency_ms is not None


def test_two_calls_give_two_missions(db, student):
    """Each call is a fresh row, so a student's history is real rather than reconstructed."""
    a, _, _, _ = svc.next_mission(db, user_id=student.id, allow_model=False)
    b, _, _, _ = svc.next_mission(db, user_id=student.id, allow_model=False)
    assert a.id != b.id


# ------------------------------------------------------- the lesson decides


def test_the_lesson_decides_what_is_taught_not_mastery(db, student):
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

    _, mission, world, _ = svc.next_mission(
        db, user_id=student.id, lesson_id=lesson.id, allow_model=False
    )
    assert mission.target_concept == "loops"
    assert world.id == "el_mahatta"


def test_without_a_lesson_mastery_decides(db, student):
    _, mission, _, _ = svc.next_mission(db, user_id=student.id, allow_model=False)
    assert mission.target_concept == svc.next_concept(db, student.id).slug


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


def test_an_unlinked_lesson_falls_back_to_mastery(db, student):
    """A lesson with no primary concept must not stop a student getting a mission."""
    assert svc.concept_for_lesson(db, "no-such-lesson") is None
    _, mission, _, _ = svc.next_mission(
        db, user_id=student.id, lesson_id="no-such-lesson", allow_model=False
    )
    assert mission.validated
