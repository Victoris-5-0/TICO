"""Every stubbed endpoint answers, with the right shape and the stub marker.

These tests are the contract's guard rail. When a milestone replaces a stub, the
`X-TICO-Stub` assertion for that endpoint is the line you delete — everything else
should still pass, because the shapes do not change.
"""

import json

from app.api.v1._stub import STUB_HEADER
from tests.conftest import data

SESSION = {"level_id": "demo-exercise-conditional-gate"}


def hint_body(session_id: str, **over) -> dict:
    """A hint request in the shape docs/06 specifies and the client actually sends."""
    return {
        "sessionId": session_id,
        "missionId": "demo-exercise-conditional-gate",
        "codeExcerpt": "x = 1",
        "lastResult": "FAILED",
        "locale": "ar-EG",
        **over,
    }


# `/v1/submissions/analyze` and `/v1/tico/messages` used to be stubbed here. Both are
# real now — they check session ownership, call a model and write to Postgres — so they
# need a database and cannot be tested alongside the stubs.
#
# Their behaviour is covered by:
#   test_classify_error.py   the classifier and its escalation, offline
#   test_moderation.py       what chat blocks before any model call, offline
#   test_tico_chat.py        the chat graph's nodes and leak guard, offline
#   test_contract.py         that the response shapes still match the client


def test_open_session(client):
    r = client.post("/v1/sessions", json=SESSION)
    assert r.status_code == 201
    assert r.headers[STUB_HEADER] == "1"
    body = data(r)
    assert body["phase"] == "ENCOUNTER"
    assert body["outcome"] == "IN_PROGRESS"
    assert body["hintsUsed"] == 0


def test_close_session(client):
    r = client.post(
        "/v1/sessions/s1/close", json={"outcome": "SOLVED", "time_spent_ms": 254000}
    )
    assert r.status_code == 200
    assert data(r)["outcome"] == "SOLVED"
    assert data(r)["endedAt"] is not None


# The hint ladder used to be stubbed here. It is real now — it counts prior hint
# events, calls Gemini for the rung it decided, and runs two leak guards over the
# reply — so it needs a database and cannot be tested alongside the stubs.
#
# Its behaviour is covered by:
#   test_hint_ladder.py    the ladder and both guards, offline
#   test_hints_live.py     the whole pipeline, against a real database


def test_refresh_reports_who_decided(client):
    r = client.post("/v1/students/demo-student-1/refresh")
    assert r.status_code == 200
    body = data(r)
    assert body["decidedBy"] in {"RULE", "MODEL"}
    assert body["reason"]
    assert len(body["concepts"]) == 4


def test_beginner_plan_requires_everything(client):
    r = client.post("/v1/students/demo-student-1/plan", json={"is_beginner": True})
    assert r.status_code == 200
    body = data(r)
    assert body["skippedCount"] == 0
    assert all(l["requirement"] == "REQUIRED" for l in body["lessons"])


def test_experienced_plan_skips_and_explains_every_skip(client):
    r = client.post(
        "/v1/students/demo-student-1/plan",
        json={"is_beginner": False, "diagnostic_session_id": "d1"},
    )
    body = data(r)
    assert body["skippedCount"] == 3
    for lesson in body["lessons"]:
        if lesson["requirement"] == "OPTIONAL":
            assert lesson["reason"], "every skip must carry a reason"
            assert lesson["decidedBy"] == "MODEL", "every skip is model-reviewed"


# `/v1/missions/next` used to be stubbed here. It is real now — it selects a concept,
# generates a mission with Gemini, validates it by running the code, and persists it — so
# it needs a database and cannot be tested offline alongside the stubs.
#
# Its behaviour is covered by:
#   test_generation.py       the composer, validator and fallback, offline
#   test_missions_live.py    the whole pipeline, against a real database


def test_challenge_has_no_scaffolding(client):
    r = client.post("/v1/challenges/next", json={"exclude_level_ids": []})
    assert r.status_code == 200
    body = data(r)
    assert body["scaffoldPlan"]["scaffold"] == {}
    assert body["scaffoldPlan"]["difficultyBand"] >= 6


def _sse_frames(text: str) -> list[dict]:
    return [
        json.loads(line[len("data: ") :])
        for line in text.splitlines()
        if line.startswith("data: ")
    ]


def test_unknown_field_is_rejected(client):
    r = client.post("/v1/hints", json={**hint_body("s1"), "oops": 1})
    assert r.status_code == 422, "extra=forbid should reject unknown fields"


def test_openapi_exposes_all_seven(client):
    paths = client.get("/openapi.json").json()["paths"]
    for p in [
        "/v1/health",
        "/v1/sessions",
        "/v1/hints",
        "/v1/submissions/analyze",
        "/v1/students/{student_id}/refresh",
        "/v1/students/{student_id}/plan",
        "/v1/missions/next",
        "/v1/tico/messages",
        "/v1/challenges/next",
    ]:
        assert p in paths, f"{p} missing from the OpenAPI spec"
