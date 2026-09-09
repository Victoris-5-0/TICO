"""The student model and the planner, over HTTP, against a real database.

Skipped unless `REAL_DATABASE_URL` is set and reachable. Every row is rolled back.

These are the two endpoints that make decisions *about* a child rather than for a moment,
so what they assert is mostly the audit trail: a decision without `decidedBy` and a reason
cannot be explained six months later, and a decision about a child that cannot be explained
is the one thing this design refuses to ship.
"""

from __future__ import annotations

import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.database import get_db
from app.main import app
from app.models_tables import User
from app.models_tables.enums import Role

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


@pytest.fixture(scope="module")
def engine():
    e = create_engine(DB_URL, connect_args={"connect_timeout": 15}, pool_size=2, max_overflow=0)
    yield e
    e.dispose()


@pytest.fixture
def db(engine) -> Session:
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection)()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def student(db) -> User:
    user = User(
        id=f"test-{uuid.uuid4().hex[:12]}",
        email=f"{uuid.uuid4().hex[:12]}@test.invalid",
        name="Test Student",
        role=Role.STUDENT,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def client(db, student):
    from app.core.auth import CurrentUser, get_current_user

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=student.id, email=student.email, role="STUDENT"
    )
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def body(r):
    assert r.status_code in (200, 201), r.text
    return r.json()["data"]


# ================================================================== the planner


def test_a_beginner_is_given_the_whole_roadmap(client, student, db):
    if db.execute(text("select count(*) from lessons")).scalar() == 0:
        pytest.skip("no lessons seeded")

    plan = body(client.post(f"/v1/students/{student.id}/plan", json={"isBeginner": True}))

    assert plan["lessons"], "a plan with no lessons is not a plan"
    assert plan["skippedCount"] == 0
    assert all(row["requirement"] == "REQUIRED" for row in plan["lessons"])
    assert all(row["decidedBy"] == "RULE" for row in plan["lessons"]), "no model for a beginner"
    assert plan["startingLevelId"] == plan["lessons"][0]["levelId"]


def test_the_plan_is_written_down(client, student, db):
    """A path the student can be shown tomorrow, not just in this response."""
    if db.execute(text("select count(*) from lessons")).scalar() == 0:
        pytest.skip("no lessons seeded")

    plan = body(client.post(f"/v1/students/{student.id}/plan", json={"isBeginner": True}))

    stored = db.execute(
        text("select count(*) from lesson_plans where user_id = :u"), {"u": student.id}
    ).scalar()
    assert stored == len(plan["lessons"])


def test_replanning_replaces_rather_than_duplicates(client, student, db):
    if db.execute(text("select count(*) from lessons")).scalar() == 0:
        pytest.skip("no lessons seeded")

    first = body(client.post(f"/v1/students/{student.id}/plan", json={"isBeginner": True}))
    body(client.post(f"/v1/students/{student.id}/plan", json={"isBeginner": True}))

    stored = db.execute(
        text("select count(*) from lesson_plans where user_id = :u"), {"u": student.id}
    ).scalar()
    assert stored == len(first["lessons"]), "a second plan must not double the rows"


def test_every_lesson_in_a_plan_says_who_decided_it(client, student, db):
    if db.execute(text("select count(*) from lessons")).scalar() == 0:
        pytest.skip("no lessons seeded")

    plan = body(client.post(f"/v1/students/{student.id}/plan", json={"isBeginner": False}))
    for row in plan["lessons"]:
        assert row["decidedBy"] in ("RULE", "MODEL")
        assert 0.0 <= row["confidence"] <= 1.0
        if row["requirement"] == "OPTIONAL":
            assert row["reason"], "a skip with no explanation is not auditable"


def test_another_students_plan_is_forbidden(client, db, student):
    from app.core.auth import CurrentUser, get_current_user

    intruder = User(
        id=f"test-{uuid.uuid4().hex[:12]}",
        email=f"{uuid.uuid4().hex[:12]}@test.invalid",
        role=Role.STUDENT,
    )
    db.add(intruder)
    db.flush()
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id=intruder.id, email=intruder.email, role="STUDENT"
    )

    r = client.post(f"/v1/students/{student.id}/plan", json={"isBeginner": True})
    assert r.status_code == 403, "require_self must stop this"

    r = client.post(f"/v1/students/{student.id}/refresh", json={})
    assert r.status_code == 403


# ================================================================== the refresh


def test_refresh_without_a_session_reports_the_model_as_it_stands(client, student):
    """Nothing to gate on, so nothing is decided — and it says so rather than guessing."""
    result = body(client.post(f"/v1/students/{student.id}/refresh", json={}))

    assert result["advanced"] is False
    assert result["decidedBy"] == "RULE"
    assert result["reason"], "even a no-op decision explains itself"
    assert "profile" in result and result["profile"]["userId"] == student.id


def test_refresh_creates_the_profile_if_it_is_missing(client, student, db):
    """A valid token can belong to someone whose first request landed here."""
    body(client.post(f"/v1/students/{student.id}/refresh", json={}))

    stored = db.execute(
        text("select count(*) from student_profiles where user_id = :u"), {"u": student.id}
    ).scalar()
    assert stored == 1


def test_refresh_gates_on_a_closed_session(client, student, db):
    """The whole point: after a session closes, does the student move on?"""
    if db.execute(text("select count(*) from mission_templates")).scalar() == 0:
        pytest.skip("no mission_templates — run scripts/sync_mission_templates.py")

    session_id = body(client.post("/v1/sessions", json={"levelId": "lesson-x"}))["id"]
    client.post(f"/v1/sessions/{session_id}/close", json={
        "outcome": "SOLVED", "timeSpentMs": 120_000,
    })

    result = body(
        client.post(f"/v1/students/{student.id}/refresh", json={"sessionId": session_id})
    )
    assert isinstance(result["advanced"], bool)
    assert result["decidedBy"] in ("RULE", "MODEL")
    assert result["reason"]
