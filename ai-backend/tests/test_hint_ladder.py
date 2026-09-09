"""The hint ladder and its guards. Offline — no database, no API key.

The ladder is pure logic on purpose: which rung a student is on is a pedagogical decision
that must be checkable without a model, a network or a database. These tests are the
check.

The leak tests matter most. "No rung gives the answer" is the single property the whole
hint design rests on, and it has already failed once in a way the first guard missed —
a rung-4 hint that said "تكتبي رقم `12`" when the blank was `12`. The solution line never
appeared, so the line check passed it, and it was cached and served to everyone on that
step. `test_the_real_leak_that_got_through` is that exact hint.
"""

from __future__ import annotations

import pytest

from app.ai import guards
from app.rules import hint_ladder as L
from app.rules.hint_ladder import HintsNotAvailable
from app.schemas.common import HintRung, Phase

# =========================================================================== ladder


def test_guided_coding_gets_the_full_ladder():
    """Their first real typing, so they get the most help."""
    rungs = [int(L.next_rung(Phase.GUIDED_CODING, n).rung) for n in range(6)]
    assert rungs == [1, 2, 3, 4, 4, 4]


def test_remix_starts_at_rung_two():
    """They have already seen this code work; pointing at the region tells them nothing."""
    assert int(L.next_rung(Phase.ADAPT_REMIX, 0).rung) == 2
    assert [int(L.next_rung(Phase.ADAPT_REMIX, n).rung) for n in range(5)] == [2, 3, 4, 4, 4]


def test_independent_stops_at_rung_three():
    """Walking someone through their own code defeats an independent mission."""
    rungs = [int(L.next_rung(Phase.INDEPENDENT, n).rung) for n in range(5)]
    assert rungs == [1, 2, 3, 3, 3]
    assert max(rungs) < L.MAX_RUNG


def test_the_ladder_never_exceeds_four():
    for phase in L.LADDER_BY_PHASE:
        for shown in range(20):
            assert int(L.next_rung(phase, shown).rung) <= L.MAX_RUNG


@pytest.mark.parametrize(
    "phase", [Phase.ENCOUNTER, Phase.EXPLORE, Phase.DISCOVER, Phase.UNDERSTAND]
)
def test_early_phases_have_no_ladder(phase):
    """There is no blank to be stuck on. Explaining is TICO chat's job, not a hint's."""
    assert not L.has_ladder(phase)
    with pytest.raises(HintsNotAvailable):
        L.next_rung(phase, 0)


def test_the_top_offers_practice_not_the_answer():
    top = L.next_rung(Phase.GUIDED_CODING, 3)
    assert top.is_final
    assert top.next_step == "mini_practice"
    assert top.remaining == 0


def test_independent_offers_a_replay_rather_than_practice():
    """A student stuck on an independent mission needs the guided version back."""
    assert L.next_rung(Phase.INDEPENDENT, 5).next_step == "offer_guided_replay"


def test_asking_again_at_the_top_is_flagged_but_does_not_climb():
    """Worth noticing in the student model; must not become a rung 5."""
    at_top = L.next_rung(Phase.GUIDED_CODING, 3)
    beyond = L.next_rung(Phase.GUIDED_CODING, 6)
    assert beyond.rung == at_top.rung
    assert beyond.repeated and not at_top.repeated


def test_every_rung_has_an_intent():
    for rung in HintRung:
        assert L.intent_for(rung).strip()


def test_rung_intents_forbid_giving_the_answer():
    """The restraint is written into the prompt, not left to the model's judgement."""
    rung3 = L.intent_for(3).lower()
    assert "different" in rung3, "rung 3 must demand a different example"
    assert "never" in rung3 or "not" in rung3

    rung4 = L.intent_for(4).lower()
    # Rung 4 is where a model tries hardest to be helpful, so it carries the most
    # explicit prohibitions.
    assert "never" in rung4 or "not" in rung4
    assert "blank" in rung4, "rung 4 must say not to state the blank's value"


def test_cache_scope_separates_steps_and_phases():
    """A hint written for step 1 must never be served to someone stuck on step 2."""
    a = L.cache_scope(Phase.GUIDED_CODING, 2, 0)
    b = L.cache_scope(Phase.GUIDED_CODING, 2, 1)
    c = L.cache_scope(Phase.ADAPT_REMIX, 2, 0)
    assert a != b and a != c


# ======================================================================= leak guard

SOLUTION = (
    "def calculate_loaves(trays: int) -> int:\n"
    "    loaves_per_tray = 12\n"
    "    return trays * loaves_per_tray\n"
)


def test_the_real_leak_that_got_through():
    """A rung-4 hint served live before `hint_leaks_blank` existed.

    The solution line never appeared, so the line check passed it. The blank was 12 and
    the hint said 12 — there was nothing left to work out, and it was cached.
    """
    hint = "يا مريم، كل اللي ناقصك دلوقتي تكتبي رقم `12` بعدها علطول"

    line_leak, _ = guards.hint_leaks_answer(hint, SOLUTION)
    assert not line_leak, "this is exactly why the line check alone was not enough"

    blank_leak, why = guards.hint_leaks_blank(hint, ["12"])
    assert blank_leak and "12" in why


def test_a_proper_rung_four_hint_passes_both_guards():
    """Says where the value comes from, never what it is."""
    hint = "افتكري الرقم اللي بيمثل عدد الأرغفة في الصينية، واكتبيه بعد علامة `=`"
    assert not guards.hint_leaks_answer(hint, SOLUTION)[0]
    assert not guards.hint_leaks_blank(hint, ["12"])[0]


def test_a_digit_inside_a_word_is_not_a_leak():
    """"الصينية التانية" must not trip the guard when the answer happens to be 2."""
    assert not guards.hint_leaks_blank("بصي على الصينية التانية", ["2"])[0]


def test_a_bare_digit_is_a_leak():
    assert guards.hint_leaks_blank("اكتبي 2 هنا", ["2"])[0]


def test_naming_the_variable_that_belongs_in_the_blank_is_a_leak():
    assert guards.hint_leaks_blank("استخدمي loaves_per_tray", ["loaves_per_tray"])[0]


def test_referring_to_it_without_naming_it_is_fine():
    assert not guards.hint_leaks_blank("المتغير اللي فوق", ["loaves_per_tray"])[0]


def test_backticks_do_not_hide_a_leak():
    """Models wrap answers in formatting; stripping it is why the guard sees through."""
    for wrapped in ("`12`", "**12**", '"12"', "‘12’"):
        assert guards.hint_leaks_blank(f"اكتبي {wrapped}", ["12"])[0], wrapped


def test_no_blanks_means_nothing_to_leak():
    assert not guards.hint_leaks_blank("أي كلام", None)[0]
    assert not guards.hint_leaks_blank("أي كلام", [])[0]


def test_a_verbatim_solution_line_is_still_caught():
    hint = "جربي تكتبي loaves_per_tray = 12 في السطر ده"
    assert guards.hint_leaks_answer(hint, SOLUTION)[0]


def test_short_shared_words_are_not_leaks():
    """A hint may say `pass` or `return`. Those are vocabulary, not the answer."""
    assert not guards.hint_leaks_answer(
        "شيلي الـ pass واكتبي return مكانها", "def f():\n    pass\n"
    )[0]


def test_the_fallback_hints_never_leak():
    """The fallback is served when the model leaks twice, so it must be safe by design."""
    from app.ai.prompts import tico_hint

    for rung, text in tico_hint.FALLBACK_AR.items():
        assert not guards.hint_leaks_answer(text, SOLUTION)[0], rung
        assert not guards.hint_leaks_blank(text, ["12"])[0], rung
