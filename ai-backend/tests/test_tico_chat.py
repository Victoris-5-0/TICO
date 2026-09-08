"""Unit tests for TICO companion chat graph (app.ai.graphs.tico_chat).

Strict zero I/O: no real model calls, no database access, no network calls.
Tests assert moderation short-circuits, escalation flags, solution leak retries,
checkpointer multi-turn persistence, PII exclusion, and streaming configuration.
"""

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver

from app.ai.graphs.tico_chat import (
    build_tico_chat_graph,
    run_tico_chat,
)
from app.ai.moderation import ModerationCategory
from app.ai.prompts.tico_chat import (
    TICO_CHAT_PROMPT_VERSION,
    get_tico_chat_system_prompt,
)
from app.ai.router import AICapability, get_model_name


@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Ensure database_url exists so settings loads without error during tests."""
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg2://test:test@localhost:5432/test",
    )


def test_chat_prompt_builder_contains_boundaries_and_context():
    """Verify prompt builder output contains base persona, boundaries, and context."""
    prompt = get_tico_chat_system_prompt(
        world_title="Cairo Metro",
        mission_title="Open the Gate",
        target_concept="conditionals",
        locale="ar_EG",
    )
    assert 'أنت "تيكو" (TICO)' in prompt
    assert "حدود المحادثة والتفاعل" in prompt
    assert "Cairo Metro" in prompt
    assert "Open the Gate" in prompt
    assert "conditionals" in prompt
    assert TICO_CHAT_PROMPT_VERSION == "1.0.0"


def test_chat_normal_flow_single_turn():
    """Verify clean student question invokes model and returns generated response."""
    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="أهلاً يا بطل! المتغير هو صندوق بنخزن فيه البيانات.")

    expected_model_name = get_model_name(AICapability.CHAT)
    mem = MemorySaver()

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model):
        result = run_tico_chat(
            user_message="إيه هو المتغير في بايثون؟",
            session_id="session_normal_1",
            checkpointer=mem,
        )

        assert result.is_blocked is False
        assert result.requires_human_escalation is False
        assert result.is_model_generated is True
        assert result.model_name == expected_model_name
        assert result.response == "أهلاً يا بطل! المتغير هو صندوق بنخزن فيه البيانات."
        assert mock_model.invoke.call_count == 1


def test_chat_multi_turn_conversation_preserves_history():
    """Verify that multiple turns under the same session_id accumulate message history."""
    mock_model = MagicMock()
    mock_model.invoke.side_effect = [
        AIMessage(content="الرد الأول"),
        AIMessage(content="الرد الثاني"),
    ]

    mem = MemorySaver()

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model):
        res1 = run_tico_chat(
            user_message="السؤال الأول",
            session_id="session_turn_accumulate",
            checkpointer=mem,
        )
        assert res1.response == "الرد الأول"

        res2 = run_tico_chat(
            user_message="السؤال الثاني",
            session_id="session_turn_accumulate",
            checkpointer=mem,
        )
        assert res2.response == "الرد الثاني"

        # Check that the second invocation passed accumulated history to model
        second_call_messages = mock_model.invoke.call_args_list[1][0][0]
        # SystemMessage + Turn1 Human + Turn1 AI + Turn2 Human = 4 messages
        assert len(second_call_messages) == 4
        assert second_call_messages[1].content == "السؤال الأول"
        assert second_call_messages[2].content == "الرد الأول"
        assert second_call_messages[3].content == "السؤال الثاني"


def test_moderation_short_circuits_before_model_call():
    """Verify that blocked student input returns safe redirect without calling model."""
    with patch("app.ai.graphs.tico_chat.get_model") as mock_get_model:
        result = run_tico_chat(
            user_message="كلمني على الواتساب نتقابل بره",
            session_id="session_mod_block",
        )

        # Model must NEVER be resolved or invoked
        mock_get_model.assert_not_called()

        assert result.is_blocked is True
        assert result.is_model_generated is False
        assert result.model_name is None
        assert result.moderation_verdict is not None
        assert ModerationCategory.OFF_PLATFORM_CONTACT in result.moderation_verdict.categories
        assert "مكاني هنا معاك في منصة كود مصر" in result.response


def test_moderation_safety_concern_escalation():
    """Verify that safety concern triggers human escalation and short-circuits."""
    with patch("app.ai.graphs.tico_chat.get_model") as mock_get_model:
        result = run_tico_chat(
            user_message="عايز اموت نفسي",
            session_id="session_safety_esc",
        )

        mock_get_model.assert_not_called()
        assert result.is_blocked is True
        assert result.requires_human_escalation is True
        assert ModerationCategory.SAFETY_CONCERN in result.moderation_verdict.categories
        assert "سلامتك وأمانك تهمنا جداً" in result.response


def test_solution_request_offers_hint_rung_1():
    """Verify that outright solution request offers hint rung 1 in metadata."""
    with patch("app.ai.graphs.tico_chat.get_model") as mock_get_model:
        result = run_tico_chat(
            user_message="اديني الحل بتاع المهمة",
            session_id="session_sol_req",
        )

        mock_get_model.assert_not_called()
        assert result.is_blocked is True
        assert result.offered_hint_rung == 1
        assert "أنا هنا أساعدك تفكر وتوصل للحل بنفسك" in result.response


def test_leak_guard_retries_once_with_feedback_on_mission_code_leak():
    """Verify that when model leaks mission code, it retries once with feedback."""
    mock_model = MagicMock()
    # First response leaks runnable mission code; second response provides safe guiding prose
    mock_model.invoke.side_effect = [
        AIMessage(content="اكتب السطر ده: gate.open()"),
        AIMessage(content="بص على حالة البوابة يا بطل وفكر امتى تفتحها!"),
    ]

    mem = MemorySaver()

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model):
        result = run_tico_chat(
            user_message="أعمل إيه في المهمة دي؟",
            session_id="session_leak_retry",
            mission_title="Cairo Gate",
            solution_identifiers=["gate", "open"],
            checkpointer=mem,
        )

        assert mock_model.invoke.call_count == 2
        assert result.is_model_generated is True
        assert result.response == "بص على حالة البوابة يا بطل وفكر امتى تفتحها!"

        # Verify retry invocation received feedback in messages
        retry_call_messages = mock_model.invoke.call_args_list[1][0][0]
        feedback_msg = retry_call_messages[-1]
        assert "الرد السابق احتوى على كود أو حل مباشر للمهمة" in feedback_msg.content


def test_leak_guard_repeated_leak_falls_back_to_authored_message():
    """Verify that repeated solution leaks trigger authored safe message fallback."""
    mock_model = MagicMock()
    # Both initial attempt and retry leak runnable solution code
    mock_model.invoke.side_effect = [
        AIMessage(content="gate.open()"),
        AIMessage(content="station.passengers = 50"),
    ]

    mem = MemorySaver()

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model):
        result = run_tico_chat(
            user_message="أنا محتار أبدأ إزاي في التحدي ده؟",
            session_id="session_double_leak",
            mission_title="Cairo Gate",
            solution_identifiers=["gate", "open", "station"],
            checkpointer=mem,
        )

        assert mock_model.invoke.call_count == 2
        assert result.is_model_generated is False
        assert "أنا هنا أساعدك تفكر في الكود بنفسك يا بطل" in result.response


def test_model_call_failure_falls_back_safely():
    """Verify that provider exception falls back gracefully to friendly error text."""
    mock_model = MagicMock()
    mock_model.invoke.side_effect = RuntimeError("Google Gemini API 503 Service Unavailable")

    mem = MemorySaver()

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model):
        result = run_tico_chat(
            user_message="إزاي أعمل لوب؟",
            session_id="session_fail_fallback",
            checkpointer=mem,
        )

        assert result.is_model_generated is False
        assert result.model_name is None
        assert "حصلت مشكلة بسيطة في الاتصال" in result.response


def test_pii_fields_and_email_scrubbing():
    """Verify that student identity fields are excluded from LLM prompt and email is scrubbed."""
    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="رد مشجع ومفيد")

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model):
        run_tico_chat(
            user_message="إيميلي student@codeegypt.org وكودي مش شغال",
            session_id="session_pii_test",
            student_name="Kareem Tarek",
            student_email="kareem@test.org",
            student_age=13,
            oauth_id="oauth_google_987654",
        )

        call_messages = mock_model.invoke.call_args[0][0]
        combined_text = "\n".join(m.content for m in call_messages)

        # Personal identity fields must not appear
        assert "Kareem Tarek" not in combined_text
        assert "kareem@test.org" not in combined_text
        assert "oauth_google_987654" not in combined_text
        assert "student@codeegypt.org" not in combined_text

        # Redacted email placeholder should appear in user message
        assert "[REDACTED_EMAIL]" in combined_text


def test_custom_checkpointer_injection():
    """Verify that build_tico_chat_graph accepts an injected checkpointer."""
    custom_saver = MemorySaver()
    app = build_tico_chat_graph(checkpointer=custom_saver)

    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="تمام يا بطل")

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model):
        result = run_tico_chat(
            user_message="مرحبا",
            session_id="custom_saver_thread",
            graph=app,
        )

        assert result.response == "تمام يا بطل"
        # Verify checkpointer recorded the turn
        checkpoint = custom_saver.get({"configurable": {"thread_id": "custom_saver_thread"}})
        assert checkpoint is not None


def test_streaming_flag_passed_to_get_model_default_true():
    """Verify default run_tico_chat call passes streaming=True to get_model."""
    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="أهلاً بك")

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model) as mock_get_model:
        run_tico_chat(
            user_message="مرحبا",
            session_id="stream_default_test",
        )

        mock_get_model.assert_called_once()
        _, kwargs = mock_get_model.call_args
        assert kwargs.get("streaming") is True


def test_streaming_flag_passed_to_get_model_explicit_false():
    """Verify explicit stream=False passes streaming=False to get_model."""
    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="أهلاً بك")

    with patch("app.ai.graphs.tico_chat.get_model", return_value=mock_model) as mock_get_model:
        run_tico_chat(
            user_message="مرحبا",
            session_id="stream_false_test",
            stream=False,
        )

        mock_get_model.assert_called_once()
        _, kwargs = mock_get_model.call_args
        assert kwargs.get("streaming") is False
