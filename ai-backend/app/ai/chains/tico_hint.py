"""TICO hint generation chain (M2 — P0).

Writes rung N prose only; never shown the complete solution.
Single-shot runnable integrating:
    1. app.rules.hint_ladder.evaluate_ladder (deterministic rung selection)
    2. app.ai.prompts.tico_persona.get_hint_prompt (versioned prompt per rung)
    3. app.ai.router.get_model(AICapability.HINT) (Gemini routing)
    4. PII stripping (docs/08 Conversation Boundaries)
    5. Under-13 static hint rule (docs/08)
    6. Authored fallback upon model failure or rate-limit
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Final

from langchain_core.messages import HumanMessage, SystemMessage

from app.ai.prompts.tico_persona import get_hint_prompt
from app.ai.router import AICapability, get_model, get_model_name
from app.rules.hint_ladder import (
    HintLadderDecision,
    evaluate_ladder,
    get_authored_fallback,
)
from app.schemas.common import HintRung

logger = logging.getLogger(__name__)

EMAIL_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"
)


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


def strip_pii_from_text(text: str) -> str:
    """Remove email addresses from code or error strings.

    LIMITATION & SCOPE:
        This is a best-effort inline regex scrubber for accidental email addresses
        in code or error text specifically. It is NOT a comprehensive PII scanner
        and will not catch names, phone numbers, or arbitrary identifying information
        a student might type in code comments or strings.

        The primary PII defense of the system is architectural: caller-provided
        identity fields (student_name, student_email, student_age, oauth_id, chat_history)
        are completely omitted when constructing the prompt payload. This boundary
        is exhaustive by construction, not by pattern matching.
    """
    return EMAIL_PATTERN.sub("[REDACTED_EMAIL]", text)


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
) -> TicoHintResult:
    """Generate or retrieve a hint for a student on their current mission.

    Data flow:
        prior_count -> rung -> prompt -> model call -> raw text -> (eventually guards.py) -> result

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

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        response = model.invoke(messages)
        raw_text = response.content if hasattr(response, "content") else str(response)

        if isinstance(raw_text, list):
            # Handle potential multi-part text blocks
            raw_text = "".join(
                part if isinstance(part, str) else str(part.get("text", ""))
                for part in raw_text
            )

        hint_text = str(raw_text).strip()
        is_model_generated = True

        # TODO (M2 - ai/guards.py): Once app.ai.guards is implemented (the next task in M2),
        # validate `hint_text` against the pedagogical rung assertions:
        #   - Rungs 1-2: Assert no solution identifiers and no code blocks.
        #   - Rung 3: Assert no target values / mission identifiers.
        #   - Rung 4: Assert no complete runnable line.
        # If guard validation fails, retry once with the model; if it fails again,
        # fall back to get_authored_fallback(rung, locale, target_concept) and log a prompt regression.

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
