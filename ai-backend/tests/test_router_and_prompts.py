"""Unit tests for app.ai.router and app.ai.prompts."""

import pytest
from langchain_google_genai import ChatGoogleGenerativeAI

from app.ai.prompts import (
    TICO_BASE_PERSONA,
    TICO_PERSONA_VERSION,
    get_hint_prompt,
    get_tico_system_prompt,
)
from app.ai.router import AICapability, get_model, get_model_name
from app.config import Settings, get_settings, settings


def test_get_model_name_for_all_capabilities():
    """Verify router maps each capability to the configured model in settings."""
    assert get_model_name(AICapability.HINT) == settings.model_hint
    assert get_model_name(AICapability.NPC) == settings.model_npc
    assert get_model_name(AICapability.CLASSIFY) == settings.model_classify
    assert get_model_name(AICapability.REVIEW) == settings.model_review
    assert get_model_name(AICapability.GENERATE) == settings.model_generate
    assert get_model_name(AICapability.CHAT) == settings.model_chat


def test_get_model_name_invalid_capability():
    """Verify unknown capability raises a helpful ValueError."""
    with pytest.raises(ValueError, match="Unknown AI capability"):
        get_model_name("unknown_capability")


def test_capability_input_equivalence():
    """Verify FIX 3: passing AICapability directly or string equivalent produces identical results."""
    assert get_model_name(AICapability.HINT) == get_model_name("hint") == get_model_name("HINT")
    for cap in AICapability:
        assert get_model_name(cap) == get_model_name(cap.value)


@pytest.mark.parametrize(
    "capability, streaming_arg, expected_streaming",
    [
        (AICapability.CHAT, None, True),
        (AICapability.CHAT, False, False),
        (AICapability.CHAT, True, True),
        (AICapability.HINT, None, False),
        (AICapability.HINT, True, True),
        (AICapability.HINT, False, False),
    ],
)
def test_streaming_resolution_matrix(capability, streaming_arg, expected_streaming):
    """Verify streaming defaults and explicit override behavior for all capability combinations."""
    model = get_model(capability, streaming=streaming_arg)
    assert model.streaming is expected_streaming



@pytest.fixture
def no_dotenv(monkeypatch):
    """Stop `Settings` reading the developer's own `.env` during these tests.

    `delenv("GOOGLE_API_KEY")` is not enough on a machine that has a real `.env`: pydantic
    reads the file as well as the environment, so the key comes straight back and the
    production fail-fast test finds a key where it expected none. It passes in CI, where
    there is no `.env`, and fails on every developer's machine — which is the wrong way
    round for a test about a missing key.
    """
    monkeypatch.setitem(Settings.model_config, "env_file", None)


def test_api_key_fail_fast_production(monkeypatch, no_dotenv):
    """Simulate a production-like environment with GOOGLE_API_KEY unset."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    get_settings.cache_clear()

    # Settings instantiation in production must raise ValueError naming GOOGLE_API_KEY
    with pytest.raises(ValueError, match=r"GOOGLE_API_KEY"):
        Settings(
            database_url="postgresql+psycopg2://test:test@localhost:5432/test",
            environment="production",
            google_api_key="",
        )

    # get_settings() in production must also raise ValueError naming GOOGLE_API_KEY
    with pytest.raises(ValueError, match=r"GOOGLE_API_KEY"):
        get_settings()


def test_get_settings_dev_fallback_no_raise(monkeypatch, no_dotenv):
    """Verify get_settings() in development does not raise when GOOGLE_API_KEY is unset."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    get_settings.cache_clear()

    s = get_settings()
    assert s.is_production is False
    assert s.google_api_key == ""


def test_get_model_uses_dev_fallback_key(monkeypatch):
    """Verify get_model() uses 'fake-key-for-dev-mock' in development when GOOGLE_API_KEY is empty.

    app.ai.router imports `settings` from app.config at module load time, so tests
    must patch attributes on that shared singleton object rather than a freshly constructed instance.
    """
    monkeypatch.setattr(settings, "environment", "development", raising=False)
    monkeypatch.setattr(settings, "google_api_key", "", raising=False)

    model = get_model(AICapability.HINT)
    secret_val = (
        model.google_api_key.get_secret_value()
        if hasattr(model.google_api_key, "get_secret_value")
        else str(model.google_api_key)
    )
    assert secret_val == "fake-key-for-dev-mock"


def test_get_model_forbids_fallback_key_in_production(monkeypatch):
    """Confirm get_model() in production uses the real key and never the dev placeholder."""
    # Defense-in-depth: the primary guarantee against a missing key in production is the model_validator in config.py preventing boot entirely; this test only guarantees get_model()'s own conditional never silently substitutes the dev key if it's ever reached with is_production True.
    monkeypatch.setattr(settings, "environment", "production", raising=False)
    monkeypatch.setattr(settings, "google_api_key", "dummy-prod-key-123", raising=False)

    model = get_model(AICapability.HINT)
    secret_val = (
        model.google_api_key.get_secret_value()
        if hasattr(model.google_api_key, "get_secret_value")
        else str(model.google_api_key)
    )
    assert secret_val == "dummy-prod-key-123"
    assert secret_val != "fake-key-for-dev-mock"


def test_tico_persona_prompt():
    """Verify TICO persona prompt adheres to pedagogical, safety and language rules."""
    assert TICO_PERSONA_VERSION == "1.1.0"

    prompt = get_tico_system_prompt(
        world_title="مخبز بلدي",
        mission_title="طباعة رسالة الافتتاح",
        target_concept="output_and_strings",
    )

    # Must contain persona identity
    assert "تيكو" in prompt
    assert "TICO" in prompt

    # Must contain Egyptian phrasing
    assert "الله ينور عليك" in prompt

    # Must enforce English code and no full solutions
    assert "الكود دايماً بالإنجليزية" in prompt
    assert "الحل الكامل" in prompt

    # Context should be injected
    assert "مخبز بلدي" in prompt
    assert "طباعة رسالة الافتتاح" in prompt
    assert "output_and_strings" in prompt


def test_tico_persona_english_mode():
    """Verify English mode append works when requested."""
    prompt_en = get_tico_system_prompt(locale="en_US")
    assert "English interface mode" in prompt_en


def test_hint_prompt_rungs_safety_and_rules():
    """Verify rung-specific constraints in hint prompts."""
    # Rung 1: Orient only - no solution content
    r1 = get_hint_prompt(1, target_concept="for_loops")
    assert "Orient" in r1
    assert "NO solution content" in r1
    assert "Orient attention only" in r1

    # Rung 2: Question - no solution content
    r2 = get_hint_prompt(2, target_concept="for_loops")
    assert "Question" in r2
    assert "Prompt the student to think about the concept" in r2
    assert "NO solution content" in r2

    # Rung 3: Name concept + foreign example, forbids student's actual values
    r3 = get_hint_prompt(3, target_concept="for_loops")
    assert "Name It & Foreign Example" in r3
    assert "DIFFERENT foreign example" in r3
    assert "NEVER reference the student's actual target value" in r3

    # Rung 4: Walk to fix in words, strictly forbids runnable code line
    r4 = get_hint_prompt(4, target_concept="for_loops")
    assert "Walk to Fix in Words" in r4
    assert "Walk to the fix in words" in r4
    assert "NEVER include a complete runnable line of code" in r4


def test_get_hint_prompt_keyword_only_enforcement():
    """Verify FIX 4: parameters after rung must be keyword-only."""
    with pytest.raises(TypeError):
        get_hint_prompt(1, "world", "mission")

    prompt = get_hint_prompt(1, world_title="world", mission_title="mission")
    assert "world" in prompt
    assert "mission" in prompt


@pytest.mark.parametrize("invalid_rung", [0, 5, -1, 10])
def test_hint_prompt_invalid_rung_raises_value_error(invalid_rung: int):
    """Verify that any rung outside 1..4 raises a ValueError."""
    with pytest.raises(ValueError, match=r"Invalid hint rung"):
        get_hint_prompt(invalid_rung)
