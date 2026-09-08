"""Ask TICO for one hint, and never let the answer through.

    rung decided in Python  ->  cache?  ->  model  ->  leak guard  ->  retry once
                                                                   ->  authored fallback

Three things are settled before the model is involved: which rung, what it is allowed to
do at that rung, and what the student has already been told. The model writes prose for a
decision that was already made.

## The guard is not optional

`hint_leaks_answer` compares the reply against the mission's own solution. A model that
has been told four times not to give the answer will still occasionally paste the line —
usually at rung 4, where it is trying hardest to be helpful. When that happens the hint is
thrown away and rewritten once; if the rewrite also leaks, the student gets the authored
fallback instead. A vague hint that is safe beats a specific one that ends the mission.

## Cost

The cache is checked first and is the main lever, not an optimisation. Beginners fail in a
small number of identical ways, so on early lessons the same handful of keys serve most
students — and Gemini's own context caching has minimum-token thresholds that a short hint
prompt never reaches, so not calling the model is the only saving available.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.ai import guards
from app.ai.prompts import tico_hint as prompt
from app.ai.router import AICapability, get_model
from app.config import settings
from app.rules import hint_ladder
from app.schemas.common import HintRung

log = logging.getLogger(__name__)


@dataclass
class HintResult:
    text: str
    #: "model" | "cache" | "fallback" — the number worth watching is how often it is
    #: not "model", because a silent slide to fallback looks exactly like success.
    source: str
    model_name: str | None = None
    latency_ms: int = 0
    #: Set when the model leaked and was thrown away. Rare, and worth alerting on.
    leaked: bool = False
    leak_reason: str | None = None


def write_hint(
    *,
    rung: HintRung,
    phase: str,
    task_ar: str,
    student_code: str,
    solution_code: str,
    error_text: str | None = None,
    error_tag: str | None = None,
    previous_hints: list[str] | None = None,
    authored_fallback: str | None = None,
    blanks: list[str] | None = None,
) -> HintResult:
    """Write one hint for one rung. Never raises — a student always gets something.

    `solution_code` and `blanks` are passed in only so the guards can check the reply
    against them. Neither goes into the prompt: the model does not need the answer to
    write a hint, and a model that has seen the answer is far more likely to repeat it.

    Both guards run. `hint_leaks_answer` catches a solution line pasted whole;
    `hint_leaks_blank` catches the far more common failure during guided coding, where
    the model helpfully names the value that belongs in the blank.
    """
    started = time.time()
    fallback = authored_fallback or prompt.FALLBACK_AR.get(int(rung), prompt.FALLBACK_AR[1])

    if not settings.google_api_key:
        return HintResult(text=fallback, source="fallback", latency_ms=0)

    system, task = prompt.build(
        rung=int(rung),
        intent=hint_ladder.intent_for(rung),
        phase=phase,
        task_ar=task_ar,
        code=student_code,
        error_text=error_text,
        error_tag=error_tag,
        previous_hints=previous_hints,
    )

    llm = get_model(
        AICapability.HINT,
        # Warm enough not to sound like a manual, tight enough to stay at its rung.
        temperature=0.6,
        max_output_tokens=settings.max_tokens_hint,
        timeout=20.0,
    )

    messages = [("system", system), ("human", task)]
    leaked_once = False
    reason: str | None = None

    for attempt in (1, 2):
        try:
            reply = llm.invoke(messages)
            text = (reply.content or "").strip()
        except Exception as exc:  # noqa: BLE001 - a student must still get a hint
            log.warning("hint model call failed at rung %s: %s", int(rung), exc)
            return HintResult(
                text=fallback,
                source="fallback",
                latency_ms=int((time.time() - started) * 1000),
            )

        if not text:
            messages.append(("human", "You returned nothing. Write the hint."))
            continue

        leaks, why = guards.hint_leaks_answer(text, solution_code)
        if not leaks:
            leaks, why = guards.hint_leaks_blank(text, blanks)
        if not leaks:
            return HintResult(
                text=_tidy(text),
                source="model",
                model_name=settings.model_hint,
                latency_ms=int((time.time() - started) * 1000),
                leaked=leaked_once,
                leak_reason=reason if leaked_once else None,
            )

        leaked_once = True
        reason = why
        log.warning("rung %s hint leaked the answer (%s); rewriting", int(rung), why)
        messages.append((
            "human",
            f"That gave away the answer: {why}. Rewrite it. Point them at WHERE the "
            "value comes from without stating it. Do not write any line of their "
            "solution, and do not name the value that goes in the blank.",
        ))

    # Both attempts leaked. The authored fallback is vague, and vague is safe.
    log.warning("rung %s leaked twice; using the authored fallback", int(rung))
    return HintResult(
        text=fallback,
        source="fallback",
        model_name=settings.model_hint,
        latency_ms=int((time.time() - started) * 1000),
        leaked=True,
        leak_reason=reason,
    )


def _tidy(text: str) -> str:
    """Strip the wrappers models add despite being told not to."""
    text = text.strip()
    for fence in ("```", "«", "»"):
        text = text.replace(fence, "")
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1]
    return text.strip()
