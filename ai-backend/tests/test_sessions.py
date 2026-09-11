"""The debrief's arithmetic and its one model-written field. Offline.

Everything a student reads on the results screen except `ticoFeedback` is counted in
Python, so all of it is checkable without a database or a model. These are those checks.

The number guard in `write_debrief` gets the most attention here. A model handed "4
attempts, 2 hints" will sometimes write "من أول مرة" — *first try* — and that sentence in
front of a child who fought for ten minutes is worse than generic praise: it proves nobody
was watching. The guard is what stops it, and it has to see through Arabic-Indic digits,
because a model writing Arabic uses ٤ as readily as 4.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import AIMessage

from app.ai.chains.debrief import looks_like_tico, unsupported_number, write_debrief
from app.ai.prompts import debrief as prompt
from app.services.sessions import MASTERY_THRESHOLD, stars_for

# ==================================================================== stars


def test_a_clean_solve_is_three_stars():
    assert stars_for(solved=True, attempts=1, hints=0) == 3
    assert stars_for(solved=True, attempts=2, hints=0) == 3


def test_asking_for_help_costs_a_star_not_the_mission():
    """Hints are a skill, not a failure. One hint must not drop a student to zero."""
    assert stars_for(solved=True, attempts=1, hints=1) == 2
    assert stars_for(solved=True, attempts=9, hints=8) == 1


def test_an_unsolved_mission_earns_none():
    assert stars_for(solved=False, attempts=1, hints=0) == 0
    assert stars_for(solved=False, attempts=20, hints=0) == 0


def test_stars_stay_in_range_for_anything():
    for attempts in range(0, 40):
        for hints in range(0, 20):
            for solved in (True, False):
                assert 0 <= stars_for(solved=solved, attempts=attempts, hints=hints) <= 3


def test_more_effort_never_earns_more_stars():
    """Monotonic, or a student learns that flailing is rewarded."""
    previous = 3
    for attempts in range(1, 30):
        now = stars_for(solved=True, attempts=attempts, hints=0)
        assert now <= previous
        previous = now


# ======================================================= the number guard


@pytest.mark.parametrize(
    "text",
    [
        "برافو! غلطت مرتين وبعدين مسكتها",  # no digits at all
        "خلصتها في 4 محاولات",  # 4 is the attempt count
        "استعملت 2 تلميح وده تمام",  # 2 is the hint count
        "٤ محاولات ومسكتها",  # Arabic-Indic, still the attempt count
    ],
)
def test_supported_numbers_pass(text):
    assert unsupported_number(text, {4, 2, 7}) is None


@pytest.mark.parametrize(
    ("text", "bad"),
    [
        ("خلصتها من أول 1 محاولة", 1),
        ("عملتها في 99 ثانية", 99),
        ("١٢ محاولة", 12),  # Arabic-Indic digits must not slip past
    ],
)
def test_invented_numbers_are_caught(text, bad):
    assert unsupported_number(text, {4, 2, 7}) == bad


def test_the_guard_folds_arabic_digits_before_comparing():
    """٤ and 4 are the same number, and a model writing Arabic will use either."""
    assert unsupported_number("٤ محاولات", {4}) is None
    assert unsupported_number("4 محاولات", {4}) is None


@pytest.mark.parametrize(
    "text",
    [
        "برافو! غلطت مرتين وبعدين مسكتها لوحدك",
        "خلصتها في ٤ محاولات، والغلطة اللي كررتها مسكتها في الآخر",
        "استعملت calculate_loaves صح من غير ما حد يقولك",  # one Latin identifier is fine
    ],
)
def test_a_real_tico_line_is_accepted(text):
    assert looks_like_tico(text)


@pytest.mark.parametrize(
    ("text", "why"),
    [
        # What actually reached a child's screen: the model spent its budget reasoning and
        # the sentence never arrived, so its notes about the error tag vocabulary did.
        ("no_error`, `incomplete_assignment` (this means they", "leaked scratchpad"),
        ("The student solved it on the first try, so I should say", "English reasoning"),
        ("`incomplete_assignment`", "bare tag name"),
        ("", "empty"),
        ("Great job!", "not Arabic at all"),
        ("تمام", "too short to be a debrief"),
    ],
)
def test_model_scratchpad_never_reaches_a_child(text, why):
    assert not looks_like_tico(text), why


# ===================================================== the debrief chain

CALL = dict(
    mission="حساب عيش الطبلية",
    concept="variables",
    solved=True,
    attempts=4,
    hints=2,
    time_spent_ms=412_000,
    errors_overcome=["assignment_vs_comparison"],
)


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "google_api_key", "test-key", raising=False)


def _model(reply: str) -> MagicMock:
    m = MagicMock()
    m.invoke.return_value = AIMessage(content=reply)
    return m


def test_a_good_sentence_is_returned_as_written():
    good = "غلطت في = و == وبعدين مسكتها لوحدك. دي الحاجة اللي بتفرق."
    with patch("app.ai.chains.debrief.get_model", return_value=_model(good)):
        assert write_debrief(**CALL) == good


def test_a_debrief_that_invents_a_number_is_thrown_away():
    """The exact failure this guard exists for."""
    with patch("app.ai.chains.debrief.get_model", return_value=_model("خلصتها من أول 1 محاولة!")):
        result = write_debrief(**CALL)

    assert result == prompt.FALLBACK_AR[True]
    assert "1" not in result


def test_the_count_of_overcome_errors_is_not_an_allowed_number():
    """One overcome error would otherwise put 1 in the allowed set, and 1 is "first try"."""
    with patch("app.ai.chains.debrief.get_model", return_value=_model("خلصتها من أول 1 محاولة")):
        assert write_debrief(**CALL) == prompt.FALLBACK_AR[True]


def test_the_counts_it_was_given_are_allowed():
    with patch("app.ai.chains.debrief.get_model", return_value=_model("4 محاولات و 2 تلميح، برافو")):
        assert "4" in write_debrief(**CALL)


def test_a_dead_model_still_produces_a_debrief():
    dead = MagicMock()
    dead.invoke.side_effect = RuntimeError("503")
    with patch("app.ai.chains.debrief.get_model", return_value=dead):
        assert write_debrief(**CALL) == prompt.FALLBACK_AR[True]


def test_a_model_that_cannot_be_resolved_still_produces_a_debrief():
    with patch("app.ai.chains.debrief.get_model", side_effect=RuntimeError("no credentials")):
        assert write_debrief(**CALL) == prompt.FALLBACK_AR[True]


def test_no_api_key_never_reaches_the_model(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "google_api_key", "", raising=False)
    with patch("app.ai.chains.debrief.get_model") as get_model:
        write_debrief(**CALL)
    get_model.assert_not_called()


def test_the_failed_fallback_does_not_claim_success():
    """A child who did not finish must not be told they did.

    Checked on the negation rather than by looking for "خلصت": that string is a substring of
    مخلصتهاش, which means the opposite, so the naive check passed the wrong text.
    """
    failed = prompt.FALLBACK_AR[False]
    assert "مخلصتهاش" in failed, "it has to say the mission was not finished"
    assert "برافو" not in failed
    assert failed != prompt.FALLBACK_AR[True]


def test_neither_fallback_contains_a_number():
    """A fallback is served precisely when the counts cannot be trusted in prose."""
    for text in prompt.FALLBACK_AR.values():
        assert unsupported_number(text, set()) is None


# ============================================================== the prompt


def test_the_counts_reach_the_prompt():
    """Given as facts the model must not contradict, not as things to work out."""
    _, task = prompt.build(**CALL)
    assert "4" in task and "2" in task
    assert "assignment_vs_comparison" in task
    assert "7" in task, "412_000ms is 7 minutes"


def test_no_placeholder_survives_the_build():
    system, task = prompt.build(
        mission="", concept="", solved=False, attempts=0, hints=0, time_spent_ms=0,
        errors_overcome=[],
    )
    assert "<<" not in task and ">>" not in task
    assert "<<" not in system


def test_the_prompt_forbids_inventing_numbers():
    system, _ = prompt.build(**CALL)
    assert "أرقام" in system, "the system prompt must say where numbers may come from"


def test_an_unsolved_mission_says_so_in_the_prompt():
    _, task = prompt.build(**{**CALL, "solved": False})
    assert "مخلصهاش" in task


def test_no_errors_overcome_is_stated_rather_than_left_blank():
    """An empty slot invites the model to fill it in."""
    _, task = prompt.build(**{**CALL, "errors_overcome": []})
    assert "مفيش" in task


# ============================================================== thresholds


def test_the_mastery_threshold_is_a_real_bar():
    assert 0.5 < MASTERY_THRESHOLD < 1.0
