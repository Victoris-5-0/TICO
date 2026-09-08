"""Serve one hint.

    own the session  ->  count prior hints  ->  fix the rung  ->  cache?
                                                              ->  model + guard
                                                              ->  record the event

The rung is counted from `hint_events`, never taken from the client. A client that could
name its own rung could ask for rung 4 on the first try, and the ladder would be
decoration.

## Who writes hint_events

**This service does, and the Next.js layer must not.** Both wrote to that table for a
while, which made the ladder climb 1 → 3 → 5 — a student got the walk-me-through hint on
their second ask. The rung in the response is authoritative; the client should display it
rather than counting its own.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.ai.chains import tico_hint
from app.ai.prompts import tico_hint as hint_prompt
from app.models_tables import GeneratedMission
from app.models_tables.enums import ScaffoldLevel
from app.queries import ai_log, hints as hint_q, sessions as session_q, users
from app.rules import hint_ladder
from app.rules.hint_ladder import HintsNotAvailable
from app.schemas.common import Phase

log = logging.getLogger(__name__)


class SessionNotFound(RuntimeError):
    """No such session for this student. A 404, and deliberately not a 403.

    Telling an attacker apart from a typo is not worth confirming that someone else's
    session id exists.
    """


def _mission_context(db: Session, session, guided_step: int | None) -> tuple[str, str, list[str]]:
    """`(task description, solution code, blank answers)` for the mission being played.

    The solution and the blank answers are fetched only so the guards can compare
    against them. Neither enters the prompt.
    """
    if not session or not session.generated_mission_id:
        return "", "", []

    row = db.get(GeneratedMission, session.generated_mission_id)
    if row is None or not row.content:
        return "", "", []

    content = row.content
    phases = content.get("phases") or {}
    guided = phases.get("guided") or {}
    encounter = phases.get("encounter") or {}

    # What the student is being asked to do, in their own language, so the hint can talk
    # about the bakery rather than about "the function".
    task_bits = [encounter.get("lineAr") or ""]
    for step in guided.get("steps") or []:
        if step.get("promptAr"):
            task_bits.append(step["promptAr"])

    # The answers for the step they are actually on. A hint for step 2 must not be
    # blocked by step 1's answer, and must not give away its own.
    steps = guided.get("steps") or []
    blanks: list[str] = []
    if steps:
        index = guided_step if guided_step is not None and 0 <= guided_step < len(steps) else 0
        blanks = list(steps[index].get("blanks") or [])

    return (
        "\n".join(b for b in task_bits if b),
        guided.get("solutionCode") or "",
        blanks,
    )


def request_hint(
    db: Session,
    *,
    user_id: str,
    session_id: str,
    mission_id: str,
    code_excerpt: str,
    phase: Phase = Phase.GUIDED_CODING,
    guided_step: int | None = None,
    error_text: str | None = None,
    error_tag: str | None = None,
    locale: str = "ar-EG",
) -> dict:
    """The whole pipeline. Returns the fields `HintResponse` needs."""
    users.ensure(db, user_id)

    # Ownership, not just existence. A session id is guessable enough that fetching by
    # id alone would let one child read another's hints.
    session = session_q.get_owned(db, session_id, user_id)
    if session is None:
        raise SessionNotFound(f"no session '{session_id}' for this student")

    if not hint_ladder.has_ladder(phase):
        raise HintsNotAvailable(
            f"{phase.value} has no hint ladder — there is no blank to be stuck on. "
            "Use TICO chat for an explanation, and phase 2 carries its own nudge."
        )

    shown = hint_q.highest_rung(db, session_id)
    position = hint_ladder.next_rung(phase, shown)

    task_ar, solution_code, blanks = _mission_context(db, session, guided_step)
    scaffold_state = _scaffold_state(session, db)

    # ---------------------------------------------------------------- the cache
    cache_key = dict(
        exercise_id=mission_id,
        hint_level=int(position.rung),
        # Widened with the phase and step so a hint written for step 1 of guided coding
        # is never served to someone stuck on the remix.
        error_tag=f"{error_tag or '-'}|{hint_ladder.cache_scope(phase, position.rung, guided_step)}",
        scaffold_state=scaffold_state,
        locale=locale,
    )

    cached = hint_q.cache_lookup(db, **cache_key)
    if cached is not None:
        hint_q.cache_hit(db, cached)
        event = hint_q.record(
            db,
            session_id=session_id,
            hint_level=int(position.rung),
            text=cached.text,
            model=cached.model,
            scaffold_state=scaffold_state,
        )
        # Cached hints cost nothing, so they do not count against the daily cap — a
        # student should not be penalised for asking what someone else already asked.
        ai_log.log(
            db, capability=ai_log.HINT, user_id=user_id, session_id=session_id,
            model=cached.model, status=ai_log.CACHED,
        )
        return _response(position, cached.text, event.id, cached=True)

    # ---------------------------------------------------------------- the model
    previous = [h.text for h in hint_q.for_session(db, session_id) if h.text]

    result = tico_hint.write_hint(
        rung=position.rung,
        phase=phase.value,
        task_ar=task_ar,
        student_code=code_excerpt,
        solution_code=solution_code,
        error_text=error_text,
        error_tag=error_tag,
        previous_hints=previous,
        authored_fallback=hint_prompt.FALLBACK_AR.get(int(position.rung)),
        blanks=blanks,
    )

    # Only cache what a guard approved. A cached leak is far worse than a live one: it
    # would be served to every student who hits the same mistake, with no second chance
    # for the model to get it right.
    if result.source == "model" and not result.leaked:
        hint_q.cache_store(
            db, **cache_key, text=result.text, model=result.model_name
        )

    event = hint_q.record(
        db,
        session_id=session_id,
        hint_level=int(position.rung),
        text=result.text,
        # None means the text came from the authored fallback rather than Gemini — worth
        # being able to tell apart when the eval numbers look strange.
        model=result.model_name if result.source == "model" else None,
        scaffold_state=scaffold_state,
    )

    ai_log.log(
        db,
        capability=ai_log.HINT,
        user_id=user_id,
        session_id=session_id,
        model=result.model_name,
        prompt_version=hint_prompt.PROMPT_VERSION,
        output_text=result.text[:1000],
        latency_ms=result.latency_ms,
        status=ai_log.REJECTED if result.leaked else ai_log.SUCCESS,
        moderation_flag=result.leak_reason,
    )

    # A hint that leaked and had to be replaced is a prompt problem, and it will not
    # show up anywhere else — the student saw something perfectly reasonable.
    if result.leaked:
        log.warning(
            "hint leak at rung %s in session %s: %s",
            int(position.rung), session_id, result.leak_reason,
        )

    session.hints_used = (session.hints_used or 0) + 1
    db.flush()

    return _response(position, result.text, event.id, cached=False)


def _scaffold_state(session, db: Session) -> ScaffoldLevel | None:
    """How much was pre-filled for this student.

    Part of the cache key, and part of the hint's job: TICO must not hint about a
    concept that was scaffolded away, because for this student it is already written.
    """
    if not session.generated_mission_id:
        return None
    row = db.get(GeneratedMission, session.generated_mission_id)
    if row is None or not row.scaffold_plan:
        return None

    levels = {str(v).upper() for v in row.scaffold_plan.values()}
    for level in ("FULL", "PARTIAL", "NONE"):
        if level in levels:
            return ScaffoldLevel(level)
    return None


def _response(position, text: str, event_id: str, *, cached: bool) -> dict:
    return {
        "rung": position.rung,
        "hint": text,
        "is_final": position.is_final,
        "next_step": position.next_step,
        "remaining_rungs": position.remaining,
        "hint_event_id": event_id,
        "cached": cached,
    }
