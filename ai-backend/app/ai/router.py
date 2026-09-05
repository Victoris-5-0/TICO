"""Model router for Google Gemini.

All model calls in the system MUST pass through here. No inline model IDs anywhere else.
Capability-to-model mapping is read from `app.config.settings` so routes can be changed
via environment variables without redeploying.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI

from app.config import settings


class AICapability(str, Enum):
    """The 6 AI capability routes supported by the backend."""

    HINT = "hint"
    NPC = "npc"
    CLASSIFY = "classify"
    REVIEW = "review"
    GENERATE = "generate"
    CHAT = "chat"


_CAPABILITY_ATTR_MAP: dict[AICapability, str] = {
    AICapability.HINT: "model_hint",
    AICapability.NPC: "model_npc",
    AICapability.CLASSIFY: "model_classify",
    AICapability.REVIEW: "model_review",
    AICapability.GENERATE: "model_generate",
    AICapability.CHAT: "model_chat",
}


def get_model_name(capability: AICapability | str) -> str:
    """Resolve the configured model name for a given capability."""
    if isinstance(capability, str) and not isinstance(capability, AICapability):
        try:
            capability = AICapability(capability.lower())
        except ValueError:
            raise ValueError(
                f"Unknown AI capability: '{capability}'. Expected one of: "
                f"{[c.value for c in AICapability]}"
            )

    attr_name = _CAPABILITY_ATTR_MAP[capability]
    model_name: str = getattr(settings, attr_name)
    return model_name


def get_model(
    capability: AICapability | str,
    *,
    temperature: float | None = None,
    streaming: bool | None = None,
    max_retries: int = 2,
    timeout: float = 30.0,
    **kwargs: Any,
) -> ChatGoogleGenerativeAI:
    """Factory for ChatGoogleGenerativeAI based on capability routing.

    Args:
        capability: The functional AI route (e.g. AICapability.HINT).
        temperature: Sampling temperature. Defaults to 0.2 for deterministic/structured tasks,
                     0.7 for conversational/creative tasks (CHAT, NPC).
        streaming: Whether to stream tokens. If None, defaults to True for CHAT, False otherwise.
        max_retries: Number of retries on network/rate limit hiccups.
        timeout: Timeout in seconds for the model call.
        **kwargs: Extra parameters forwarded to ChatGoogleGenerativeAI.

    Returns:
        Configured ChatGoogleGenerativeAI instance.
    """
    model_name = get_model_name(capability)

    # Sensible defaults by capability when not explicitly specified
    if temperature is None:
        if capability in (AICapability.CHAT, AICapability.NPC):
            temperature = 0.7
        else:
            temperature = 0.2

    if streaming is None:
        streaming = capability in (AICapability.CHAT,)

    # Fallback key is strictly forbidden in production
    if settings.is_production:
        api_key = settings.google_api_key
    else:
        api_key = settings.google_api_key or "fake-key-for-dev-mock"

    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=temperature,
        streaming=streaming,
        max_retries=max_retries,
        timeout=timeout,
        **kwargs,
    )
