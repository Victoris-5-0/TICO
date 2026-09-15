"""TICO's chat mode.

    own the session  ->  moderate  ->  generate  ->  leak guard  ->  stream

The moderation and leak-guard steps are a LangGraph in `app/ai/graphs/tico_chat.py`; this
module owns the session check, the mission context the graph needs, and turning one result
into SSE frames.

## Why chat may explain what a hint may not

A hint is help with *this blank*, so it is rationed by rung. Chat is help with *the idea*,
and explaining what `==` does is not the answer to the student's problem — so chat may
explain freely. The line it must not cross is writing the student's own solution, which is
what the graph's leak guard checks.

## The stream is real frames, not real tokens

`run_tico_chat` returns a finished string, so what goes down the wire is that string cut
into frames. The client's reader is identical either way, and when the graph learns to
stream from the model this module is the only thing that changes.
"""

from __future__ import annotations

import json
import hashlib
import logging
import re
from collections.abc import Iterator

from sqlalchemy.orm import Session

from app.ai.graphs.tico_chat import run_tico_chat
from app.models_tables import GeneratedMission
from app.queries import ai_log, sessions as session_q, users
from app.schemas.tico import TicoAnalysisSummary, TicoChunk

log = logging.getLogger(__name__)

#: Characters per SSE frame. Small enough that text appears to arrive progressively,
#: large enough not to flood the connection with one frame per letter.
FRAME_SIZE = 24


class SessionNotFound(RuntimeError):
    """No such session for this student. A 404, and deliberately not a 403 — see hints.py."""


def frame(chunk: TicoChunk) -> str:
    return f"data: {json.dumps(chunk.model_dump(), ensure_ascii=False)}\n\n"


def reply(db: Session, *, user_id: str, session_id: str | None, message: str,
          page: str = "mission", locale: str = "ar-EG", conversation_id: str | None = None,
          analysis_summary: TicoAnalysisSummary | None = None) -> Iterator[str]:
    """One chat turn, as a sequence of SSE frames."""
    users.ensure(db, user_id)

    session = session_q.get_owned(db, session_id, user_id) if session_id else None
    if (session_id and session is None) or (page == "mission" and session is None):
        raise SessionNotFound(f"no session '{session_id}' for this student")

    use_mission = page == "mission" or asks_about_mission(message)
    world, mission, concept, identifiers, values = (
        _mission_context(db, session) if session is not None and use_mission
        else (None, None, None, None, None)
    )
    # Page conversations cannot inherit mission threads, another user's history, or
    # older mission coaching when the next question is about the website itself.
    thread_id = session_id if page == "mission" else hashlib.sha256(
        f"{user_id}:{page}:{conversation_id or 'default'}:{'mission' if use_mission else 'page'}".encode()
    ).hexdigest()

    result = run_tico_chat(
        user_message=message,
        session_id=thread_id,
        world_title=world,
        mission_title=mission,
        target_concept=concept,
        # The graph checks the reply against these. They are never put in the prompt: a
        # model that has seen the solution is far more likely to repeat it.
        solution_identifiers=identifiers,
        target_values=values,
        page=page,
        locale=locale,
        analysis_summary=analysis_summary.model_dump() if analysis_summary is not None else None,
        stream=False,
    )

    ai_log.log(
        db,
        capability=ai_log.CHAT,
        user_id=user_id,
        session_id=session_id,
        model=result.model_name,
        status=ai_log.REJECTED if result.is_blocked else ai_log.SUCCESS,
    )
    db.commit()
    return _response_frames(result)


def asks_about_mission(message: str) -> bool:
    """Only load historical mission details for explicit mission questions."""
    return bool(re.search(
        r"\b(?:missions?|bakery|trays?|hassan|remix|guided coding)\b"
        r"|مهم[ةه]|الفرن|الصواني|عم حسن|رسالة الفتح|ظلي العيلة|النصيب العادي",
        message, re.IGNORECASE,
    ))


def _response_frames(result) -> Iterator[str]:

    if result.is_blocked:
        # One frame, no model call was made. The text is an in-character redirect, not a
        # scolding — a child who typed something rude is still a child who came to learn.
        yield frame(
            TicoChunk(
                delta=result.response,
                done=True,
                blocked=True,
                offered_hint_rung=result.offered_hint_rung,
            )
        )
        return

    text = result.response
    for i in range(0, len(text), FRAME_SIZE):
        yield frame(TicoChunk(delta=text[i : i + FRAME_SIZE]))

    yield frame(TicoChunk(done=True, offered_hint_rung=result.offered_hint_rung))


def _mission_context(
    db: Session, session
) -> tuple[str | None, str | None, str | None, list[str] | None, list[str] | None]:
    """What the graph needs to stay in the world and out of the answer.

    The generated mission keeps its prose and code inside `content`, not in columns —
    same shape `app/services/hints.py` reads.
    """
    mission_id = getattr(session, "generated_mission_id", None)
    if not mission_id:
        return None, None, None, None, None

    row = db.get(GeneratedMission, mission_id)
    if row is None or not row.content:
        return None, None, None, None, None

    content = row.content
    phases = content.get("phases") or {}
    guided = phases.get("guided") or {}
    solution = guided.get("solutionCode") or ""

    # Every blank across the guided steps: the values the reply must not simply state.
    values = [str(b) for step in guided.get("steps") or [] for b in step.get("blanks") or []]

    return (
        content.get("worldId"),
        content.get("titleAr"),
        content.get("targetConceptId"),
        _identifiers(solution),
        values or None,
    )


def _identifiers(solution_code: str | None) -> list[str] | None:
    """Names defined in the solution, for the leak guard to look for in the reply."""
    if not solution_code:
        return None

    import ast

    try:
        tree = ast.parse(solution_code)
    except SyntaxError:
        return None

    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            names.add(node.name)
        elif isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            names.add(node.id)
    # One- and two-letter names are shared vocabulary, not the answer.
    return sorted(n for n in names if len(n) > 2) or None
