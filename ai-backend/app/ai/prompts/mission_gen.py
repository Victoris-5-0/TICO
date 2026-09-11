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

PROMPT_VERSION = "mission_gen/v3-remix-keeps-fixed-numbers"


SYSTEM = """أنت مصمم رحلات تعليمية لأطفال مصريين من 10 لـ 17 سنة بيتعلموا بايثون.

You design ONE mission at a time, and a mission is SIX PHASES over a single scenario —
not six exercises. The same bakery, the same station, the same junction, the whole way
through. What changes is how much help the student gets.

  1 ENCOUNTER   an NPC states a real problem. No code exists yet.
  2 EXPLORE     TICO asks 2 questions about the scene. Buttons only, still no code.
  3 DISCOVER    the concept behind what they just did, at the depth the task asks
                for — a concept is introduced ONCE and built on after that, and the
                task says which of the three this is. Credit, not a lecture.
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

{speaker_note}TICO guides throughout, in every phase. This is only about who raises the
problem in phase 1.

SPRITES the client can draw (props you may show):
{sprites}

ANIMATIONS the client can play — you may ONLY name one of these:
{animations}
{simulation}
{repetition_note}
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
    "explanation_ar": "{discover_slot}",
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



def _simulation_block(world: World) -> str:
    """The numbers the scene has already committed to, and the buttons that exist.

    Phrased as facts rather than as a menu, because that is what they are. The rest of
    this prompt offers the model choices; these are true on screen before the mission is
    written, and a mission that disagrees is wrong in a way no test can see — the Python
    runs, the tests pass, the validator is satisfied, and a child is taught that a tray
    holds twelve loaves while watching eight land on it.
    """
    sim = world.simulation
    if sim is None:
        return ""

    lines = [
        "",
        "FIXED NUMBERS — the scene already draws these. Your mission MUST agree with them.",
        "Use these exact values; never invent a different one for the same thing:",
    ]
    lines += [f"  {name} = {value}" for name, value in sim.quantities.items()]

    # The remix phase is where this instruction actually gets overridden. Told to change
    # the world, a model reaches for the nearest number and writes "Hassan brought bigger
    # trays that hold 12" — obeying phase 6 at the cost of the fixed values above. Naming
    # the conflict here, next to the numbers, is what stops it; `_check_arithmetic`
    # catches it afterwards either way.
    lines += [
        "",
        "THE PHASE 6 TWIST MAY NOT CHANGE ANY NUMBER ABOVE. Bigger trays, a longer queue "
        "or a different batch size are exactly the twists you may not write — the scene "
        "cannot draw them, so the child would read one number and watch another. Twist "
        "something else: a new requirement, an extra rule, a second thing to count. Any "
        "quantity you invent needs its own name.",
    ]

    if sim.rules:
        lines.append("")
        lines.append("RULES the scene enforces:")
        lines += [f"  - {rule}" for rule in sim.rules]

    if sim.controls:
        lines.append("")
        lines.append(
            "BUTTONS the player has. Do not ask them to do anything else — there is no "
            "other control on screen:"
        )
        lines += [f"  {c.id} ({c.label_ar}) — {c.effect}" for c in sim.controls]

    return "\n".join(lines) + "\n"


#: What phase 3 is for, on each of a concept's three stops. A concept is taught once and
#: then used; a definition repeated three times is three missions that go nowhere.
_ANGLE = {
    1: "This is the student's FIRST mission on this concept. Phase 3 introduces it: what "
       "it is, in one plain image they can hold on to.",
    2: "The student has already met this concept and been given the definition. **Do not "
       "define it again.** Phase 3 this time is about USING it: why the name matters, what "
       "changes when the value changes, what it saves you from writing.",
    3: "This is the student's THIRD mission on this concept. They know what it is and they "
       "have used it. **Do not define it again.** Phase 3 this time is about the limit or "
       "the pitfall: what goes wrong without it, or where a beginner gets it subtly wrong.",
}

#: What goes in the `explanation_ar` slot itself. The paragraph above was ignored three
#: times running because the slot's own hint said "explain the concept", and a hint sitting
#: in the field beats an instruction forty lines earlier.
_DISCOVER_SLOT = {
    1: "٣ سطور بالكتير. عرّف المفهوم بصورة بسيطة. من غير أي كود",
    2: "٣ سطور بالكتير. الطالب **خد التعريف قبل كده** — ممنوع تعيده. "
       "اتكلم عن الاستخدام: ليه الاسم مهم، وإيه اللي بيتغير لما القيمة تتغير. من غير أي كود",
    3: "٣ سطور بالكتير. الطالب عارف التعريف وجربه — **ممنوع تعيد التعريف**. "
       "اتكلم عن الغلطة الشائعة أو الحد: إيه اللي بيحصل من غيره. من غير أي كود",
}



def _repetition_note(concept: str, repetition: int, already_taught: list[str]) -> str:
    """Tell the model which stop of the concept this is, and what has already been said.

    Without this every mission on a concept opened by explaining the concept. Three
    missions on `variables` produced three rewordings of "a variable is like a box" — a
    child is taught the same sentence three times and never reaches the point.
    """
    if repetition <= 1 and not already_taught:
        return ""

    lines = ["", f"WHICH TIME THIS IS — mission {repetition} of 3 on `{concept}`."]
    lines.append(_ANGLE.get(min(repetition, 3), _ANGLE[3]))

    if already_taught:
        lines.append("")
        lines.append("Phase 3 has ALREADY said this to them. Say something else:")
        lines += [f'  - "{t.strip()[:200]}"' for t in already_taught[-3:]]

    lines.append("")
    lines.append(
        "Phases 1, 2, 4, 5 and 6 are a fresh scenario as usual — a different customer, a "
        "different order, different numbers. Only phase 3 has to move on."
    )
    return "\n".join(lines) + "\n"



def _speaker_note(world: World, speaker: str | None) -> str:
    """Name the speaker, or leave the model to choose.

    Asking for variety did not produce it: seven missions out of seven opened with Hassan
    before the customers had descriptions of their own, and three out of three opened with
    Mariam after they did. A model has no memory of the last mission, so "vary this" is not
    something it can act on. The server remembers, so the server picks.
    """
    if not speaker:
        return ""

    who = next((c for c in world.characters if c.id == speaker), None)
    line = f"  {speaker}"
    if who is not None:
        line += f" ({who.name_ar or ''}) — {who.description or ''}"

    return (
        "PHASE 1 IS SPOKEN BY THIS CHARACTER. Not another one:\n"
        f"{line}\n"
        "Write the encounter in their voice, about something they would actually notice.\n\n"
    )


def build(
    world: World,
    *,
    target_concept: str,
    carried_concepts: list[str],
    scene_id: str,
    scaffold: dict[str, str] | None = None,
    repetition: int = 1,
    already_taught: list[str] | None = None,
    speaker: str | None = None,
) -> tuple[str, str]:
    """Return `(system, task)` for one generation attempt.

    `repetition` is which of the concept's three stops this is, and `already_taught` the
    phase-3 explanations the student has already been given. Both exist so phase 3 stops
    re-teaching a concept the child already met — see `_repetition_note`.
    """
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
        simulation=_simulation_block(world),
        repetition_note=_repetition_note(target_concept, repetition, already_taught or []),
        discover_slot=_DISCOVER_SLOT.get(min(max(repetition, 1), 3), _DISCOVER_SLOT[3]),
        speaker_note=_speaker_note(world, speaker),
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
