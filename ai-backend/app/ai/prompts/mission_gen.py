"""Mission generation prompt template (M5 — P0).

Directs gemini-3.5-flash to compose a scenario selected from a closed world manifest,
adhering to composer scaffolding, difficulty, and valid manifest verbs.
"""

from __future__ import annotations

import json
from typing import Any, Final

MISSION_GEN_PROMPT_VERSION: Final[str] = "1.0.0"

_BASE_SYSTEM_PROMPT = """\
You are an expert educational game designer for Code Egypt (TICO).
Your mission is to compose a tailored Python coding mission scenario by SELECTION from a closed world manifest.

CRITICAL CONSTRAINTS:
1. Manifest Grounding: You may ONLY use scenes, props, and verbs declared in the world manifest.
   NEVER invent new prop methods or attributes. Inventing non-existent APIs will fail validation.
2. Target Concept: The mission MUST focus on the target concept.
3. Carried Scaffolding: Apply the composer's scaffold plan to any carried concepts.
4. Solution Executability: The solution code MUST be completely valid Python that executes successfully
   and passes all defined tests against the declared prop APIs.
5. Voice: The brief must be in TICO's warm, engaging Egyptian Arabic voice (or friendly English if requested).
"""


def get_mission_gen_system_prompt(
    *,
    world_manifest: dict[str, Any],
    mechanic: dict[str, Any],
    locale: str = "ar_EG",
) -> str:
    """Generate the system prompt for mission generation.

    Includes the closed inventory of scenes, props, and legal verbs.
    """
    scenes_summary = [
        f"- {s['id']}: {s.get('description_en', '')} (supports: {s.get('supports', [])})"
        for s in world_manifest.get("scenes", [])
    ]
    props_summary = []
    for p in world_manifest.get("props", []):
        verbs = p.get("verbs", [])
        reads = p.get("reads", [])
        props_summary.append(f"- {p['id']}: verbs={verbs}, reads={reads}")

    lines = [
        _BASE_SYSTEM_PROMPT,
        f"World: {world_manifest.get('world', {}).get('name_en')} ({world_manifest.get('world', {}).get('id')})",
        f"Target Concept: {mechanic.get('target_concept')}",
        f"Goal: {mechanic.get('goal_shape', '').strip()}",
        f"Mechanic ID: {mechanic.get('id')}",
        "\nAllowed Scenes:",
        "\n".join(scenes_summary),
        "\nAllowed Props & APIs:",
        "\n".join(props_summary),
        f"\nParameter Schema:\n{json.dumps(mechanic.get('param_schema', {}), indent=2)}",
    ]

    if locale.lower().startswith("en"):
        lines.append("\nNote: Generate the student brief in English.")
    else:
        lines.append("\nNote: Generate the student brief in Egyptian Arabic (TICO voice).")

    return "\n\n".join(lines)
