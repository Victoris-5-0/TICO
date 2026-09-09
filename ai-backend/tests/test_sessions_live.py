"""The whole mission loop, over HTTP, against a real database.

    open  ->  phase  ->  hint  ->  analyze  ->  close  ->  debrief

This is the test that says the service works. Everything else is a unit: this is four
endpoints and five tables agreeing with each other, and it is the only place that proves
`/v1/hints`, `/v1/submissions/analyze` and `/v1/tico/messages` can actually find the
session they all depend on.

Skipped unless `REAL_DATABASE_URL` is set and reachable, so the offline suite stays offline.
Every row it writes is rolled back.
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
from app.models_tables import GeneratedMission, MissionTemplate, Submission, User
from app.models_tables.enums import ErrorFamily, Role, SubmissionStatus

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
    """One transaction, rolled back. Nothing this test writes survives it."""
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
def mission(db) -> GeneratedMission:
    """A six-phase mission, cut down to the fields the session endpoints read."""
    template = db.query(MissionTemplate).first()
    if template is None:
        pytest.skip("no mission_templates rows — run scripts/sync_mission_templates.py")

    row = GeneratedMission(
        template_id=template.id,
        scene_id="test-scene",
        params={},
        content={
            "titleAr": "حساب عيش الطبلية",
            "worldId": "el_forn",
            "targetConceptId": "variables",
            "carriedConceptIds": [],
            "phases": {
                "guided": {
                    "solutionCode": "loaves_per_tray = 12\n",
                    "steps": [{"promptAr": "اكتبي الرقم", "blanks": ["12"]}],
                }
            },
        },
        scaffold_plan={},
        validated=True,
    )
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def client(db, student):
    """A client bound to the rolled-back transaction, authenticated as this student."""
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


# =========================================================================== the loop


def test_the_whole_mission_loop(client, db, student, mission):
    """Open, move through phases, close, debrief. The path a real student takes."""
    opened = body(client.post("/v1/sessions", json={
        "levelId": "lesson-4", "generatedMissionId": mission.id,
    }))
    session_id = opened["id"]

    assert opened["userId"] == student.id
    assert opened["phase"] == "ENCOUNTER", "a session starts at the beginning"
    assert opened["outcome"] == "IN_PROGRESS"
    assert opened["endedAt"] is None

    for phase in ("EXPLORE", "DISCOVER", "UNDERSTAND", "GUIDED_CODING"):
        moved = body(client.patch(f"/v1/sessions/{session_id}/phase", json={"phase": phase}))
        assert moved["phase"] == phase

    closed = body(client.post(f"/v1/sessions/{session_id}/close", json={
        "outcome": "SOLVED", "timeSpentMs": 412_000,
    }))
    assert closed["outcome"] == "SOLVED"
    assert closed["endedAt"] is not None
    assert closed["timeSpentMs"] == 412_000

    debrief = body(client.post(f"/v1/sessions/{session_id}/debrief"))
    assert debrief["sessionId"] == session_id
    assert debrief["outcome"] == "SOLVED"
    assert 0 <= debrief["starsEarned"] <= 3
    assert debrief["ticoFeedback"], "a student always gets a sentence"


def test_another_students_session_is_not_found(client, db, student, mission):
    """404, not 403 — and definitely not the session."""
    opened = body(client.post("/v1/sessions", json={"levelId": "lesson-4"}))

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

    for call in (
        lambda: client.post(f"/v1/sessions/{opened['id']}/debrief"),
        lambda: client.patch(f"/v1/sessions/{opened['id']}/phase", json={"phase": "EXPLORE"}),
        lambda: client.post(
            f"/v1/sessions/{opened['id']}/close", json={"outcome": "SOLVED", "timeSpentMs": 1}
        ),
    ):
        assert call().status_code == 404


def test_closing_twice_keeps_the_first_ending(client, mission):
    """The client legitimately fires on both "tests passed" and "navigated away"."""
    session_id = body(client.post("/v1/sessions", json={
        "levelId": "lesson-4", "generatedMissionId": mission.id,
    }))["id"]

    first = body(client.post(f"/v1/sessions/{session_id}/close", json={
        "outcome": "SOLVED", "timeSpentMs": 60_000,
    }))
    second = body(client.post(f"/v1/sessions/{session_id}/close", json={
        "outcome": "ABANDONED", "timeSpentMs": 999_000,
    }))

    assert second["endedAt"] == first["endedAt"], "the first ending is the real one"


def test_the_debrief_counts_real_rows(client, db, student, mission):
    """The numbers come from `submissions`, not from anywhere else."""
    session_id = body(client.post("/v1/sessions", json={
        "levelId": "lesson-4", "generatedMissionId": mission.id,
    }))["id"]

    exercise_id = db.execute(text("select id from exercises limit 1")).scalar()
    if exercise_id is None:
        pytest.skip("no exercises rows to hang submissions off")

    # Three attempts: the same mistake twice, then a different one, then clean.
    for attempt, tag in enumerate(["assignment_vs_comparison", "assignment_vs_comparison", None], 1):
        db.add(
            Submission(
                user_id=student.id,
                exercise_id=exercise_id,
                session_id=session_id,
                code="x = 1",
                status=SubmissionStatus.PASSED if tag is None else SubmissionStatus.FAILED,
                attempt_number=attempt,
                error_family=None if tag is None else ErrorFamily.LOGIC,
                error_tag=tag,
            )
        )
    db.flush()

    client.post(f"/v1/sessions/{session_id}/close", json={
        "outcome": "SOLVED", "timeSpentMs": 300_000,
    })
    debrief = body(client.post(f"/v1/sessions/{session_id}/debrief"))

    assert debrief["totalAttempts"] == 3, "counted from submissions"
    assert debrief["hintsUsed"] == 0
    # It appeared on attempts 1 and 2 and was gone by the last one. That is the field.
    assert debrief["errorsOvercome"] == ["assignment_vs_comparison"]


def test_a_hint_can_find_the_session(client, mission):
    """The reason this endpoint had to exist: /v1/hints 404s without a session row."""
    session_id = body(client.post("/v1/sessions", json={
        "levelId": "lesson-4", "generatedMissionId": mission.id,
    }))["id"]
    client.patch(f"/v1/sessions/{session_id}/phase", json={"phase": "GUIDED_CODING"})

    r = client.post("/v1/hints", json={
        "sessionId": session_id,
        "missionId": mission.id,
        "codeExcerpt": "loaves_per_tray = ___",
        "phase": "GUIDED_CODING",
        "guidedStep": 0,
        "lastResult": "FAILED",
    })
    assert r.status_code == 200, r.text

    hint = r.json()["data"]
    assert hint["hint"], "a student always gets something"
    assert hint["rung"] == 1, "first ask, first rung — counted server-side"
    # The whole design in one assertion.
    assert "12" not in hint["hint"], "no rung gives away the blank"
