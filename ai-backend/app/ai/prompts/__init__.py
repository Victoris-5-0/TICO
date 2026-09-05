"""Versioned prompts for TICO AI capabilities.

Every prompt template has an explicit semantic version string (e.g., '1.0.0').
When a prompt template's wording or structure is updated, bump its version string.
This version string is recorded in `ai_interaction.prompt_version` on every model call.
"""

from __future__ import annotations

from app.ai.prompts.tico_persona import (
    TICO_BASE_PERSONA,
    TICO_PERSONA_VERSION,
    get_hint_prompt,
    get_tico_system_prompt,
)

__all__ = [
    "TICO_BASE_PERSONA",
    "TICO_PERSONA_VERSION",
    "get_tico_system_prompt",
    "get_hint_prompt",
]
