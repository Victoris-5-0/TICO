"""The map is the contract: three stops per concept, extended only when needed.

A student sees a path with numbered stops on it. That picture is a promise — finish these
and you move on — and a system that instead runs until a hidden number crosses a threshold
breaks it: the child completes stop 3, the path carries on, and nothing explains why.

These pin the promise. Offline; the rules are pure.
"""

from __future__ import annotations

import pytest

from app.rules.mastery import (
    MASTERY_THRESHOLD,
    compute_outcome_score,
    compute_single_concept_mastery,
)
from app.rules.progression import (
    BASE_STOPS,
    MAX_STOPS,
    is_complete,
    progress_for,
    required_stops,
)


def _walk(hints: int, *, passed: bool = True, cap: int = 30) -> tuple[int, float]:
    """Play a concept until it is done. Returns (stops walked, final mastery)."""
    score = compute_outcome_score(passed=passed, hints_used=hints)
    mastery, done = 0.0, 0
    while not is_complete(mastery=mastery, completed=done) and done < cap:
        mastery = compute_single_concept_mastery(mastery, score, weight=1.0)
        done += 1
    return done, mastery


# ============================================================== the promise on screen


def test_a_student_who_never_needs_a_hint_walks_exactly_three_stops():
    """The number drawn on the map, for the student it was drawn for."""
    stops, mastery = _walk(hints=0)
    assert stops == BASE_STOPS
    assert mastery >= MASTERY_THRESHOLD


def test_the_path_extends_for_a_student_who_is_struggling():
    """Not silently: `extended` is on the DTO so the client can say the path grew."""
    stops, _ = _walk(hints=4)
    assert BASE_STOPS < stops <= MAX_STOPS

    p = progress_for("variables", mastery=0.5, completed=BASE_STOPS)
    assert p.stops_total == MAX_STOPS
    assert p.extended is True
    assert p.is_complete is False


def test_more_help_never_means_fewer_stops():
    """Monotonic, or the map rewards asking for hints."""
    walked = [_walk(hints=h)[0] for h in range(0, 5)]
    assert walked == sorted(walked), walked
    assert walked[0] == BASE_STOPS
    assert walked[-1] <= MAX_STOPS


def test_nobody_is_trapped_on_one_concept():
    """Six missions and still stuck means they need something this service cannot give.

    Moving on is safe because concepts are carried: every later mission still exercises
    this one, so the practice continues inside the next concept rather than in a corridor.
    """
    stops, mastery = _walk(hints=4, passed=False)
    assert stops == MAX_STOPS
    assert mastery < MASTERY_THRESHOLD, "they genuinely did not get it"
    assert is_complete(mastery=mastery, completed=MAX_STOPS), "and they still move on"


def test_the_map_never_loses_a_stop_the_student_has_walked():
    """A path that shrinks behind you is worse than one that grows ahead of you."""
    for completed in range(0, MAX_STOPS + 3):
        for mastery in (0.0, 0.5, 0.75, 1.0):
            assert required_stops(mastery=mastery, completed=completed) >= min(
                completed, MAX_STOPS
            )


# ============================================================ the numbers hold together


def test_three_stops_is_actually_reachable():
    """The learning rate and the stop count are one design, not two.

    At the old rate of 0.20 a perfect student reached 0.488 after three clean solves, so
    the path would have extended to six for *everyone* — including a child who never got
    anything wrong — and the three on the map would have been a lie.
    """
    mastery = 0.0
    for _ in range(BASE_STOPS):
        mastery = compute_single_concept_mastery(mastery, 1.0, weight=1.0)
    assert mastery >= MASTERY_THRESHOLD, (
        f"three clean solves reach {mastery:.3f}, short of {MASTERY_THRESHOLD} — "
        "either the learning rate or BASE_STOPS is wrong"
    )


def test_six_stops_is_enough_for_a_student_who_keeps_passing():
    """However much help they need, passing six times finishes the concept."""
    for hints in range(0, 8):
        stops, _ = _walk(hints=hints)
        assert stops <= MAX_STOPS


@pytest.mark.parametrize("completed", [0, 1, 2])
def test_the_path_shows_three_before_anything_is_known(completed):
    """A concept not started yet still draws its stops — locked circles further along."""
    p = progress_for("loops", mastery=0.0, completed=completed)
    assert p.stops_total == BASE_STOPS
    assert p.extended is False
    assert p.remaining == BASE_STOPS - completed


def test_remaining_never_goes_negative():
    p = progress_for("loops", mastery=1.0, completed=MAX_STOPS + 4)
    assert p.remaining == 0
    assert p.is_complete is True
