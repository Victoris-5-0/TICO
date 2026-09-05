"""The 4-rung hint ladder domain rule.

Pure Python, zero I/O, zero DB, zero LangChain imports.
The server counts prior `hint_event` rows and fixes the rung here before any model is called.
The model writes prose for that rung only.

PRIOR COUNT FILTERING SCOPE:
    The `prior_count` parameter accepted across this module MUST strictly be the count
    of prior `hint_event` records matching BOTH the CURRENT `mission_session` AND the
    CURRENT target `concept_id` specifically (i.e. SQL condition:
    `WHERE session_id = :current_session_id AND concept_id = :current_target_concept_id`).
    It must NOT aggregate hints across different concepts or earlier sessions.

Rungs:
    1: ORIENT    - Point at the region, no diagnosis.
    2: QUESTION  - Make them think about the concept.
    3: NAME_IT   - Name the concept, show the pattern on a *different* foreign example.
    4: WALK      - Walk to the fix in their own code, in words.

Safety & pedagogical invariant:
    No rung ever emits a complete runnable solution. After rung 4 the student
    transitions to mini-practice on that one concept, not to the solution code.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.schemas.common import HintRung

MIN_RUNG: Final[int] = 1
MAX_RUNG: Final[int] = 4
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

# Fully concept-agnostic fallback texts (no hardcoded concept assumptions like comparison or loops)
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


@dataclass(frozen=True, slots=True)
class HintLadderDecision:
    """Deterministic hint ladder evaluation result."""

    rung: HintRung
    is_final: bool
    next_step: str | None
    description: str
    allowed: str
    forbidden: str


def next_rung(prior_count: int) -> HintRung:
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
    rung = next_rung(prior_count)
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
        return template.format(concept=concept_hint)

    return GENERIC_FALLBACK_HINTS[loc_key][rung_int]
