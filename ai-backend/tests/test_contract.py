"""The cross-service contract, enforced.

Every failure in this file is a failure the client team would otherwise have hit at
integration time, in a demo week, with no way to tell whose side was wrong. That is
exactly what happened once already: the client implemented
`docs/06-data-model-and-contracts.md` in camelCase, the Python DTOs drifted to
snake_case, and nothing failed until a real request 422'd on five fields at once.

So the rule is not "remember to keep them in sync". The rule is that drift is a red build.
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest

from app.api.v1._stub import STUB_HEADER
from tests.conftest import data, meta

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
AI_CLIENT_TS = REPO_ROOT / "client" / "src" / "lib" / "ai" / "client.ts"


# ===========================================================================  envelope


def test_success_bodies_are_enveloped(client):
    """docs/06: "Success bodies contain `data` and `meta`"."""
    payload = client.get("/v1/health").json()
    assert set(payload) == {"data", "meta"}


def test_every_response_carries_a_request_id(client):
    r = client.get("/v1/health")
    assert r.headers["X-Request-ID"]
    assert meta(r)["request_id"] == r.headers["X-Request-ID"]


def test_a_supplied_request_id_is_echoed_not_replaced(client):
    """The client generates the id so one trace spans Next.js and Python."""
    r = client.get("/v1/health", headers={"X-Request-ID": "01JTRACE"})
    assert r.headers["X-Request-ID"] == "01JTRACE"
    assert meta(r)["request_id"] == "01JTRACE"


def test_meta_reports_whether_the_endpoint_is_still_a_stub(client):
    assert meta(client.post("/v1/sessions", json={"level_id": "x"}))["stub"] is True
    assert meta(client.get("/v1/health"))["stub"] is False


def test_errors_use_the_documented_shape(client):
    r = client.post("/v1/hints", json={"nope": 1})
    assert r.status_code == 422
    err = r.json()["error"]
    assert set(err) == {"code", "message", "request_id", "retryable", "details"}
    assert err["code"] == "validation_error"
    assert err["retryable"] is False
    assert err["request_id"] == r.headers["X-Request-ID"]


def test_errors_never_leak_a_stack_trace(client):
    r = client.post("/v1/hints", json={"nope": 1})
    blob = json.dumps(r.json())
    for leak in ("Traceback", "site-packages", ".py\", line", "psycopg2"):
        assert leak not in blob, f"{leak!r} reached a browser-facing error"


def test_sse_is_never_wrapped(client):
    """An envelope around a token stream would defeat the point of streaming."""
    r = client.post("/v1/tico/messages", json={"session_id": "s1", "message": "hi"})
    assert r.headers["content-type"].startswith("text/event-stream")
    assert not r.text.lstrip().startswith("{\"data\"")


# ========================================================================  wire casing

_SNAKE = re.compile(r"^[a-z]+(_[a-z0-9]+)+$")
#: docs/06 spells these snake_case inside the `error` object. It is the authority, so
#: they stay that way; an inconsistency the contract states beats a tidier one nobody
#: agreed to.
_ALLOWED_SNAKE = {"request_id", "retryable"}


def test_no_snake_case_reaches_the_wire(client):
    """The single rule that makes hand-written TypeScript unnecessary."""
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    offenders = [
        f"{name}.{prop}"
        for name, sch in schemas.items()
        for prop in sch.get("properties", {})
        if _SNAKE.match(prop) and prop not in _ALLOWED_SNAKE
    ]
    assert not offenders, (
        "snake_case leaked into the public schema. Every DTO must inherit from "
        f"app.schemas.common.Schema or ORMSchema: {offenders}"
    )


def test_python_callers_may_still_use_snake_case():
    """`populate_by_name` — so internal callers and fixtures are not forced to shout.

    Checked against the model rather than over HTTP: `/v1/hints` now needs a database,
    and whether a DTO accepts snake_case is a question about the DTO.
    """
    from app.schemas.hints import HintRequest

    body = HintRequest(
        session_id="snake-in",
        mission_id="m1",
        code_excerpt="x = 1",
        last_result="FAILED",
    )
    assert body.session_id == "snake-in"
    # And it still goes out camelCase, whichever way it came in.
    assert "sessionId" in body.model_dump(by_alias=True)


# =====================================================  the client calls what exists

pytestmark_client = pytest.mark.skipif(
    not AI_CLIENT_TS.exists(), reason="client/src/lib/ai/client.ts not present"
)


def _paths_the_client_calls() -> set[str]:
    src = AI_CLIENT_TS.read_text(encoding="utf-8")
    found = set()
    for m in re.finditer(r"[('`](/v1/[^'`\s)]*|/health)[)'`,]", src):
        found.add(
            m.group(1)
            .replace("${studentId}", "{student_id}")
            .replace("${sessionId}", "{session_id}")
        )
    return found


@pytestmark_client
def test_every_path_the_client_calls_exists(client):
    """The check that turns a 404 in demo week into a red build now."""
    live = set(client.get("/openapi.json").json()["paths"])
    called = _paths_the_client_calls()
    assert called, "parsed no paths out of client.ts — has the parser drifted?"

    missing = sorted(called - live)
    assert not missing, (
        "client/src/lib/ai/client.ts calls paths this service does not serve: "
        f"{missing}. Either add the route or delete the client method."
    )


@pytestmark_client
def test_the_clients_hint_call_is_accepted_verbatim():
    """The exact body `hint.service.ts` builds. This is the call that used to 422.

    Validated against the DTO rather than over HTTP — the endpoint now needs a database,
    and the question here is whether the client's field names still fit the contract.
    """
    from app.schemas.hints import HintRequest, HintResponse

    body = HintRequest.model_validate(
        {
            "sessionId": "demo-session-1",
            "missionId": "demo-exercise-conditional-gate",
            "codeExcerpt": "if x = 5:\n    print('hi')",
            "lastResult": "ERROR",
            "locale": "ar-EG",
        }
    )
    assert body.mission_id == "demo-exercise-conditional-gate"

    # And the two fields `hint.service.ts` reads back are still on the response.
    fields = HintResponse.model_fields
    assert "hint" in fields and "cached" in fields


# ==============================================================  the new endpoints


def test_generate_mission_returns_an_exercise_shaped_payload(client):
    r = client.post("/v1/missions/generate", json={"concept": "conditionals"})
    assert r.status_code == 200
    body = data(r)
    assert body["validated"] is True
    assert body["concepts"]["primary"] == "conditionals"
    assert body["testCases"] and {"input", "expectedOutput"} <= set(body["testCases"][0])
    assert len(body["hints"]) == 4, "one authored fallback per rung"


def test_generate_mission_accepts_an_empty_body(client):
    """Every field is optional: the server derives the rest from the student."""
    assert client.post("/v1/missions/generate", json={}).status_code == 200


def test_debrief_counts_are_server_side(client):
    r = client.post("/v1/sessions/s1/debrief")
    assert r.status_code == 200
    body = data(r)
    assert body["sessionId"] == "s1"
    assert 0 <= body["starsEarned"] <= 3
    assert body["ticoFeedback"]
    # the field worth having: mistakes that stopped happening
    assert isinstance(body["errorsOvercome"], list)


@pytestmark_client
def test_the_generated_typescript_is_not_stale():
    """`types.ts` must match the current schema, or the client is coding against a ghost.

    This is the test that makes generation actually reliable rather than a convention
    someone remembers. Change a DTO, forget to regenerate, and the build goes red here.
    """
    import importlib.util

    spec_path = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "gen_client_types.py"
    spec = importlib.util.spec_from_file_location("gen_client_types", spec_path)
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)

    current = gen.OUT.read_text(encoding="utf-8")
    assert gen.render() == current, (
        "client/src/lib/ai/types.ts is out of date with the Pydantic schemas.\n"
        "Run: cd ai-backend && python scripts/gen_client_types.py"
    )


def test_every_stub_still_announces_itself(client):
    for call in (
        lambda: client.post("/v1/missions/generate", json={}),
        lambda: client.post("/v1/sessions/s1/debrief"),
    ):
        assert call().headers[STUB_HEADER] == "1"
