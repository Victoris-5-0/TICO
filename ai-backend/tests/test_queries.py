"""The queries layer, against a real database.

Skipped automatically when no database is reachable, so `pytest` still runs offline and in
CI. When a database *is* configured these are the tests that matter most, because the
whole class of bug they catch — a missing default, a wrong column name, an enum that does
not round-trip — cannot be caught by anything that mocks the session.

Every test cleans up after itself and runs inside a transaction that gets rolled back, so
this can point at the live database without leaving anything behind.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app.models_tables import Concept, PracticeSession
from app.models_tables.enums import ErrorFamily, Phase, ScaffoldLevel, SessionKind, SessionOutcome
from app.queries import ai_log, hints, sessions, students

DB_URL = os.environ.get("TEST_DATABASE_URL") or os.environ.get("REAL_DATABASE_URL")


def _reachable(url: str) -> bool:
    try:
        e = create_engine(url, connect_args={"connect_timeout": 8})
        with e.connect() as c:
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
    """One engine for the whole run.

    Supabase's session pooler allows 15 clients. An engine per test blew straight through
    that — `EMAXCONNSESSION: max clients reached in session mode`. Session scope plus a
    small pool keeps the whole suite inside a couple of connections.
    """
    e = create_engine(
        DB_URL, connect_args={"connect_timeout": 15}, pool_size=2, max_overflow=0
    )
    yield e
    e.dispose()


@pytest.fixture
def db(engine):
    """A session in a transaction that is always rolled back.

    Nothing these tests write survives, so they are safe to point at the live database and
    leave no fixture rows for someone to trip over later.
    """
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
def user_id(db) -> str:
    """A student to hang sessions off.

    Creates one rather than skipping when the table is empty. `practice_sessions` has a
    foreign key to `users`, so without a real row every session test would skip — and
    those are exactly the tests worth running. The surrounding transaction is rolled back,
    so the user never actually lands.
    """
    existing = db.execute(text("select id from users limit 1")).scalar_one_or_none()
    if existing:
        return existing

    from app.models_tables import User

    u = User(email="pytest-fixture@tico.invalid", name="pytest fixture")
    db.add(u)
    db.flush()
    return u.id


# ------------------------------------------------------------------------- concepts


def test_the_roadmap_is_seeded_and_ordered(db):
    concepts = students.concepts_in_order(db)
    assert [c.slug for c in concepts] == ["variables", "conditionals", "loops", "functions"]
    assert [c.sequence_order for c in concepts] == [1, 2, 3, 4]


def test_concepts_have_arabic_names(db):
    """The UI is Egyptian Arabic first. A concept with no `name_ar` cannot be shown."""
    for c in students.concepts_in_order(db):
        assert c.name_ar, f"{c.slug} has no Arabic name"


def test_concept_by_slug(db):
    assert students.concept_by_slug(db, "loops").sequence_order == 3
    assert students.concept_by_slug(db, "not-a-concept") is None


# ------------------------------------------------------------------------- sessions


def test_open_session_fills_id_and_timestamp(db, user_id):
    """The two things Prisma would have supplied and Postgres will not."""
    s = sessions.open_session(db, user_id=user_id, kind=SessionKind.LESSON)
    assert s.id and len(s.id) == 25, "id was not generated"
    assert s.started_at is not None, "started_at was not defaulted by the database"
    assert s.phase is Phase.ENCOUNTER
    assert s.outcome is SessionOutcome.IN_PROGRESS


def test_enums_round_trip_through_postgres(db, user_id):
    """Catches the casing bug: lowercase Python values would fail on insert."""
    s = sessions.open_session(db, user_id=user_id, kind=SessionKind.DIAGNOSTIC)
    db.flush()
    db.expire(s)
    assert s.kind is SessionKind.DIAGNOSTIC
    assert s.phase is Phase.ENCOUNTER


def test_set_phase(db, user_id):
    s = sessions.open_session(db, user_id=user_id)
    sessions.set_phase(db, s, Phase.GUIDED_CODING)
    assert s.phase is Phase.GUIDED_CODING


def test_close_session_sets_ended_at(db, user_id):
    s = sessions.open_session(db, user_id=user_id)
    assert s.ended_at is None
    sessions.close_session(db, s, outcome=SessionOutcome.SOLVED, time_spent_ms=254000)
    assert s.outcome is SessionOutcome.SOLVED
    assert s.ended_at is not None
    assert s.time_spent_ms == 254000


def test_closing_twice_keeps_the_first_timestamp(db, user_id):
    """A double-close is normal, and must not corrupt the timing evidence."""
    s = sessions.open_session(db, user_id=user_id)
    sessions.close_session(db, s, outcome=SessionOutcome.SOLVED)
    first = s.ended_at
    sessions.close_session(db, s, outcome=SessionOutcome.ABANDONED)
    assert s.ended_at == first


def test_get_owned_refuses_another_students_session(db, user_id):
    """The property that stops one child reading another's work."""
    s = sessions.open_session(db, user_id=user_id)
    db.flush()
    assert sessions.get_owned(db, s.id, user_id) is not None
    assert sessions.get_owned(db, s.id, "some-other-student") is None


# ---------------------------------------------------------------------------- hints


def test_hint_ladder_counts_from_events(db, user_id):
    s = sessions.open_session(db, user_id=user_id)
    assert hints.highest_rung(db, s.id) == 0
    for rung in (1, 2, 3):
        hints.record(db, session_id=s.id, hint_level=rung, text=f"rung {rung}")
    assert hints.highest_rung(db, s.id) == 3
    assert sessions.hint_count(db, s.id) == 3


def test_repeating_a_rung_does_not_advance_the_ladder(db, user_id):
    """A retry logs the same rung twice; the student must not skip a level for it."""
    s = sessions.open_session(db, user_id=user_id)
    hints.record(db, session_id=s.id, hint_level=1, text="a")
    hints.record(db, session_id=s.id, hint_level=1, text="b")
    assert hints.highest_rung(db, s.id) == 1
    assert sessions.hint_count(db, s.id) == 2


def test_hint_events_are_returned_in_rung_order(db, user_id):
    s = sessions.open_session(db, user_id=user_id)
    for rung in (3, 1, 2):
        hints.record(db, session_id=s.id, hint_level=rung, text=f"r{rung}")
    assert [h.hint_level for h in hints.for_session(db, s.id)] == [1, 2, 3]


def test_authored_fallback_is_distinguishable_from_a_model_hint(db, user_id):
    """`model=None` means the text came from the authored fallback, not Gemini."""
    s = sessions.open_session(db, user_id=user_id)
    a = hints.record(db, session_id=s.id, hint_level=1, text="x", model="gemini-3.5-flash-lite")
    b = hints.record(db, session_id=s.id, hint_level=2, text="y", model=None)
    assert a.model and b.model is None


# ---------------------------------------------------------------------- hint cache


def test_cache_round_trip(db):
    key = dict(exercise_id="tc-cache-1", hint_level=2, error_tag="assignment_vs_comparison",
               scaffold_state=ScaffoldLevel.PARTIAL, locale="ar-EG")
    assert hints.cache_lookup(db, **key) is None
    hints.cache_store(db, **key, text="حاول تبص على السطر ده تاني.", model="gemini-3.5-flash-lite")
    found = hints.cache_lookup(db, **key)
    assert found is not None and found.hits == 0
    hints.cache_hit(db, found)
    assert hints.cache_lookup(db, **key).hits == 1


def test_cache_key_separates_rungs(db):
    base = dict(exercise_id="tc-cache-2", error_tag=None, scaffold_state=None, locale="ar-EG")
    hints.cache_store(db, **base, hint_level=1, text="rung one")
    assert hints.cache_lookup(db, **base, hint_level=1) is not None
    assert hints.cache_lookup(db, **base, hint_level=2) is None, "rungs must not share a cache entry"


def test_cache_key_separates_locales(db):
    base = dict(exercise_id="tc-cache-3", hint_level=1, error_tag=None, scaffold_state=None)
    hints.cache_store(db, **base, locale="ar-EG", text="عربي")
    assert hints.cache_lookup(db, **base, locale="ar-EG") is not None
    assert hints.cache_lookup(db, **base, locale="en") is None


def test_cache_key_separates_scaffold_state(db):
    """Never reuse a hint written for a student who had the concept pre-filled."""
    base = dict(exercise_id="tc-cache-4", hint_level=1, error_tag=None, locale="ar-EG")
    hints.cache_store(db, **base, scaffold_state=ScaffoldLevel.FULL, text="scaffolded")
    assert hints.cache_lookup(db, **base, scaffold_state=ScaffoldLevel.FULL) is not None
    assert hints.cache_lookup(db, **base, scaffold_state=ScaffoldLevel.NONE) is None


# -------------------------------------------------------------------------- profile


def test_ensure_profile_creates_neutral_defaults(db, user_id):
    """A student can reach a hint before anything has computed a profile for them."""
    p = students.ensure_profile(db, user_id)
    assert p.user_id == user_id
    assert p.locale == "ar-EG"
    assert 0.0 <= p.hint_dependency <= 1.0
    assert 0.0 <= p.syntax_vs_logic <= 1.0


def test_profile_bundle_has_what_a_prompt_needs(db, user_id):
    b = students.profile_bundle(db, user_id)
    assert b["profile"] is not None
    assert isinstance(b["mastery"], dict)
    assert len(b["concepts"]) == 4


# --------------------------------------------------------------------------- ai log


def test_ai_log_writes_a_row(db, user_id):
    row = ai_log.log(db, capability=ai_log.HINT, user_id=user_id,
                     model="gemini-3.5-flash-lite", tokens_in=73, tokens_out=39,
                     latency_ms=1071, status=ai_log.SUCCESS)
    assert row.id and row.created_at is not None
    assert row.capability == ai_log.HINT


def test_track_logs_a_failure_and_reraises(db, user_id):
    """A call that dies must still be recorded, with the latency it burned."""
    with pytest.raises(ValueError):
        with ai_log.track(db, capability=ai_log.CLASSIFY, user_id=user_id) as t:
            t["model"] = "gemini-3.5-flash-lite"
            raise ValueError("model exploded")

    from app.models_tables import AiInteraction

    row = db.execute(
        select(AiInteraction)
        .where(AiInteraction.user_id == user_id, AiInteraction.capability == ai_log.CLASSIFY)
        .order_by(AiInteraction.created_at.desc())
        .limit(1)
    ).scalar_one()
    assert row.status == ai_log.FAILURE
    assert "model exploded" in row.output
    assert row.latency_ms is not None


def test_cached_calls_do_not_count_against_the_cap(db, user_id):
    """A student must not be penalised for asking what someone else already asked."""
    before = ai_log.calls_today(db, user_id)
    ai_log.log(db, capability=ai_log.HINT, user_id=user_id, status=ai_log.CACHED)
    assert ai_log.calls_today(db, user_id) == before
    ai_log.log(db, capability=ai_log.HINT, user_id=user_id, status=ai_log.SUCCESS)
    assert ai_log.calls_today(db, user_id) == before + 1


def test_over_cap(db, user_id):
    assert ai_log.over_cap(db, user_id, cap=0) is True
    assert ai_log.over_cap(db, user_id, cap=10_000) is False
