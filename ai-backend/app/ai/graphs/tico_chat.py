"""TICO companion chat LangGraph graph with checkpointer (M6 — P0).

Implements the multi-turn conversational pipeline for TICO companion chat:
    Input -> Moderation (short-circuit on block) -> Model Generation -> Solution Leak Guard (retry once on leak) -> Output

NEEDS DECISION: Architectural path for conversation persistence.
Option D (Target Direction): Persistence between chat turns should be handled by
reading and writing plain rows to the already-existing `CompanionChat` table in
`client/prisma/schema.prisma` (`id, userId, lessonId, messages Json, createdAt, updatedAt`,
mapped to `companion_chats`) via a future `queries/companion_chat.py` module (matching
this service's established SQLAlchemy read/write-only pattern for every other AI table) —
NOT via LangGraph's built-in `PostgresSaver` mechanism, which attempts to own and create its
own DDL tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`),
violating the project's strict rule that Prisma is the sole schema authority.
For now, Option C is implemented: `MemorySaver` provides in-memory checkpointing per-process,
with an abstracted checkpointer parameter accepting any `BaseCheckpointSaver`.

NOTE ON STREAMING & SSE DELIVERY:
`generate_response_node` calls `get_model(AICapability.CHAT, streaming=stream)`. Currently,
this node executes `model.invoke()` which returns the full response synchronously, even when
`streaming=True` at the LangChain model client level. True token-by-token SSE delivery to an
HTTP client requires the future API layer (`POST /v1/tico/messages`, not yet built) to call this
graph via LangGraph streaming APIs (e.g. `.stream()` or `.astream_events()` over the graph,
or a generator/streaming handler) rather than calling `run_tico_chat()`'s synchronous `.invoke()`
wrapper as-is. This is a known architectural interface boundary for the endpoint implementation,
not a gap inside this graph.

Child safety & conversation boundaries contract (AGENTS.md, docs/08, docs/10):
  - Pre-prompt input moderation before text enters any prompt. Blocked text short-circuits
    with safe redirect message and zero model calls.
  - SAFETY_CONCERN (self-harm, danger, violence) surfaces requires_human_escalation=True.
  - SOLUTION_REQUEST offers next hint rung (rung 1).
  - Post-generation output guard detects premature solution leaks and retries once with
    violation feedback before falling back to authored text.
  - PII scrubbing: student identity fields (student_name, student_email, student_age, oauth_id)
    are excluded from prompts; accidental email addresses in text are redacted.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Annotated, Any, Final, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.ai.chains.tico_hint import strip_pii_from_text
from app.ai.guards import (
    contains_any_term,
    contains_runnable_python_line,
)
from app.ai.moderation import (
    ModerationCategory,
    ModerationVerdict,
    moderate_input,
)
from app.ai.prompts.tico_chat import (
    TICO_CHAT_PROMPT_VERSION,
    get_tico_chat_system_prompt,
)
from app.ai.router import AICapability, get_model, get_model_name

logger = logging.getLogger(__name__)

MAX_LEAK_RETRIES: Final[int] = 1
RETIRED_IDENTITY = re.compile(r"هدهد|hoopoe", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class TicoChatResult:
    """Public result contract for a TICO companion chat turn."""

    response: str
    is_blocked: bool
    moderation_verdict: ModerationVerdict | None
    requires_human_escalation: bool
    is_model_generated: bool
    model_name: str | None = None
    offered_hint_rung: int | None = None
    messages: list[BaseMessage] | None = None


class TicoChatState(TypedDict):
    """Internal LangGraph state for TICO companion chat."""

    messages: Annotated[list[BaseMessage], add_messages]
    user_message: str
    locale: str
    stream: bool
    world_title: str | None
    mission_title: str | None
    target_concept: str | None
    page: str
    analysis_summary: dict | None

    solution_identifiers: list[str] | None
    target_values: list[str] | None

    moderation_verdict: ModerationVerdict | None
    is_blocked: bool
    requires_human_escalation: bool

    draft_response: str
    final_response: str
    retry_count: int
    leak_feedback: str | None
    is_model_generated: bool
    model_name: str | None
    offered_hint_rung: int | None
    has_error: bool


# ---------------------------------------------------------------------------
# Graph Nodes
# ---------------------------------------------------------------------------


def moderate_input_node(state: TicoChatState) -> dict[str, Any]:
    """Node 1: Moderate student input before it enters any prompt.

    If input violates child safety or mission boundaries, short-circuit immediately
    with a safe redirect message and zero model calls.
    """
    user_text = state.get("user_message", "")
    locale = state.get("locale", "ar_EG")

    verdict = moderate_input(user_text, locale=locale)

    if verdict.is_blocked:
        redirect_msg = verdict.safe_redirect_message or ""
        offered_rung = (
            1 if ModerationCategory.SOLUTION_REQUEST in verdict.categories else None
        )
        return {
            "moderation_verdict": verdict,
            "is_blocked": True,
            "requires_human_escalation": verdict.requires_human_escalation,
            "final_response": redirect_msg,
            "draft_response": redirect_msg,
            "messages": [AIMessage(content=redirect_msg)],
            "offered_hint_rung": offered_rung,
            "is_model_generated": False,
            "model_name": None,
        }

    return {
        "moderation_verdict": verdict,
        "is_blocked": False,
        "requires_human_escalation": False,
        "retry_count": 0,
        "leak_feedback": None,
        "has_error": False,
    }


def generate_response_node(state: TicoChatState) -> dict[str, Any]:
    """Node 2: Generate conversational response via Gemini model router.

    NOTE ON STREAMING & SSE DELIVERY:
    This node invokes `get_model(AICapability.CHAT, streaming=stream)`.
    Currently, `model.invoke()` returns the complete response synchronously,
    even when `streaming=True` at the LangChain client level. True token-by-token
    streaming delivery over SSE to an HTTP client requires the future API layer
    (`POST /v1/tico/messages`, not yet built) to call this graph using LangGraph's
    `.stream()` / `.astream_events()` API or custom chunk handlers, rather than
    calling `run_tico_chat()`'s synchronous `.invoke()` wrapper as-is.
    """
    locale = state.get("locale", "ar_EG")
    stream = state.get("stream", True)
    world_title = state.get("world_title")
    mission_title = state.get("mission_title")
    target_concept = state.get("target_concept")
    leak_feedback = state.get("leak_feedback")

    system_prompt = get_tico_chat_system_prompt(
        world_title=world_title,
        mission_title=mission_title,
        target_concept=target_concept,
        locale=locale,
        page=state.get("page", "mission"),
        analysis_summary=state.get("analysis_summary"),
    )

    # Build message payload for model invocation
    llm_messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]

    # Add conversation history with PII scrubbed
    for msg in state.get("messages", []):
        if isinstance(msg, HumanMessage):
            scrubbed = strip_pii_from_text(msg.content)
            llm_messages.append(HumanMessage(content=scrubbed))
        elif isinstance(msg, AIMessage):
            if not RETIRED_IDENTITY.search(str(msg.content)):
                llm_messages.append(msg)

    # If this is a retry attempt, append specific feedback
    if leak_feedback:
        llm_messages.append(HumanMessage(content=leak_feedback))

    try:
        model = get_model(AICapability.CHAT, streaming=stream)
        model_name = get_model_name(AICapability.CHAT)

        response = model.invoke(llm_messages)
        raw_text = response.content if hasattr(response, "content") else str(response)
        if isinstance(raw_text, list):
            raw_text = "".join(
                part if isinstance(part, str) else str(part.get("text", ""))
                for part in raw_text
            )
        draft_text = str(raw_text).strip()

        return {
            "draft_response": draft_text,
            "model_name": model_name,
            "is_model_generated": True,
            "has_error": False,
        }

    except Exception as exc:
        logger.warning("TICO chat model call failed: %s", exc, exc_info=True)
        fallback_msg = (
            "معلش يا بطل، حصلت مشكلة بسيطة في الاتصال. اسألني تاني بعد لحظات!"
            if locale.startswith("ar")
            else "Sorry champ, I had a little trouble connecting. Please ask me again in a moment!"
        )
        return {
            "draft_response": fallback_msg,
            "final_response": fallback_msg,
            "messages": [AIMessage(content=fallback_msg)],
            "is_model_generated": False,
            "model_name": None,
            "has_error": True,
            "leak_feedback": None,
        }


def leak_guard_node(state: TicoChatState) -> dict[str, Any]:
    """Node 3: Post-generation solution leak validation.

    If in mission context, checks whether generated text leaks runnable code,
    solution identifiers, or target values. Retries once with feedback on violation;
    falls back to safe message on repeated failure.
    """
    draft = state.get("draft_response", "")
    solution_identifiers = state.get("solution_identifiers")
    target_values = state.get("target_values")
    retry_count = state.get("retry_count", 0)
    locale = state.get("locale", "ar_EG")

    violations: list[str] = []
    retired_identity = bool(RETIRED_IDENTITY.search(draft))
    if retired_identity:
        violations.append("incorrect robot identity")

    # Check for mission solution leak if mission context is present
    has_mission_context = bool(
        solution_identifiers or target_values or state.get("mission_title")
    )

    if has_mission_context:
        if solution_identifiers and contains_any_term(draft, solution_identifiers):
            violations.append("contains mission solution identifiers")
        if target_values and contains_any_term(draft, target_values):
            violations.append("contains mission target values")
        if contains_runnable_python_line(draft):
            violations.append("contains a complete runnable line of Python code")

    if violations:
        if retry_count < MAX_LEAK_RETRIES:
            logger.warning(
                "TICO chat solution leak detected (attempt %s): %s. Retrying with feedback.",
                retry_count + 1,
                violations,
            )
            feedback = (
                f"الرد السابق احتوى على كود أو حل مباشر للمهمة ({', '.join(violations)}). "
                f"تذكر أنك تيكو: ممنوع تقديم كود جاهز أو حل كامل للطالب. "
                f"اشرح الفكرة بالكلمات فقط أو اطرح سؤالاً إرشادياً بدون كود صالح للتشغيل."
                if locale.startswith("ar")
                else f"Previous response leaked mission solution ({', '.join(violations)}). "
                f"Do NOT provide complete code or runnable solutions. Guide the student in words only."
            )
            if retired_identity:
                feedback += "\nYou are TICO, the friendly orange robot. Describe yourself only as an orange robot. Answer the current page question."
            return {
                "retry_count": retry_count + 1,
                "leak_feedback": feedback,
            }

        # Second failure: fall back to safe authored response
        logger.warning(
            "TICO chat solution leak persisted after retry: %s. Falling back to authored response.",
            violations,
        )
        fallback = (
            "أنا هنا أساعدك تفكر في الكود بنفسك يا بطل، بلاش نعتمد على كود جاهز! "
            "راجع المفهوم البرمجي للتحدي وجرب تكتب المحاولة القادمة بنفسك خطوة بخطوة."
            if locale.startswith("ar")
            else "I'm here to help you think through the code yourself, champ! "
            "Let's review the concept and try the next step yourself."
        )
        if retired_identity:
            fallback = (
                "أنا تيكو، الروبوت البرتقالي الودود! أقدر أساعدك تفهم الموقع والصفحة اللي فاتحها."
                if locale.startswith("ar") else
                "I'm TICO, the friendly orange robot! I can help you understand this website and the page you're on."
            )
        return {
            "final_response": fallback,
            "messages": [AIMessage(content=fallback)],
            "is_model_generated": False,
            "leak_feedback": None,
        }

    # Passed validation
    return {
        "final_response": draft,
        "messages": [AIMessage(content=draft)],
        "is_model_generated": True,
        "leak_feedback": None,
    }


# ---------------------------------------------------------------------------
# Routing & Graph Construction
# ---------------------------------------------------------------------------


def route_after_moderation(state: TicoChatState) -> str:
    """Route after moderation: short-circuit to END if blocked."""
    if state.get("is_blocked", False):
        return END
    return "generate_response"


def route_after_generation(state: TicoChatState) -> str:
    """Route after generation: route to END on error, else to leak guard."""
    if state.get("has_error", False):
        return END
    return "leak_guard"


def route_after_guard(state: TicoChatState) -> str:
    """Route after leak guard: retry generation if feedback present, else END."""
    if state.get("leak_feedback") is not None:
        return "generate_response"
    return END


def build_tico_chat_graph(
    checkpointer: BaseCheckpointSaver | None = None,
) -> Any:
    """Assemble and compile the StateGraph for TICO companion chat.

    Args:
        checkpointer: Optional LangGraph checkpoint saver. Defaults to MemorySaver().

    Returns:
        Compiled LangGraph state graph.
    """
    workflow = StateGraph(TicoChatState)

    workflow.add_node("moderate_input", moderate_input_node)
    workflow.add_node("generate_response", generate_response_node)
    workflow.add_node("leak_guard", leak_guard_node)

    workflow.add_edge(START, "moderate_input")

    workflow.add_conditional_edges(
        "moderate_input",
        route_after_moderation,
        {
            END: END,
            "generate_response": "generate_response",
        },
    )

    workflow.add_conditional_edges(
        "generate_response",
        route_after_generation,
        {
            END: END,
            "leak_guard": "leak_guard",
        },
    )

    workflow.add_conditional_edges(
        "leak_guard",
        route_after_guard,
        {
            END: END,
            "generate_response": "generate_response",
        },
    )

    saver = checkpointer if checkpointer is not None else MemorySaver()
    return workflow.compile(checkpointer=saver)


# PRODUCTION RISK NOTE: this module-level MemorySaver is a process-wide
# singleton shared by every call to run_tico_chat() that doesn't pass an
# explicit checkpointer or graph. Beyond not surviving a server restart
# (already noted above under Option D), it also grows UNBOUNDED for the
# lifetime of the running process — every distinct thread_id/session_id
# accumulates state with no eviction. This default must not be used directly
# in production once real request traffic exists; either every caller must
# supply a scoped checkpointer, or (per Option D above) conversation
# persistence must move to the CompanionChat table before this ships.
_default_memory_saver = MemorySaver()
_default_tico_chat_graph = build_tico_chat_graph(checkpointer=_default_memory_saver)


def run_tico_chat(
    *,
    user_message: str,
    session_id: str = "default_session",
    world_title: str | None = None,
    mission_title: str | None = None,
    target_concept: str | None = None,
    solution_identifiers: list[str] | None = None,
    target_values: list[str] | None = None,
    locale: str = "ar_EG",
    page: str = "mission",
    analysis_summary: dict | None = None,
    stream: bool = True,
    # Caller-provided identity fields that MUST be stripped (PII)
    student_name: str | None = None,
    student_email: str | None = None,
    student_age: int | None = None,
    oauth_id: str | None = None,
    checkpointer: BaseCheckpointSaver | None = None,
    graph: Any | None = None,
) -> TicoChatResult:
    """High-level runner executing the TICO companion chat graph.

    Args:
        user_message: Student free text input.
        session_id: Session ID / LangGraph thread ID for multi-turn persistence.
        world_title: Optional world title for persona context.
        mission_title: Optional active mission title.
        target_concept: Optional concept identifier.
        solution_identifiers: Optional identifiers from mission solution.
        target_values: Optional literal values from mission solution.
        locale: Target locale ('ar_EG' or 'en').
        stream: Whether to request streaming from model router (default True).
        student_name: Dropped before prompt construction (PII).
        student_email: Dropped before prompt construction (PII).
        student_age: Dropped before prompt construction (PII).
        oauth_id: Dropped before prompt construction (PII).
        checkpointer: Optional custom checkpointer instance.
        graph: Optional pre-compiled LangGraph application.

    Returns:
        TicoChatResult containing response text, moderation verdict, and safety metadata.
    """
    sanitized_user_message = strip_pii_from_text(user_message)

    if graph is not None:
        app = graph
    elif checkpointer is not None:
        app = build_tico_chat_graph(checkpointer=checkpointer)
    else:
        app = _default_tico_chat_graph

    initial_state: dict[str, Any] = {
        "messages": [HumanMessage(content=sanitized_user_message)],
        "user_message": sanitized_user_message,
        "locale": locale,
        "page": page,
        "analysis_summary": analysis_summary,
        "stream": stream,
        "world_title": world_title,
        "mission_title": mission_title,
        "target_concept": target_concept,
        "solution_identifiers": solution_identifiers,
        "target_values": target_values,
        "retry_count": 0,
        "leak_feedback": None,
        "has_error": False,
    }

    config = {"configurable": {"thread_id": session_id}}
    result = app.invoke(initial_state, config=config)

    return TicoChatResult(
        response=result.get("final_response", ""),
        is_blocked=result.get("is_blocked", False),
        moderation_verdict=result.get("moderation_verdict"),
        requires_human_escalation=result.get("requires_human_escalation", False),
        is_model_generated=result.get("is_model_generated", False),
        model_name=result.get("model_name"),
        offered_hint_rung=result.get("offered_hint_rung"),
        messages=result.get("messages"),
    )
