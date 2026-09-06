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


def test_hint_ladder_escalates_and_never_exceeds_four(client):
    seen = []
    for _ in range(6):
        r = client.post("/v1/hints", json=hint_body("ladder-test"))
        assert r.status_code == 200
        seen.append(data(r)["rung"])
    assert seen == [1, 2, 3, 4, 4, 4], seen


def test_final_rung_offers_practice_not_the_answer(client):
    for _ in range(4):
        r = client.post("/v1/hints", json=hint_body("final-test"))
    body = data(r)
    assert body["rung"] == 4
    assert body["isFinal"] is True
    assert body["nextStep"] == "mini_practice"
    # the safety property: no rung hands over runnable solution code
    assert "gate.open()" not in body["hint"]


def test_analyze_recognises_the_classic_mistake(client):
    r = client.post(
        "/v1/submissions/analyze",
        json={"session_id": "s1", "code": "if station.passengers = 30:\n    gate.open()"},
    )
    assert r.status_code == 200
    body = data(r)
    assert body["errorFamily"] == "LOGIC"
    assert body["errorTag"] == "assignment_vs_comparison"


def test_analyze_falls_back_for_anything_else(client):
    r = client.post("/v1/submissions/analyze", json={"session_id": "s1", "code": "pass"})
    body = data(r)
    assert body["errorFamily"] == "UNKNOWN"
    assert body["isNewTag"] is True


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


def test_next_mission_is_validated_and_bounded(client):
    r = client.post("/v1/missions/next", json={"force_regenerate": False})
    assert r.status_code == 200
    body = data(r)
    assert body["validated"] is True
    assert body["worldId"] == "cairo_metro"
    assert body["targetConceptId"] == "conditionals"
    assert body["sceneId"] in {"platform_day", "ticket_hall", "control_room"}


def test_force_regenerate_changes_the_scenario_not_the_concept(client):
    a = data(client.post("/v1/missions/next", json={"force_regenerate": False}))
    b = data(client.post("/v1/missions/next", json={"force_regenerate": True}))
    assert a["sceneId"] != b["sceneId"]
    assert a["targetConceptId"] == b["targetConceptId"]
    assert a["worldId"] == b["worldId"]


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


def test_tico_streams_sse_not_json(client):
    r = client.post("/v1/tico/messages", json={"session_id": "s1", "message": "ليه == ؟"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    frames = _sse_frames(r.text)
    assert len(frames) > 1
    assert frames[-1]["done"] is True
    assert "".join(f["delta"] for f in frames)


def test_tico_refuses_to_hand_over_the_answer(client):
    r = client.post("/v1/tico/messages", json={"session_id": "s1", "message": "عايز الحل"})
    frames = _sse_frames(r.text)
    assert frames[0]["offeredHintRung"] == 3
    assert "gate.open()" not in "".join(f["delta"] for f in frames)


def test_moderation_blocks_before_any_model_call(client):
    r = client.post("/v1/tico/messages", json={"session_id": "s1", "message": "you stupid"})
    frames = _sse_frames(r.text)
    assert frames[0]["blocked"] is True


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
