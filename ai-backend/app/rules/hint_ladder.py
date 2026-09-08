"""Which rung of the hint ladder a student is on.

Pure: no database, no model, no I/O. The rung is decided **here, in Python, before any
model is called** — so the model is told which rung to write for and never gets to
choose how much to give away.

## The four rungs

    1 ORIENT     point at the region. No diagnosis, no naming.
    2 QUESTION   make them think about the concept. A question, not a statement.
    3 NAME_IT    name the concept and show the pattern on a DIFFERENT example.
    4 WALK       walk to the fix in their own code, in words. Still no code.

**No rung emits a runnable solution.** After rung 4 the student is offered a smaller
practice problem on the same idea, not the answer. That is the whole reason the ladder
exists rather than a "show solution" button.

## Why the phase matters

The same words are a nudge in one place and a rescue in another:

* `GUIDED_CODING` is their first real typing, so they get the full ladder from rung 1.
* `ADAPT_REMIX` starts at rung 2 — they have already seen this code work, so pointing
  at the region tells them nothing they do not know.
* `INDEPENDENT` stops at rung 3. Walking someone through their own code defeats the
  point of an independent mission, and needing help here is strong evidence of a gap
  rather than a wobble.

Phases 1 to 4 have no ladder at all. There is no blank to be stuck on: phase 2 has its
own `nudge_ar` for a wrong answer, and "what does this line mean" is a question for
TICO chat, which may explain freely because explaining `==` is not the answer to
*their* problem.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.common import HintRung, Phase

#: The most any rung may ever reach. Rung 4 walks them to the fix in words; there is no
#: rung 5, because the next step after rung 4 is practice, not the answer.
MAX_RUNG = 4


@dataclass(frozen=True)
class LadderRules:
    """How much help a phase allows."""

    first: int
    last: int
    #: What the client offers once the top is reached.
    exhausted: str


#: Only phases where a student can be stuck on a blank have a ladder.
LADDER_BY_PHASE: dict[Phase, LadderRules] = {
    Phase.GUIDED_CODING: LadderRules(first=1, last=4, exhausted="mini_practice"),
    Phase.ADAPT_REMIX: LadderRules(first=2, last=4, exhausted="mini_practice"),
    Phase.INDEPENDENT: LadderRules(first=1, last=3, exhausted="offer_guided_replay"),
}


class HintsNotAvailable(RuntimeError):
    """This phase has no ladder, and the caller should not have asked."""


def has_ladder(phase: Phase) -> bool:
    return phase in LADDER_BY_PHASE


@dataclass(frozen=True)
class LadderPosition:
    rung: HintRung
    is_final: bool
    #: What the client should offer when the ladder is spent.
    next_step: str | None
    remaining: int
    #: True when the student has asked again after reaching the top. The text can be
    #: rephrased, but it must not climb — and this is the moment worth noticing in the
    #: student model.
    repeated: bool


def next_rung(phase: Phase, hints_already_shown: int) -> LadderPosition:
    """Where this student is now.

    `hints_already_shown` is the count of `hint_events` for this session — counted, not
    trusted from the client, because a client that could name its own rung could ask for
    rung 4 immediately.
    """
    rules = LADDER_BY_PHASE.get(phase)
    if rules is None:
        raise HintsNotAvailable(
            f"{phase.value} has no hint ladder. Phases 1-4 use TICO chat instead, and "
            "phase 2 already carries its own nudge for a wrong answer."
        )

    wanted = rules.first + max(0, hints_already_shown)
    rung = min(wanted, rules.last)
    at_top = rung >= rules.last

    return LadderPosition(
        rung=HintRung(rung),
        is_final=at_top,
        next_step=rules.exhausted if at_top else None,
        remaining=max(0, rules.last - rung),
        repeated=wanted > rules.last,
    )


# --------------------------------------------------------------------------- intent


#: What each rung is for, in one line. Goes into the prompt so the model writes for the
#: rung it was given rather than deciding for itself how much to reveal.
RUNG_INTENT: dict[int, str] = {
    1: (
        "ORIENT. Point at WHERE to look — a line, a value, a part of the task. Do not "
        "say what is wrong, do not name the concept, do not diagnose."
    ),
    2: (
        "QUESTION. Ask one question that makes them think about the idea behind the "
        "mistake. A question, not a statement. Still do not name the concept."
    ),
    3: (
        "NAME_IT. Name the concept, and show the pattern on a DIFFERENT, simpler "
        "example — never on their own code. They should transfer it themselves."
    ),
    4: (
        "WALK. Talk them to the fix in their own code, in words only. Say WHERE the "
        "value comes from and WHY it belongs there — never what it is. If they are "
        "filling a blank, do NOT state the value that goes in the blank, and do NOT "
        "write the corrected line. Point back to the moment earlier in the mission "
        "where that number or name was decided."
    ),
}


def intent_for(rung: HintRung | int) -> str:
    return RUNG_INTENT[int(rung)]


def cache_scope(phase: Phase, rung: HintRung | int, guided_step: int | None) -> str:
    """A short key fragment describing this position.

    Two students on the same blank of the same step deserve the same hint; a student on
    a different step does not. Folded into the hint-cache key so a cached hint is never
    served into a situation it was not written for.
    """
    step = f"s{guided_step}" if guided_step is not None else "s-"
    return f"{phase.value}:{int(rung)}:{step}"
