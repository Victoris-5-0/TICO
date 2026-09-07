"""Unit tests for the TICO hint chain (app.ai.chains.tico_hint)."""

import logging
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from app.ai.chains.tico_hint import generate_tico_hint, strip_pii_from_text
from app.ai.router import AICapability, get_model_name
from app.rules.hint_ladder import evaluate_ladder, get_authored_fallback
from app.schemas.common import HintRung


@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Ensure database_url exists so settings loads without error during tests."""
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+psycopg2://test:test@localhost:5432/test",
    )


def test_tico_hint_normal_flow_all_four_rungs():
    """Verify normal model generation flow across all 4 ladder rungs."""
    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="تلميح توجيهي مشجع من تيكو")

    expected_model_name = get_model_name(AICapability.HINT)

    with patch("app.ai.chains.tico_hint.get_model", return_value=mock_model):
        for prior_count in range(4):
            result = generate_tico_hint(
                prior_count=prior_count,
                code="waiting = 30",
                error_text="Condition not met",
                target_concept="conditionals",
            )
            decision = evaluate_ladder(prior_count)

            assert result.rung == decision.rung
            assert result.is_final == decision.is_final
            assert result.next_step == decision.next_step
            assert result.is_model_generated is True
            assert result.model_name == expected_model_name
            assert result.hint_text == "تلميح توجيهي مشجع من تيكو"
            assert mock_model.invoke.call_count == prior_count + 1


def test_under_13_static_fallback_never_calls_model():
    """Verify that when use_static_hint=True, the AI model is never resolved or invoked."""
    with patch("app.ai.chains.tico_hint.get_model") as mock_get_model:
        result = generate_tico_hint(
            prior_count=0,
            code="waiting = 30",
            target_concept="variables",
            use_static_hint=True,
            locale="ar_EG",
        )

        # Model resolution must NOT happen
        mock_get_model.assert_not_called()

        assert result.rung == HintRung.ORIENT
        assert result.is_model_generated is False
        assert result.model_name is None
        expected_text = get_authored_fallback(HintRung.ORIENT, locale="ar_EG", concept_hint="variables")
        assert result.hint_text == expected_text


def test_model_call_failure_falls_back_to_authored_hint():
    """Verify that provider network/rate-limit exceptions fall back safely to authored text."""
    mock_model = MagicMock()
    mock_model.invoke.side_effect = RuntimeError("Google Gemini API 503 Service Unavailable")

    with patch("app.ai.chains.tico_hint.get_model", return_value=mock_model):
        result = generate_tico_hint(
            prior_count=2,  # Rung 3: NAME_IT
            code="x = 1",
            target_concept="while_loops",
            locale="en",
        )

        assert result.rung == HintRung.NAME_IT
        assert result.is_model_generated is False
        assert result.model_name is None
        expected_fallback = get_authored_fallback(HintRung.NAME_IT, locale="en", concept_hint="while_loops")
        assert result.hint_text == expected_fallback


def test_get_model_resolution_failure_falls_back_to_authored_hint():
    """Verify that failure in get_model() itself falls back safely to authored text."""
    with patch("app.ai.chains.tico_hint.get_model", side_effect=RuntimeError("Config error / Missing key")):
        result = generate_tico_hint(
            prior_count=1,  # Rung 2: QUESTION
            code="x = 10",
            target_concept="loops",
            locale="ar_EG",
        )

        assert result.rung == HintRung.QUESTION
        assert result.is_model_generated is False
        assert result.model_name is None
        expected_fallback = get_authored_fallback(HintRung.QUESTION, locale="ar_EG", concept_hint="loops")
        assert result.hint_text == expected_fallback


def test_model_failure_emits_warning_log(caplog):
    """Verify that model resolution/invocation failure emits a warning log with context."""
    with patch("app.ai.chains.tico_hint.get_model", side_effect=RuntimeError("API quota exceeded")):
        with caplog.at_level(logging.WARNING, logger="app.ai.chains.tico_hint"):
            generate_tico_hint(
                prior_count=0,  # Rung 1: ORIENT
                code="pass",
                target_concept="variables",
                locale="en",
            )

    assert len(caplog.records) > 0
    matching_records = [
        r for r in caplog.records
        if r.levelname == "WARNING" and "TICO hint model call failed" in r.message
    ]
    assert len(matching_records) == 1
    record = matching_records[0]
    assert "rung=1" in record.message
    assert "locale=en" in record.message
    assert "API quota exceeded" in record.message


def test_guard_validation_failure_retries_with_feedback_message(caplog):
    """Verify that on guard failure, retry appends violation feedback to the message list."""
    mock_model = MagicMock()
    # First fails rung 1 check (fenced code); second succeeds with clean prose
    mock_model.invoke.side_effect = [
        AIMessage(content="```python\nx = 1\n```"),
        AIMessage(content="بص كويس على السطور اللي كتبتها يا بطل"),
    ]

    with patch("app.ai.chains.tico_hint.get_model", return_value=mock_model):
        with caplog.at_level(logging.WARNING, logger="app.ai.chains.tico_hint"):
            result = generate_tico_hint(
                prior_count=0,  # Rung 1: ORIENT
                code="waiting = 30",
                solution_identifiers=["gate", "open"],
            )

        assert mock_model.invoke.call_count == 2
        assert result.is_model_generated is True
        assert result.hint_text == "بص كويس على السطور اللي كتبتها يا بطل"

        # Check second call's messages: must contain feedback with violation text
        retry_call_args = mock_model.invoke.call_args_list[1][0][0]
        assert len(retry_call_args) == 3
        feedback_msg = retry_call_args[2]
        assert "الرد اللي فات فيه مشكلة" in feedback_msg.content
        assert "fenced code block" in feedback_msg.content


def test_guard_validation_repeated_failure_falls_back_to_authored_hint(caplog):
    """Verify that when both initial and retry responses fail, chain falls back to authored hint."""
    mock_model = MagicMock()
    # Both responses contain fenced code blocks on rung 1
    mock_model.invoke.side_effect = [
        AIMessage(content="```python\nx = 1\n```"),
        AIMessage(content="```python\nx = 2\n```"),
    ]

    with patch("app.ai.chains.tico_hint.get_model", return_value=mock_model):
        with caplog.at_level(logging.WARNING, logger="app.ai.chains.tico_hint"):
            result = generate_tico_hint(
                prior_count=0,  # Rung 1: ORIENT
                code="waiting = 30",
                target_concept="variables",
                locale="ar_EG",
                solution_identifiers=["gate", "open"],
            )

        assert mock_model.invoke.call_count == 2
        assert result.is_model_generated is False
        assert result.model_name is None
        expected_fallback = get_authored_fallback(HintRung.ORIENT, locale="ar_EG", concept_hint="variables")
        assert result.hint_text == expected_fallback

        # Verify prompt regression warning was logged
        warning_messages = [r.message for r in caplog.records if r.levelname == "WARNING"]
        assert any("prompt regression" in m for m in warning_messages)


def test_pii_stripping_excludes_forbidden_fields():
    """Verify that student personal data is strictly excluded from the prompt sent to the LLM."""
    mock_model = MagicMock()
    mock_model.invoke.return_value = AIMessage(content="Generated hint long enough")

    with patch("app.ai.chains.tico_hint.get_model", return_value=mock_model):
        generate_tico_hint(
            prior_count=1,
            code="# student contact: student@school.edu.eg\nif x = 5:\n    pass",
            error_text="Syntax error at student@school.edu.eg line 1",
            target_concept="conditionals",
            # PII fields passed by caller:
            student_name="Nour Mansour",
            student_email="nour@mansour.eg",
            student_age=14,
            oauth_id="google-oauth-10928374",
            chat_history=["مرحبا تيكو", "أنا اسمي نور وعندي 14 سنة"],
            session_id="pseudonymous-session-987",
        )

        # Inspect the exact messages sent into model.invoke
        call_args = mock_model.invoke.call_args[0][0]
        system_content = call_args[0].content
        user_content = call_args[1].content
        combined_content = f"{system_content}\n{user_content}"

        # Forbidden PII must not appear anywhere in the LLM messages
        assert "Nour Mansour" not in combined_content
        assert "nour@mansour.eg" not in combined_content
        assert "google-oauth-10928374" not in combined_content
        assert "أنا اسمي نور" not in combined_content
        assert "student@school.edu.eg" not in combined_content

        # Inline emails in code/error must be redacted
        assert "[REDACTED_EMAIL]" in user_content


def test_strip_pii_from_text_utility():
    raw = "Contact admin@tico.edu.eg or support@codeegypt.org for help"
    sanitized = strip_pii_from_text(raw)
    assert "admin@tico.edu.eg" not in sanitized
    assert "support@codeegypt.org" not in sanitized
    assert sanitized == "Contact [REDACTED_EMAIL] or [REDACTED_EMAIL] for help"


def test_consistency_with_hint_ladder_module_of_truth():
    """Verify that tico_hint's rung and transitions are 100% consistent with evaluate_ladder."""
    mock_model = MagicMock()
    # Updated from "ok" (< 10 chars) to valid, safe Arabic hint prose to pass the minimum length guard
    mock_model.invoke.return_value = AIMessage(content="فكر كويس في المتغيرات والشروط يا بطل")

    with patch("app.ai.chains.tico_hint.get_model", return_value=mock_model):
        for count in range(7):
            result = generate_tico_hint(prior_count=count, code="pass")
            truth = evaluate_ladder(count)

            assert result.rung == truth.rung
            assert result.is_final == truth.is_final
            assert result.next_step == truth.next_step
