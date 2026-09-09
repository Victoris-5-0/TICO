"""Write TICO's closing sentence. Never raises — there is always a debrief.

The guard here is unusual and worth explaining: the reply is rejected if it contains a
number the counts do not support. A model given "4 attempts, 2 hints" will occasionally
write "من أول مرة" ("first try"), and that sentence in front of a child who fought for ten
minutes is worse than saying nothing specific at all — it proves nobody was watching.

So any digit in the reply must be one of the numbers it was given. Arabic-Indic digits are
folded first, because a model writing Arabic will use ٤ as readily as 4.
"""

from __future__ import annotations

import logging
import re
import time

from app.ai.prompts import debrief as prompt
from app.ai.router import AICapability, get_model
from app.config import settings

log = logging.getLogger(__name__)

#: ٠١٢٣٤٥٦٧٨٩ → 0123456789, so one check covers both ways of writing a number.
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

_NUMBER = re.compile(r"\d+")


def unsupported_number(text: str, allowed: set[int]) -> int | None:
    """The first number in the text that the counts do not support, if any."""
    for match in _NUMBER.finditer(text.translate(_ARABIC_DIGITS)):
        value = int(match.group())
        if value not in allowed:
            return value
    return None


def write_debrief(
    *,
    mission: str,
    concept: str,
    solved: bool,
    attempts: int,
    hints: int,
    time_spent_ms: int,
    errors_overcome: list[str],
) -> str:
    """One or two sentences of Egyptian Arabic about what actually happened."""
    started = time.time()
    fallback = prompt.FALLBACK_AR[solved]

    if not settings.google_api_key:
        return fallback

    system, task = prompt.build(
        mission=mission,
        concept=concept,
        solved=solved,
        attempts=attempts,
        hints=hints,
        time_spent_ms=time_spent_ms,
        errors_overcome=errors_overcome,
    )

    # Every number the model is allowed to say. Nothing else may appear.
    #
    # `len(errors_overcome)` is deliberately NOT in here. It was, and it made the guard
    # useless: one overcome error put 1 in the allowed set, which is exactly the number
    # that lets "من أول مرة" — first try — through to a child who took nine attempts. The
    # model should name the errors, not count them.
    minutes = max(1, round(time_spent_ms / 60_000))
    allowed = {attempts, hints, minutes}

    try:
        llm = get_model(
            AICapability.CHAT,
            temperature=0.8,  # warmth matters more here than precision; the guard handles precision
            max_output_tokens=settings.max_tokens_hint,
            timeout=15.0,
        )
        reply = llm.invoke([("system", system), ("human", task)])
        text = (reply.content or "").strip()
    except Exception as exc:  # noqa: BLE001 - a student always gets a debrief
        log.warning("debrief model call failed: %s", exc)
        return fallback

    text = _tidy(text)
    if not text:
        return fallback

    bad = unsupported_number(text, allowed)
    if bad is not None:
        log.warning(
            "debrief invented the number %s (allowed: %s); using the authored text", bad, allowed
        )
        return fallback

    log.debug("debrief written in %dms", int((time.time() - started) * 1000))
    return text


def _tidy(text: str) -> str:
    """Strip the wrappers models add despite being told not to."""
    text = text.strip()
    for fence in ("```", "«", "»"):
        text = text.replace(fence, "")
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1]
    return text.strip()
