"""The prompt that asks Gemini to invent a whole six-phase mission.

The model is the star: it invents the scenario, the questions, the code and the twist.
What it may not invent is the *world* — the vocabulary, the sprites, the animations and
the target concept are fences, and the validator checks them afterwards rather than
trusting this prompt to have been persuasive.

## The two things never taken on trust

**Expected outputs.** The model writes test *inputs*; Python runs the solution to get the
outputs. Asked for both, a model will now and then produce `calculate(4, 12) -> 46`, and
the child fails a test that was wrong before they typed a character.

**"It's correct."** `validated` comes from running the code, not from the model saying so.

## Versioning

`PROMPT_VERSION` is written to `ai_interactions.prompt_version` on every call. When
generation quality moves, that column is how you find out which wording moved it.
"""

from __future__ import annotations

import json

from app.manifests.models import World

PROMPT_VERSION = "mission_gen/v2-phases"


SYSTEM = """أنت مصمم رحلات تعليمية لأطفال مصريين من 10 لـ 17 سنة بيتعلموا بايثون.

You design ONE mission at a time, and a mission is SIX PHASES over a single scenario —
not six exercises. The same bakery, the same station, the same junction, the whole way
through. What changes is how much help the student gets.

  1 ENCOUNTER   an NPC states a real problem. No code exists yet.
  2 EXPLORE     TICO asks 2 questions about the scene. Buttons only, still no code.
  3 DISCOVER    name the concept they just used. Credit, not a lecture.
  4 UNDERSTAND  show the FINISHED code. They run it and watch the world work.
  5 GUIDED      the SAME code with blanks. They fill them in.
  6 REMIX       the world changes and their code is now wrong. They adapt it.

HARD RULES — output breaking any of these is discarded and regenerated:

1. ONE Python function. No classes, no imports, no input(), no print as the answer.
   The function RETURNS its result.
2. Use ONLY the vocabulary, sprites and animations you are given. Do not invent objects,
   places, quantities or motions that are not in the lists.
3. Phases 4, 5 and 6 are the SAME function evolving. Phase 5's code is phase 4's code
   with parts removed. Phase 6's starting code is phase 5's finished code.
4. Blanks are marked `___` (three underscores). Give the answers separately, in order.
5. The exercise must be solvable by a child who has just met the concept. Aim lower
   than feels right to you.
6. All prose in Egyptian Arabic (عامية مصرية). All code identifiers in English.
7. Phase 2 has NO code and NO Python words. It is about the situation only.
8. Return ONLY a JSON object. No markdown fences, no commentary.

You are NOT asked for expected outputs. Python runs your solution to find those."""


TASK = """اعمل مهمة كاملة من ٦ مراحل.

WORLD: {world_name}
{premise}

SCENE: {scene}

TARGET CONCEPT — what these six phases must teach:
  {target_concept}

ALREADY KNOWN — usable, but not the point:
  {carried}

VOCABULARY — the ONLY nouns you may use, with plausible values so numbers feel real:
{vocabulary}

CHARACTERS who may speak in phase 1:
{characters}

SPRITES the client can draw (props you may show):
{sprites}

ANIMATIONS the client can play — you may ONLY name one of these:
{animations}

{scaffold_note}

Return exactly this JSON:

{{
  "title_ar": "اسم قصير للمهمة",

  "encounter": {{
    "speaker": "<character id from the list above>",
    "speaker_name_ar": "الاسم بالعربي",
    "line_ar": "جملة أو اتنين بالعامية: إيه المشكلة وليه محتاجينها تتحل",
    "world": {{ "props": {{ "<sprite>": <count or state> }} }}
  }},

  "explore": {{
    "tico_intro_ar": "تيكو بيفتح الكلام، فضولي مش بيمتحن",
    "rounds": [{{
      "question_ar": "سؤال عن المشهد، مفيهوش أي كلمة برمجة",
      "options_ar": ["اختيار", "اختيار", "اختيار"],
      "correct_index": 0,
      "nudge_ar": "لو غلط: سؤال أضيق، مش تصحيح",
      "highlight": ["<sprite to light up>"]
    }}]
  }},

  "discover": {{
    "concept_name_ar": "اسم المفهوم بالعربي",
    "explanation_ar": "٣ سطور بالكتير. من غير أي كود",
    "tico_line_ar": "برافو! ..."
  }},

  "understand": {{
    "intro_ar": "كده بالظبط بنكتبها في بايثون",
    "code": "def name(a: int) -> int:\\n    return ...",
    "annotations": [{{ "line": 1, "text_ar": "السطر ده بيعمل كذا", "points_at": "<sprite>" }}],
    "on_run": {{ "animate": "<animation>", "props": {{ "<sprite>": "<after>" }}, "caption_ar": "..." }}
  }},

  "guided": {{
    "steps": [
      {{ "code": "نفس الكود بس فيه ___", "blanks": ["الإجابة"], "prompt_ar": "املا الفراغ", "hint_ar": "..." }},
      {{ "code": "نفس الكود بفراغ أكبر", "blanks": ["الإجابة"], "prompt_ar": "..." }}
    ],
    "solution_code": "الكود كامل وشغال",
    "test_inputs": ["name(5)", "name(0)", "name(40)"],
    "on_run": {{ "animate": "<animation>", "props": {{ }}, "caption_ar": "..." }}
  }},

  "remix": {{
    "twist_ar": "حاجة حصلت في الدنيا — جملة قصيرة",
    "new_requirement_ar": "المطلوب الجديد",
    "world_change": {{ "animate": "<animation>", "props": {{ "<sprite>": "<new state>" }} }},
    "solution_code": "الكود بعد التعديل",
    "test_inputs": ["name(5)", "name(0)"],
    "on_run": {{ "animate": "<animation>", "props": {{ }} }}
  }}
}}"""


RETRY = """Your previous attempt was rejected. Reasons:

{failures}

Fix exactly those and return the corrected JSON. Keep everything not mentioned. Same
format, no commentary."""


def _vocabulary_block(world: World) -> str:
    lines = []
    for name, entry in world.vocabulary.items():
        detail = f"  {name} ({entry.type}) — {entry.en} / {entry.ar}"
        if entry.plausible_range:
            detail += f", typically {entry.plausible_range[0]}–{entry.plausible_range[1]}"
        if entry.options:
            # Quoted so the model copies them exactly. Arabic strings are compared
            # literally by the runner, and a missing hamza fails a test invisibly.
            detail += f", one of: {', '.join(repr(o) for o in entry.options)}"
        lines.append(detail)
    return "\n".join(lines)


def _sprites_block(world: World) -> str:
    lines = []
    for name, spec in world.visual.sprites.items():
        bits = []
        if spec.countable:
            bits.append(f"countable up to {spec.max_shown or 8}")
        if spec.states:
            bits.append("states: " + ", ".join(spec.states))
        if spec.overlay:
            bits.append("drawn as an overlay")
        lines.append(f"  {name}" + (f" — {'; '.join(bits)}" if bits else ""))
    return "\n".join(lines) or "  (none)"


def _characters_block(world: World) -> str:
    rows = [
        f"  {c.id} ({c.name_ar or c.id}) — {c.description or c.role}"
        for c in world.characters
        if c.role != "mentor"
    ]
    if not rows:
        # Two of the three worlds have no NPC art, so TICO delivers the line himself.
        return "  tico (تيكو) — the coach. This world has no other characters, so TICO speaks."
    return "\n".join(rows)


def build(
    world: World,
    *,
    target_concept: str,
    carried_concepts: list[str],
    scene_id: str,
    scaffold: dict[str, str] | None = None,
) -> tuple[str, str]:
    """Return `(system, task)` for one generation attempt."""
    scene = world.scene(scene_id)
    scaffold = scaffold or {}

    scaffold_note = ""
    full = [c for c, level in scaffold.items() if level == "FULL"]
    if full:
        scaffold_note = (
            f"SCAFFOLDING — this student is already strong on {', '.join(full)}. In "
            "phase 5, leave that part already written in the starter code so the blanks "
            "are about the target concept and not about something they know."
        )

    task = TASK.format(
        world_name=f"{world.world.name_ar} ({world.world.name_en})",
        premise=(world.world.premise_ar or "").strip(),
        scene=f"{scene.id} — {scene.description_ar or scene.description_en}" if scene else scene_id,
        target_concept=target_concept,
        carried=", ".join(carried_concepts) or "(nothing — this is their first concept)",
        vocabulary=_vocabulary_block(world),
        characters=_characters_block(world),
        sprites=_sprites_block(world),
        animations="  " + ", ".join(world.visual.animations),
        scaffold_note=scaffold_note,
    )
    return SYSTEM, task


def retry_prompt(failures: list[str]) -> str:
    """Feed the validator's actual complaints back, rather than saying 'try again'."""
    return RETRY.format(failures="\n".join(f"  - {f}" for f in failures))


def parse(raw: str) -> dict:
    """Pull the JSON object out of a reply.

    Tolerant of the two things models do despite being told not to: wrapping the object
    in ```json fences, and writing a sentence before it.
    """
    text = raw.strip()

    if "```" in text:
        for chunk in text.split("```"):
            candidate = chunk.strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            if candidate.startswith("{"):
                text = candidate
                break

    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in the reply")

    return json.loads(text[start : end + 1])
