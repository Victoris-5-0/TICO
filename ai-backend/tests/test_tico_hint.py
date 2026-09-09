"""What `write_hint` does when things go wrong. Offline — no database, no API key.

Rewritten from `ai/foundations`, where these covered `generate_tico_hint`. That chain was
a second implementation of this one and was deleted in the merge; the behaviour it tested
is the behaviour that mattered, and all of it lives in `write_hint` now.

The property under test throughout is that **a student always gets something**. Every
failure path — a dead model, a model that leaks twice, no API key at all — ends in
authored text rather than an exception, because a child staring at a blank has already
asked for help once and should not have to ask again.
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from app.ai.chains.tico_hint import strip_pii_from_text, write_hint
from app.rules.hint_ladder import get_authored_fallback
from app.schemas.common import HintRung, Phase

SOLUTION = (
    "def calculate_loaves(trays: int) -> int:\n"
    "    loaves_per_tray = 12\n"
    "    return trays * loaves_per_tray\n"
)

CALL = dict(
    phase=Phase.GUIDED_CODING.value,
    task_ar="احسبي عدد الأرغفة",
    student_code="def calculate_loaves(trays):\n    return trays * ___",
    solution_code=SOLUTION,
    blanks=["12"],
)


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    """A key, so the tests exercise the model path rather than the no-key shortcut."""
    from app.config import settings

    monkeypatch.setattr(settings, "google_api_key", "test-key", raising=False)


def _model(*replies: str) -> MagicMock:
    m = MagicMock()
    m.invoke.side_effect = [AIMessage(content=r) for r in replies]
    return m


# ============================================================== the happy path


def test_a_clean_hint_comes_back_as_the_model_wrote_it():
    clean = "بصي على السطر اللي فيه الفراغ، وافتكري الرقم اللي اتقال في أول المهمة"
    with patch("app.ai.chains.tico_hint.get_model", return_value=_model(clean)):
        result = write_hint(rung=HintRung.WALK, **CALL)

    assert result.text == clean
    assert result.source == "model"
    assert not result.leaked


def test_wrappers_the_model_adds_are_stripped():
    """Models fence and quote their answers however firmly they are told not to."""
    with patch("app.ai.chains.tico_hint.get_model", return_value=_model('"بصي على السطر ده"')):
        result = write_hint(rung=HintRung.ORIENT, **CALL)
    assert result.text == "بصي على السطر ده"


# =========================================================== the under-13 rule


def test_a_student_under_13_never_reaches_the_model():
    """docs/08. The model is not called at all — not called and discarded, not called.

    Nothing sets `static_only` yet: neither `users` nor `student_profiles` records an age.
    The rule is implemented and waiting for a field, which is why this test exists now
    rather than after the migration.
    """
    with patch("app.ai.chains.tico_hint.get_model") as get_model:
        result = write_hint(rung=HintRung.ORIENT, static_only=True, **CALL)

    get_model.assert_not_called()
    assert result.source == "authored"
    assert result.text


# ================================================================== failure paths


def test_a_dead_model_still_produces_a_hint():
    dead = MagicMock()
    dead.invoke.side_effect = RuntimeError("Google Gemini API 503 Service Unavailable")

    with patch("app.ai.chains.tico_hint.get_model", return_value=dead):
        result = write_hint(rung=HintRung.QUESTION, **CALL)

    assert result.source == "fallback"
    assert result.text


def test_a_model_that_cannot_even_be_resolved_still_produces_a_hint():
    with patch("app.ai.chains.tico_hint.get_model", side_effect=RuntimeError("no credentials")):
        result = write_hint(rung=HintRung.QUESTION, **CALL)

    assert result.source == "fallback"
    assert result.text


def test_no_api_key_short_circuits_to_authored_text(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "google_api_key", "", raising=False)
    with patch("app.ai.chains.tico_hint.get_model") as get_model:
        result = write_hint(rung=HintRung.ORIENT, **CALL)

    get_model.assert_not_called()
    assert result.source == "fallback"


def test_a_model_failure_is_logged(caplog):
    dead = MagicMock()
    dead.invoke.side_effect = RuntimeError("Provider offline")

    with caplog.at_level(logging.WARNING), patch(
        "app.ai.chains.tico_hint.get_model", return_value=dead
    ):
        write_hint(rung=HintRung.ORIENT, **CALL)

    assert any("hint model call failed" in r.message for r in caplog.records)


# ==================================================================== the guards


def test_a_leak_is_rewritten_rather_than_served():
    """First reply names the blank; the second does not. The student gets the second."""
    leak = "كل اللي ناقصك تكتبي رقم `12` في الفراغ"
    clean = "افتكري الرقم اللي بيمثل عدد الأرغفة في الصينية، وهو اتقال في أول المهمة"

    with patch("app.ai.chains.tico_hint.get_model", return_value=_model(leak, clean)):
        result = write_hint(rung=HintRung.WALK, **CALL)

    assert result.text == clean
    assert result.source == "model"
    # Worth alerting on even though the student never saw it.
    assert result.leaked and result.leak_reason


def test_the_rewrite_request_says_what_leaked(caplog):
    model = _model("اكتبي 12", "بصي فوق شوية")
    with caplog.at_level(logging.WARNING), patch(
        "app.ai.chains.tico_hint.get_model", return_value=model
    ):
        write_hint(rung=HintRung.WALK, **CALL)

    second = model.invoke.call_args_list[1][0][0]
    feedback = second[-1][1]
    assert "gave away the answer" in feedback
    assert any("leaked the answer" in r.message for r in caplog.records)


def test_leaking_twice_falls_back_to_authored_text():
    """The authored fallback is vague, and vague is safe."""
    with patch("app.ai.chains.tico_hint.get_model", return_value=_model("اكتبي 12", "يبقى 12")):
        result = write_hint(rung=HintRung.WALK, **CALL)

    assert result.source == "fallback"
    assert result.leaked
    assert "12" not in result.text


def test_an_empty_reply_is_asked_again():
    with patch("app.ai.chains.tico_hint.get_model", return_value=_model("", "بصي على السطر ده")):
        result = write_hint(rung=HintRung.ORIENT, **CALL)
    assert result.text == "بصي على السطر ده"


# ======================================================================== PII


def test_the_prompt_carries_no_identity_fields():
    """The defence is architectural: `write_hint` has no parameter for a name or an email.

    So the check is on the signature, not on the output — a field that cannot be passed
    cannot leak, and that boundary holds by construction rather than by scrubbing.
    """
    import inspect

    params = set(inspect.signature(write_hint).parameters)
    for forbidden in ("student_name", "student_email", "student_age", "oauth_id", "user_id"):
        assert forbidden not in params


def test_an_email_a_student_pasted_into_their_code_is_redacted():
    model = _model("بصي على أول سطر")
    with patch("app.ai.chains.tico_hint.get_model", return_value=model):
        write_hint(
            rung=HintRung.ORIENT,
            phase=Phase.GUIDED_CODING.value,
            task_ar="احسبي",
            student_code="# ابعتي على student@school.edu.eg\nx = ___",
            solution_code=SOLUTION,
            error_text="NameError at student@school.edu.eg line 1",
            blanks=["12"],
        )

    sent = "\n".join(str(part) for part in model.invoke.call_args[0][0])
    assert "student@school.edu.eg" not in sent
    assert "[REDACTED_EMAIL]" in sent


def test_strip_pii_redacts_every_address():
    raw = "Contact admin@tico.edu.eg or support@codeegypt.org for help"
    assert strip_pii_from_text(raw) == "Contact [REDACTED_EMAIL] or [REDACTED_EMAIL] for help"


# ============================================================ authored fallbacks


@pytest.mark.parametrize("locale", ["ar_EG", "en"])
def test_every_rung_has_authored_text_in_both_locales(locale):
    for rung in HintRung:
        assert get_authored_fallback(rung, locale=locale).strip()


@pytest.mark.parametrize("rung", [1, 2])
def test_the_early_fallbacks_never_name_the_concept(rung):
    """Progressive disclosure holds in the fallback too, or it skips two rungs."""
    for locale in ("ar_EG", "en"):
        generic = get_authored_fallback(rung, locale=locale)
        assert get_authored_fallback(rung, locale=locale, concept_hint="loops") == generic


def test_the_later_fallbacks_do_name_it():
    assert "loops" in get_authored_fallback(3, locale="en", concept_hint="loops")
    assert "loops" in get_authored_fallback(4, locale="en", concept_hint="loops")


def test_rung_three_attaches_an_example_from_a_different_problem():
    text = get_authored_fallback(3, locale="en", concept_hint="for_loops")
    assert "range(3)" in text, "rung 3 must show the pattern somewhere other than their code"


def test_an_impossible_rung_is_refused():
    for bad in (0, 5):
        with pytest.raises(ValueError):
            get_authored_fallback(bad)
