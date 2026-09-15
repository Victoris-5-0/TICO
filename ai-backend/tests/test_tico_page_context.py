"""Page context and robot identity regressions; no database or provider calls."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from pydantic import ValidationError
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.ai.graphs.tico_chat import generate_response_node, run_tico_chat
from app.ai.prompts.tico_chat import get_tico_chat_system_prompt
from app.schemas.tico import TicoMessageRequest
from app.services import tico_chat
from app.api.v1.tico import router
from app.core.auth import get_current_user
from app.database import get_db


def test_page_chat_does_not_require_a_mission_but_mission_chat_does():
    assert TicoMessageRequest(page="landing", message="What is TICO?").session_id is None
    assert TicoMessageRequest(page="analysis", message="What is a streak?").session_id is None
    with pytest.raises(ValidationError):
        TicoMessageRequest(message="Help with my mission")
    assert TicoMessageRequest(sessionId="owned", message="Help").page == "mission"


@pytest.mark.parametrize("page,topic", [("landing", "Google sign-in"), ("analysis", "hint ladder")])
def test_page_prompt_describes_the_right_page_and_robot(page, topic):
    prompt = get_tico_chat_system_prompt(page=page, locale="en")
    assert topic in prompt
    assert "الروبوت البرتقالي" in prompt
    assert "هدهد" not in prompt
    assert "hoopoe" not in prompt.lower()
    assert "only" in prompt  # mission background is conditional on the user's question


def service_call(*, user="u1", page="landing", message="What is TICO?", session="s1"):
    db = MagicMock()
    result = SimpleNamespace(response="Hello", model_name="mock", is_blocked=False, offered_hint_rung=None)
    with patch.object(tico_chat.users, "ensure"), \
         patch.object(tico_chat.session_q, "get_owned", return_value=SimpleNamespace()), \
         patch.object(tico_chat, "_mission_context", return_value=("bakery", "Trays", "variables", ["trays"], ["3"])) as context, \
         patch.object(tico_chat, "run_tico_chat", return_value=result) as graph, \
         patch.object(tico_chat.ai_log, "log"):
        frames = list(tico_chat.reply(db, user_id=user, session_id=session, page=page,
            message=message, conversation_id="conversation", locale="en"))
        assert '"done": true' in frames[-1]
        return graph.call_args.kwargs, context.call_count


@pytest.mark.parametrize("page,message", [
    ("landing", "How do I sign in?"),
    ("analysis", "What does hint dependency mean?"),
    ("analysis", "أهلاً تيكو، يعني إيه الإحصائيات دي؟"),
])
def test_page_questions_never_receive_latest_mission_context(page, message):
    args, context_calls = service_call(page=page, message=message)
    assert context_calls == 0
    assert args["mission_title"] is None
    assert args["solution_identifiers"] is None
    assert args["page"] == page
    assert args["locale"] == "en"


@pytest.mark.parametrize("message", ["Help with my bakery mission", "ممكن تساعدني في مهمة عد الصواني؟"])
def test_explicit_mission_question_can_use_owned_mission_background(message):
    args, calls = service_call(message=message)
    assert calls == 1
    assert args["mission_title"] == "Trays"
    assert args["solution_identifiers"] == ["trays"]


def test_page_chat_works_for_learners_with_no_sessions():
    args, calls = service_call(session=None)
    assert calls == 0
    assert args["session_id"]


def test_conversation_threads_are_separate_by_user_page_and_mission_topic():
    first, _ = service_call()
    other_user, _ = service_call(user="u2")
    other_page, _ = service_call(page="analysis")
    mission, _ = service_call(message="Explain my mission")
    assert len({a["session_id"] for a in (first, other_user, other_page, mission)}) == 4


def test_unowned_session_is_rejected_before_streaming_or_calling_a_model():
    with patch.object(tico_chat.users, "ensure"), \
         patch.object(tico_chat.session_q, "get_owned", return_value=None), \
         patch.object(tico_chat, "run_tico_chat") as graph:
        with pytest.raises(tico_chat.SessionNotFound):
            tico_chat.reply(MagicMock(), user_id="u1", session_id="other-user", page="landing", message="Hello")
        graph.assert_not_called()


def test_analysis_metrics_reach_the_model_in_page_context():
    model = MagicMock()
    model.invoke.return_value = AIMessage(content="Your dashboard records 8 attempts.")
    with patch("app.ai.graphs.tico_chat.get_model", return_value=model):
        result = run_tico_chat(user_message="How many attempts?", page="analysis",
            analysis_summary={"submissions":8}, locale="en", checkpointer=MemorySaver())
    assert "8" in result.response
    assert '"submissions": 8' in model.invoke.call_args.args[0][0].content


@pytest.mark.parametrize("old_identity", ["أنا هدهد مصري", "I'm an Egyptian hoopoe"])
def test_retired_identity_retries_then_falls_back_to_robot_without_mission_coaching(old_identity):
    model = MagicMock()
    model.invoke.return_value = AIMessage(content=old_identity)
    with patch("app.ai.graphs.tico_chat.get_model", return_value=model):
        result = run_tico_chat(user_message="Who are you?", page="landing", locale="en", checkpointer=MemorySaver())
    assert model.invoke.call_count == 2
    assert "orange robot" in result.response
    assert "mission" not in result.response
    assert "هدهد" not in result.response
    assert "hoopoe" not in result.response.lower()


def test_old_assistant_identity_is_removed_from_conversation_history():
    model = MagicMock()
    model.invoke.return_value = AIMessage(content="I'm the orange robot.")
    with patch("app.ai.graphs.tico_chat.get_model", return_value=model):
        generate_response_node({"page":"landing", "messages":[AIMessage(content="أنا هدهد مصري"), HumanMessage(content="Hello")]})
    assert all("هدهد" not in str(m.content) for m in model.invoke.call_args.args[0])


@pytest.mark.parametrize("page", ["landing", "analysis"])
def test_page_http_contract_streams_without_a_mission_session(page):
    app = FastAPI()
    app.include_router(router, prefix="/v1")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="u1")
    app.dependency_overrides[get_db] = lambda: MagicMock()
    result = SimpleNamespace(response="Hello", model_name="mock", is_blocked=False, offered_hint_rung=None)
    with patch.object(tico_chat.users, "ensure"), \
         patch.object(tico_chat, "run_tico_chat", return_value=result), \
         patch.object(tico_chat.ai_log, "log"):
        response = TestClient(app).post("/v1/tico/messages", json={"page":page, "message":"Hello", "locale":"en"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert '"delta": "Hello"' in response.text
    assert '"done": true' in response.text


def test_unknown_session_returns_http_404_instead_of_a_broken_stream():
    app = FastAPI()
    app.include_router(router, prefix="/v1")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id="u1")
    app.dependency_overrides[get_db] = lambda: MagicMock()
    with patch.object(tico_chat.users, "ensure"), \
         patch.object(tico_chat.session_q, "get_owned", return_value=None):
        response = TestClient(app).post("/v1/tico/messages", json={"page":"landing", "sessionId":"unowned", "message":"Hello"})
    assert response.status_code == 404
