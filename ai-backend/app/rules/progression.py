"""How many stops a concept has on the map, and when the student has finished them.

Pure: no database, no model, no I/O.

## The map is the contract

A student sees a path with numbered stops on it. Three of them, for `variables`. That
picture is a promise: finish these and you move on. A system that instead says "keep
playing until a hidden number crosses 0.75" breaks it — the child completes stop 3, the
path does not end, and nothing on screen explains why.

So the count comes first and mastery adapts around it:

    everyone            3 stops
    still struggling    the path extends, up to 6
    six and still stuck move on anyway

## Why it stops at six

Never trap a child on one idea. A student who has played six missions on `variables` and
still has not got it will not get it on the seventh — what they need is a different
approach, or a teacher, and neither is something this service can produce.

Moving on is also less dangerous than it sounds, because concepts are carried: every later
mission still uses variables, and `rules/mastery` moves a carried concept every time. A
weak concept keeps getting practice inside the next one rather than in a corridor of its
own.

## Why the learning rate is what it is

Three observations is very little evidence, so each has to count for a lot. At the old rate
of 0.20 a perfect student reached 0.488 after three clean solves and the path extended
anyway — which would have meant *every* student always saw six stops, and the number on the
map would have been a lie for a different reason.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.rules.mastery import MASTERY_THRESHOLD

#: What every concept shows on the map to begin with.
BASE_STOPS: Final[int] = 3

#: The most it can ever grow to. Reaching this ends the concept whatever the mastery.
MAX_STOPS: Final[int] = 6


@dataclass(frozen=True, slots=True)
class ConceptProgress:
    """One concept's row on the map."""

    concept_id: str
    completed: int
    stops_total: int
    mastery: float
    is_complete: bool
    #: True when the path grew because the student was struggling. The client can say so
    #: rather than silently adding stops, which reads as the game moving the goalposts.
    extended: bool

    @property
    def remaining(self) -> int:
        return max(0, self.stops_total - self.completed)


def required_stops(*, mastery: float, completed: int) -> int:
    """How many stops this concept shows for this student, right now.

    Grows, never shrinks below what they have already played — a map that loses a stop the
    student has walked past is worse than one that gains one.
    """
    if completed < BASE_STOPS:
        return BASE_STOPS
    if mastery >= MASTERY_THRESHOLD:
        # They have it. The path ends where they are standing.
        return max(BASE_STOPS, completed)
    return MAX_STOPS


def is_complete(*, mastery: float, completed: int) -> bool:
    """Has this student finished with this concept?"""
    if completed >= MAX_STOPS:
        return True  # out of stops; carried practice takes it from here
    return completed >= BASE_STOPS and mastery >= MASTERY_THRESHOLD


def progress_for(concept_id: str, *, mastery: float, completed: int) -> ConceptProgress:
    total = required_stops(mastery=mastery, completed=completed)
    return ConceptProgress(
        concept_id=concept_id,
        completed=completed,
        stops_total=total,
        mastery=mastery,
        is_complete=is_complete(mastery=mastery, completed=completed),
        extended=total > BASE_STOPS,
    )
