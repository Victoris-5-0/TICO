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
from typing import Final

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


# ------------------------------------------------------- authored fallbacks (theirs)
# From `ai/foundations`. Served when the model is offline, rate-limited, or leaked twice.
#
# The rule encoded here is theirs and it is right: rungs 1 and 2 never name the concept,
# not even in a fallback, because a fallback that names it has skipped two rungs. Only
# rungs 3 and 4 get the templated text, and rung 3 additionally gets a worked example on
# a *different* problem — which is what rung 3 is for.
#
# `MIN_RUNG` here is theirs; `MAX_RUNG` above is ours, and both are 4.

MIN_RUNG: Final[int] = 1

GENERIC_FALLBACK_HINTS: Final[dict[str, dict[int, str]]] = {
    "ar_EG": {
        1: "بص كويس على السطور اللي كتبتها أو عدلتها في الكود؛ المشكلة موجودة في المنطقة دي.",
        2: "فكر في منطق الكود والخطوة اللي عايز تنفذها: هل الكود بيعمل الخطوة دي صح ولا محتاج تراجع طريقة كتابتها؟",
        3: "راجع القاعدة والمفهوم البرمجي الأساسي للمهمة: كل أمر في بايثون له طريقة كتابة ونمط قياسي، راجع شكل النمط ده.",
        4: "راجع السطر ده بدقة بالكلمات: افحص الكلمات المفتاحية والعلامات أو المتغيرات اللي استخدمتها وصحح الجزء غير المظبوط.",
    },
    "en": {
        1: "Take a careful look at the lines of code you just wrote or changed; the issue is around here.",
        2: "Think about the logic and what step you want to execute: is your code expressing that step correctly or should you review how it is structured?",
        3: "Review the core programming concept for this task: every statement follows a standard pattern. Review how this pattern is structured.",
        4: "Review this exact line in words: check the keywords, operators, or variables you used and adjust the piece that needs fixing.",
    },
}

# Templated fallback patterns are strictly restricted to rungs 3 and 4.
# Rungs 1 and 2 must NEVER name or disclose the concept under progressive disclosure rules.
TEMPLATED_FALLBACK_PATTERNS: Final[dict[str, dict[int, str]]] = {
    "ar_EG": {
        3: "المفهوم البرمجي المطلوب هنا هو {concept}. راجع القاعدة وطريقة كتابته القياسية لتتأكد من تركيبته.",
        4: "راجع السطر ده بدقة بالكلمات: افحص طريقة استخدام {concept} وتأكد من المعاملات والمتغيرات وصحح الجزء المحتاج تعديل.",
    },
    "en": {
        3: "The core concept here is {concept}. Review its standard syntax and pattern to ensure it is structured properly.",
        4: "Review this exact line in words: check how you used {concept} and adjust the keywords or operators needed.",
    },
}

# Curated foreign examples for Rung 3 ("show the pattern on a *different* example").
# Strict safety rule: these foreign examples MUST NOT use identifiers or values from any launch mission.
CONCEPT_FOREIGN_EXAMPLES: Final[dict[str, dict[str, str]]] = {
    "ar_EG": {
        "variables": "زي مثلاً لما ننشئ متغير ونخزن فيه قيمة: `points = 100`",
        "conditionals": "زي مثلاً لما نفحص شرط باستخدام if: `if score >= 50: pass`",
        "loops": "زي مثلاً لما نكرر أمر بعدد مرات محدد: `for i in range(3): step()`",
        "functions": "زي مثلاً لما نعرف دالة ترجع قيمة: `def add(a, b): return a + b`",
        "lists": "زي مثلاً لما نعمل قايمة عناصر: `colors = ['red', 'blue']`",
        "dictionaries": "زي مثلاً لما نعمل قاموس مفاتيح وقيم: `scores = {'player': 10}`",
    },
    "en": {
        "variables": "For example, creating a variable: `points = 100`",
        "conditionals": "For example, checking a condition: `if score >= 50: pass`",
        "loops": "For example, repeating steps: `for i in range(3): step()`",
        "functions": "For example, defining a function: `def add(a, b): return a + b`",
        "lists": "For example, creating a list: `colors = ['red', 'blue']`",
        "dictionaries": "For example, mapping keys to values: `scores = {'player': 10}`",
    },
}

CONCEPT_ALIASES: Final[dict[str, str]] = {
    "for_loops": "loops",
    "while_loops": "loops",
    "for": "loops",
    "while": "loops",
    "loop": "loops",
    "if_else": "conditionals",
    "if": "conditionals",
    "conditional": "conditionals",
    "comparisons": "conditionals",
    "variable": "variables",
    "function": "functions",
    "list": "lists",
    "dictionary": "dictionaries",
    "dict": "dictionaries",
}


def get_authored_fallback(
    rung: HintRung | int,
    locale: str = "ar_EG",
    concept_hint: str | None = None,
) -> str:
    """Retrieve the authored emergency fallback hint for a rung.

    Used when the AI model is offline, hits rate limits, or fails leak assertions.
    Pure and zero-I/O: `concept_hint` is passed in directly by the caller.

    Pedagogical safety rule:
        Concept name templating is strictly restricted to rungs 3 and 4.
        For rungs 1 (ORIENT) and 2 (QUESTION), generic hint text is always
        returned to preserve progressive disclosure and prevent premature concept leaks.

    Args:
        rung: Hint rung (1 to 4).
        locale: Language locale (defaults to 'ar_EG', supports 'en').
        concept_hint: Optional concept identifier or name (e.g. 'for_loops',
                      'variables'). Used only on rungs 3 and 4.

    Returns:
        The authored fallback text.

    Raises:
        ValueError: If rung is not between 1 and 4.
    """
    rung_int = int(rung)
    if rung_int < MIN_RUNG or rung_int > MAX_RUNG:
        raise ValueError(f"Invalid rung: {rung}. Expected an integer in {MIN_RUNG}..{MAX_RUNG}.")

    loc_key = "en" if locale.lower().startswith("en") else "ar_EG"

    # Progressive disclosure rule: concept name templating is strictly restricted to rungs 3 and 4.
    # Rungs 1 and 2 must never name or disclose the concept.
    if concept_hint and rung_int in (3, 4):
        template = TEMPLATED_FALLBACK_PATTERNS[loc_key][rung_int]
        base_text = template.format(concept=concept_hint)
        if rung_int == 3:
            normalized_key = concept_hint.lower().strip()
            canonical_key = CONCEPT_ALIASES.get(normalized_key, normalized_key)
            if canonical_key in CONCEPT_FOREIGN_EXAMPLES[loc_key]:
                example = CONCEPT_FOREIGN_EXAMPLES[loc_key][canonical_key]
                return f"{base_text} {example}"
        return base_text

    return GENERIC_FALLBACK_HINTS[loc_key][rung_int]


# --------------------------------------------------------- the count-only ladder (theirs)
# From `ai/foundations`, used by `generate_tico_hint`. It decides the rung from the count
# of prior hints alone, which is why its `next_rung` is `_next_rung_ignoring_phase` here:
# the public `next_rung` above takes the phase, because rung 1 in ADAPT_REMIX points at a
# region the student has already read.
#
# `RUNG_DESCRIPTIONS` and `RUNG_SAFETY_RULES` say the same thing as our `RUNG_INTENT`, in
# a shape their persona prompt consumes. Both are here until the two chains become one.

NEXT_STEP_PRACTICE: Final[str] = "mini_practice"

RUNG_DESCRIPTIONS: Final[dict[HintRung, str]] = {
    HintRung.ORIENT: "Point at the region without diagnosis or solution code.",
    HintRung.QUESTION: "Prompt the student to think about the core concept.",
    HintRung.NAME_IT: "Name the concept and show the pattern on a different, foreign example.",
    HintRung.WALK: "Walk to the fix in words only; never a complete runnable line.",
}

RUNG_SAFETY_RULES: Final[dict[HintRung, dict[str, str]]] = {
    HintRung.ORIENT: {
        "allowed": "Nudge attention toward relevant line or code block.",
        "forbidden": "No diagnosis, no solution identifiers, no solution code.",
    },
    HintRung.QUESTION: {
        "allowed": "Guiding conceptual question to stimulate reflection.",
        "forbidden": "No direct fix, no runnable code, no solution values.",
    },
    HintRung.NAME_IT: {
        "allowed": "Explicit concept naming, syntax illustration with a foreign domain example.",
        "forbidden": "No use of the student's actual mission variables, identifiers, or target values.",
    },
    HintRung.WALK: {
        "allowed": "Precise step-by-step description of the edit in natural language prose.",
        "forbidden": "NEVER provide a complete runnable line or full solution code.",
    },
}


@dataclass(frozen=True, slots=True)
class HintLadderDecision:
    """Deterministic hint ladder evaluation result."""

    rung: HintRung
    is_final: bool
    next_step: str | None
    description: str
    allowed: str
    forbidden: str


def _next_rung_ignoring_phase(prior_count: int) -> HintRung:
    """Calculate the next hint rung from the count of prior hint events.

    Pure arithmetic: min(prior_count + 1, 4).
    Guarantees escalation across rungs 1 -> 2 -> 3 -> 4 and clamps at 4.

    Args:
        prior_count: Strictly the count of prior hint_event rows for the CURRENT
                     mission_session AND CURRENT target concept specifically
                     (see PRIOR COUNT FILTERING SCOPE in module docstring).
                     Must be non-negative.

    Returns:
        HintRung enum (1 to 4).

    Raises:
        ValueError: If prior_count is negative.
    """
    if prior_count < 0:
        raise ValueError(f"prior_count must be non-negative, got {prior_count}")

    rung_value = min(prior_count + 1, MAX_RUNG)
    return HintRung(rung_value)


def is_final_rung(rung: HintRung | int) -> bool:
    """Return True if the given rung is the final rung of the ladder (rung 4)."""
    return int(rung) >= MAX_RUNG


def next_step_for_rung(rung: HintRung | int) -> str | None:
    """Return the next action code.

    On rung 4, returns 'mini_practice' because TICO never hands over the answer.
    On earlier rungs, returns None.
    """
    return NEXT_STEP_PRACTICE if is_final_rung(rung) else None


def evaluate_ladder(prior_count: int) -> HintLadderDecision:
    """Evaluate full deterministic ladder decision given prior hint count.

    Args:
        prior_count: Strictly the count of prior hint_event rows for the CURRENT
                     mission_session AND CURRENT target concept specifically
                     (see PRIOR COUNT FILTERING SCOPE in module docstring).

    Returns:
        HintLadderDecision with rung, final flag, next_step, and pedagogical guidance.
    """
    rung = _next_rung_ignoring_phase(prior_count)
    final = is_final_rung(rung)
    next_step = next_step_for_rung(rung)
    description = RUNG_DESCRIPTIONS[rung]
    rules = RUNG_SAFETY_RULES[rung]

    return HintLadderDecision(
        rung=rung,
        is_final=final,
        next_step=next_step,
        description=description,
        allowed=rules["allowed"],
        forbidden=rules["forbidden"],
    )
