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
import re
import time
from dataclasses import dataclass
from typing import Final

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.ai import guards
from app.ai.guards import validate_hint_output
from app.ai.prompts.tico_persona import get_hint_prompt
from app.ai.prompts import tico_hint as prompt
from app.ai.router import AICapability, get_model, get_model_name
from app.config import settings
from app.rules import hint_ladder
from app.rules.hint_ladder import (
    HintLadderDecision,
    evaluate_ladder,
    get_authored_fallback,
)
from app.schemas.common import HintRung

log = logging.getLogger(__name__)
#: Their half of this module logs through `logger`. Aliased rather than renamed so
#: the diff against `ai/foundations` stays readable.
logger = log


# --------------------------------------------------------------------------------- PII
# From `ai/foundations`. Their note on the scope of this is the important part, and it is
# right: this is a best-effort scrubber for an email a student pasted into their code or
# an error string, not a PII scanner. It will not catch a name or a phone number.
#
# The real defence is architectural — the prompt payload is built from the rung, the task
# text, the code and the error, and identity fields are not among them. That boundary
# holds by construction; this catches what a student typed into their own code.

EMAIL_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"
)


def strip_pii_from_text(text: str) -> str:
    """Redact email addresses from code or error text before it reaches the model."""
    return EMAIL_PATTERN.sub("[REDACTED_EMAIL]", text)


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
        # Students paste anything into a code box, including their own email.
        code=strip_pii_from_text(student_code),
        error_text=strip_pii_from_text(error_text) if error_text else None,
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
            # Theirs, and rung-aware where ours are not: it rejects a fenced code block at
            # rungs 1-2 and any runnable line at rung 4, and refuses a hint too short to
            # say anything. `solution_identifiers` is left unset deliberately — every
            # identifier in the solution would also reject a legitimate rung-3 hint that
            # says the word `return`, and the blank check above already covers the values
            # that matter.
            verdict = guards.validate_hint_output(rung, text, target_values=blanks)
            leaks, why = not verdict.passed, "; ".join(verdict.violations) or None
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


# ==========================================================================================
# From `ai/foundations` — their hint chain, kept whole.
#
# `/v1/hints` calls `write_hint` above. This one is not wired to a route yet, and it is here
# because it carries a rule ours does not: `use_static_hint` is the under-13 path from
# docs/08, where a student under 13 gets reviewed authored text and the model is never
# called. Ours calls the model for every student. That is a gap on our side, and folding
# this rule into `write_hint` is the next thing to do here.
#
# The other difference is the prompt: theirs is built by `app/ai/prompts/tico_persona`,
# which writes the rung's allowed/forbidden into the system prompt. Ours builds it in
# `app/ai/prompts/tico_hint` from `RUNG_INTENT` and the phase.
# ==========================================================================================

@dataclass(frozen=True, slots=True)
class TicoHintResult:
    """Structured result of the TICO hint chain.

    Satisfies the public contract requirement with deterministic rung resolution,
    pedagogical state, and model attribution.
    """

    rung: HintRung
    hint_text: str
    is_final: bool
    next_step: str | None
    is_model_generated: bool
    model_name: str | None = None


def generate_tico_hint(
    *,
    prior_count: int,
    code: str,
    error_text: str | None = None,
    error_tag: str | None = None,
    target_concept: str | None = None,
    world_title: str | None = None,
    mission_title: str | None = None,
    locale: str = "ar_EG",
    use_static_hint: bool = False,
    # Context fields that may be passed by callers but MUST be stripped (PII)
    student_name: str | None = None,
    student_email: str | None = None,
    student_age: int | None = None,
    oauth_id: str | None = None,
    chat_history: list[Any] | None = None,
    session_id: str | None = None,
    # Optional leak guard context from mission metadata
    solution_identifiers: list[str] | None = None,
    target_values: list[str] | None = None,
) -> TicoHintResult:
    """Generate or retrieve a hint for a student on their current mission.

    Data flow:
        prior_count -> rung -> prompt -> model call -> raw text -> guards.py (retry with feedback) -> result

    PII PRIVACY & CONVERSATION BOUNDARIES (docs/08):
        The primary PII protection is that identity fields (`student_name`, `student_email`,
        `student_age`, `oauth_id`, `chat_history`) are never referenced when constructing
        the prompt at all. This boundary is exhaustive by construction. In addition,
        `strip_pii_from_text` provides a best-effort scrubber for accidental email
        strings inside the student's code or runner error messages, but it is not a
        substitute for architectural field exclusion.

    Args:
        prior_count: Count of prior hint_event rows matching BOTH the current
                     mission_session AND the current target concept specifically.
        code: Student's current Python code submission.
        error_text: Optional execution failure / assertion message from the runner.
        error_tag: Optional normalized error taxonomy tag from /submissions/analyze.
        target_concept: The primary concept taught in this mission (e.g. 'for_loops').
        world_title: Optional world title for persona context (e.g. 'El Forn').
        mission_title: Optional mission title for persona context.
        locale: Target locale ('ar_EG' or 'en').
        use_static_hint: Under-13 rule. When True, returns reviewed authored hint text
                         without invoking the AI model. The caller (services layer)
                         is responsible for deriving this from the student's age band;
                         this chain only obeys it.
        student_name: Discarded before model call (PII).
        student_email: Discarded before model call (PII).
        student_age: Discarded before model call (PII).
        oauth_id: Discarded before model call (PII).
        chat_history: Discarded before model call (PII).
        session_id: Internal pseudonymous session correlation identifier.
        solution_identifiers: Optional identifiers from mission solution for leak checks.
        target_values: Optional target values from mission solution for leak checks.

    Returns:
        TicoHintResult containing the rung, hint prose, finality status, and source.
    """
    # 1. Deterministic ladder evaluation: NEVER compute the rung in the chain
    decision: HintLadderDecision = evaluate_ladder(prior_count)
    rung = decision.rung
    is_final = decision.is_final
    next_step = decision.next_step

    # 2. Under-13 rule: return reviewed static fallback without calling the model
    if use_static_hint:
        authored_text = get_authored_fallback(
            rung=rung,
            locale=locale,
            concept_hint=target_concept,
        )
        return TicoHintResult(
            rung=rung,
            hint_text=authored_text,
            is_final=is_final,
            next_step=next_step,
            is_model_generated=False,
            model_name=None,
        )

    # 3. PII Stripping per docs/08:
    # student_name, student_email, student_age, oauth_id, and chat_history are dropped.
    # Inline code and error strings are sanitized for email/secret leaks.
    sanitized_code = strip_pii_from_text(code)
    sanitized_error_text = strip_pii_from_text(error_text) if error_text else None
    sanitized_error_tag = strip_pii_from_text(error_tag) if error_tag else None

    # 4. Build prompt via versioned tico_persona module: NEVER construct prompt inline
    system_prompt = get_hint_prompt(
        rung=int(rung),
        world_title=world_title,
        mission_title=mission_title,
        target_concept=target_concept,
        locale=locale,
    )

    user_lines = [
        "كود الطالب الحالي:",
        "```python",
        sanitized_code,
        "```",
    ]
    if sanitized_error_text:
        user_lines.extend(["", "رسالة الخطأ:", sanitized_error_text])
    if sanitized_error_tag:
        user_lines.extend(["", f"تصنيف الخطأ: {sanitized_error_tag}"])

    user_prompt = "\n".join(user_lines)

    # 5. Model resolution and invocation with safe fallback on ANY failure
    try:
        model = get_model(AICapability.HINT)
        model_name = get_model_name(AICapability.HINT)

        initial_messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]

        def _invoke_and_extract(msgs: list[Any]) -> str:
            response = model.invoke(msgs)
            raw_text = response.content if hasattr(response, "content") else str(response)
            if isinstance(raw_text, list):
                raw_text = "".join(
                    part if isinstance(part, str) else str(part.get("text", ""))
                    for part in raw_text
                )
            return str(raw_text).strip()

        hint_text = _invoke_and_extract(initial_messages)

        # Guard validation: validate output against rung leak constraints
        guard_result = validate_hint_output(
            rung=rung,
            hint_text=hint_text,
            solution_identifiers=solution_identifiers,
            target_values=target_values,
        )

        if not guard_result.passed:
            logger.warning(
                "TICO hint guard validation failed on initial attempt (rung=%s): %s. Retrying once.",
                int(rung),
                guard_result.violations,
            )
            # FIX C: Retry includes specific violation feedback rather than repeating identical prompt
            feedback_content = (
                f"الرد اللي فات فيه مشكلة: {', '.join(guard_result.violations)}. "
                f"اكتب رد تاني يراعي القاعدة دي ومايكررش نفس المشكلة."
            )
            retry_messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
                HumanMessage(content=feedback_content),
            ]

            hint_text = _invoke_and_extract(retry_messages)
            guard_result = validate_hint_output(
                rung=rung,
                hint_text=hint_text,
                solution_identifiers=solution_identifiers,
                target_values=target_values,
            )

            if not guard_result.passed:
                logger.warning(
                    "TICO hint prompt regression: guard validation failed on retry (rung=%s): %s. Falling back to authored hint.",
                    int(rung),
                    guard_result.violations,
                )
                hint_text = get_authored_fallback(
                    rung=rung,
                    locale=locale,
                    concept_hint=target_concept,
                )
                is_model_generated = False
                model_name = None
            else:
                is_model_generated = True
        else:
            is_model_generated = True

        # TODO (M0/M2 - queries/ai_interaction.py): Once the database queries layer is ready,
        # log every model call to the `ai_interaction` table:
        # capability="hint", model=model_name, tokens, cost, latency_ms, prompt_version,
        # session_id, student_id (pseudonymous), and moderation_flag.

    except Exception as exc:
        # Note: This is a temporary logging approach; once queries/ai_interaction logging exists
        # (a separate upcoming task), this failure must ALSO be recorded there with `failure_type`,
        # per docs/08's ai_interaction audit requirement.
        logger.warning(
            "TICO hint model call failed (rung=%s, locale=%s): %s",
            int(rung),
            locale,
            exc,
            exc_info=True,
        )
        hint_text = get_authored_fallback(
            rung=rung,
            locale=locale,
            concept_hint=target_concept,
        )
        is_model_generated = False
        model_name = None

    return TicoHintResult(
        rung=rung,
        hint_text=hint_text,
        is_final=is_final,
        next_step=next_step,
        is_model_generated=is_model_generated,
        model_name=model_name,
    )
