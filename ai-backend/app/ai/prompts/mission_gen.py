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
from pathlib import Path
from types import SimpleNamespace

from app.manifests.models import World

PROMPT_VERSION = "mission_gen/v6-traffic-pedestrian-loop"


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

QUALITY BAR — this is a playable lesson, not a worksheet:
- The narration is one causal story. Each phase must refer to the same concrete problem,
  people and quantities introduced in phase 1.
- A scene click must visibly change the scene and lead to the next line. Never ask for a
  click that only dismisses text.
- Phase 4, both guided steps, and phase 6 each produce a visible consequence in the world.
- Guided coding has EXACTLY TWO steps. Step 1 asks for one small completion; step 2 asks
  for a larger completion. Both are meaningful and both run.
- Explain for a child with zero coding experience. Name the kind of thing first — for
  example "متغير اسمه waiting_cars" — before using the identifier by itself.
- A conditionals mission contains a real Python `if`. A loops mission contains a real
  `for` or `while`. Do not teach a concept using only a comparison or a calculation.

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

{interaction_block}

AUTHORITATIVE MECHANIC — selected by the server from the learner's current stop and
mastery history. Do not rename it or replace it with another exercise:
  id: {mechanic_id}
  difficulty: {difficulty_band}/10
  learning goal: {mechanic_goal}
  function signature: {mechanic_signature}

The finished code for phases 4 and 5 is fixed by that mechanic. Copy it EXACTLY into
`understand.code` and `guided.solution_code`, then make the two guided steps by replacing
meaningful pieces with `___`:
---
{mechanic_solution}
---
{remix_contract}

SPRITES the client can draw (props you may show):
{sprites}

ANIMATIONS the client can play — you may ONLY name one of these:
{animations}
{simulation}{actions_block}
{code_consequence_block}
{repetition_note}
{scaffold_note}

Return exactly this JSON:

{{
  "title_ar": "اسم قصير للمهمة",

  "encounter": {{
    "speaker": "<character id from the list above>",
    "speaker_name_ar": "الاسم بالعربي",
    "line_ar": "جملة أو اتنين بالعامية: إيه المشكلة وليه محتاجينها تتحل",
    "world": {{
      "props": {{ "<sprite>": <count or state> }},
      "interactions": [{{
        "target": "<interactive target>",
        "prompt_ar": "اضغط على ... عشان ...",
        "on_press": {{
          "props": {{ "<sprite>": <new state> }},
          "caption_ar": "نتيجة واضحة للضغطة",
          "steps": [
            {{ "animate": "<animation>", "props": {{}}, "speaker_name_ar": "...", "line_ar": "..." }},
            {{ "animate": "<animation>", "props": {{}}, "speaker_name_ar": "...", "line_ar": "..." }}
          ]
        }}
      }}]
    }}
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
    "code": "<copy the authoritative finished code exactly>",
    "annotations": [{{ "line": 1, "text_ar": "السطر ده بيعمل كذا", "points_at": "<sprite>" }}],
    "on_run": {{ "animate": "<animation>", "props": {{ "<sprite>": "<after>" }},
              "actions": [{{ "do": "<action>", "target": "<target>", "from_variable": "<name or null>" }}],
              "caption_ar": "...", "steps": [{{ "animate": "<animation>", "props": {{}}, "line_ar": "..." }}] }}
  }},

  "guided": {{
    "steps": [
      {{ "code": "نفس الكود بس فيه ___", "blanks": ["الإجابة"], "prompt_ar": "املا جزء صغير", "hint_ar": "...", "on_run": {{ "animate": "<animation>", "props": {{}}, "caption_ar": "أثر الخطوة الأولى" }} }},
      {{ "code": "نفس الكود بس بجزئين ___ و ___", "blanks": ["الإجابة الأولى", "الإجابة الثانية"], "prompt_ar": "كمّل الجزئين", "hint_ar": "...", "on_run": {{ "animate": "<animation>", "props": {{}}, "caption_ar": "أثر الكود المكتمل" }} }}
    ],
    "solution_code": "<copy the authoritative finished code exactly>",
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


TRAFFIC_SYSTEM = """You write ONE six-phase interactive traffic lesson in Egyptian Arabic
for a child new to Python. Return valid JSON only. Keep one continuous story with Karim.
The server owns the algorithm, tests, and difficulty. Never change or invent those.
Two scene clicks change the visible world before two no-code reasoning questions.
First ask whether another variable per car or one repeated action solves the queue.
Only AFTER that explain loops. Phase 4 demonstrates a list and `for` with top-level code.
Guided has EXACTLY TWO steps: first fill the list, then complete the loop. Never put a
`def`, function call or `return` in this first loops lesson; functions are taught later.
Never use `if` to solve this first loop problem. Explain every code line in child-friendly
Egyptian Arabic: name what a list, variable, `for`, and one loop turn mean before using
an identifier alone. Each code run changes the traffic scene. Remix extends the list to
five cars, not a different rule. No unimplemented props, invented cars or lectures.
Keep every sentence short; JSON must be syntactically valid and complete."""


TRAFFIC_TASK = """Write only short Egyptian-Arabic narrative dressing for a REVIEWED
first loops mission. The server already owns every clickable action, animation, code line,
test, hint and scene transition. Do not output phases, code or world props.
Karim is the traffic officer. Three cars (taxi, minibus, tuktuk) arrive in order, stop at
red, then a `for` loop lets each car pass. Afterward two more cars join, and the same loop
handles five. The child already learned variables but has never learned loops or functions.
In the FIRST question, explicitly ask whether a variable for EACH car or REPEATING one
action solves the queue. Do not define loops until the discover line. Never mention
functions, `def`, `return`, `if`, an ambulance, broken cars or a different queue size.
Name the list `cars`, the counter `released_count`, and explain `for` slowly.

AUTHORED EL FORN MISSION (all six phases) as a reference for warm tone and learning
progression ONLY. Do not copy its bakery characters, setting, or code:
{authored_reference}

Return exactly one compact JSON object with these string keys and no others:
title_ar, encounter_line_ar, explore_intro_ar, explore_first_question_ar,
discover_explanation_ar, remix_twist_ar. Keep each value one or two short sentences.
Complete the JSON."""


PEDESTRIAN_SYSTEM = """Write short Egyptian-Arabic story lines for a beginner's traffic
mission. Karim is kind and practical. The child has learned variables but not loops.
First the child sees the red signal and Karim stop the cars; then two pedestrians need
to cross. The new code uses a `people` list and a top-level `for` loop to count each
safe crossing. Never introduce functions, `def`, `return`, or `if`. The server owns the
two clicks, questions, code, tests, and scene animations. Return valid JSON only."""


PEDESTRIAN_TASK = """Write only short Egyptian-Arabic narrative dressing for a reviewed
mission about Ali and Nadia crossing safely after Karim stops traffic. Later Mona and
Naser join them, so the learner changes only the people list from two names to four.
Do not output phases, code, or world props. Do not turn the task into releasing cars.
Use the authored El Forn mission below only as a reference for warm tone and the
progression from real problem to reasoning, explanation, guided code, and remix.
Do not copy its setting, characters, choices, or code:
{authored_reference}

Return exactly one compact JSON object with these string keys and no others:
title_ar, encounter_line_ar, explore_intro_ar, explore_first_question_ar,
discover_explanation_ar, remix_twist_ar. Each value should be one or two sentences."""


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


def _interactive_block(world: World) -> str:
    """Describe only hit targets the current renderer really wires to a click.

    A sprite list is not enough: drawable scenery can still have no pointer or keyboard
    handler. Keeping this as a separate manifest fence prevents a generated instruction
    from highlighting a convincing-looking object that does nothing.
    """
    targets = world.visual.interactive_targets
    if not targets:
        return (
            "CLICKABLE SCENE TARGETS — this renderer has none. Return "
            "`interactions: []`; do not pretend the background can be pressed."
        )
    return (
        "CLICKABLE SCENE TARGETS — use EXACTLY TWO interactions, with different targets from this list:\n  "
        + ", ".join(targets)
        + "\nUse the targets in that exact order. Each click must play 2–4 ordered beats "
          "with narration and a visible state change. "
          "The second interaction continues from the first; it may not reset the scene."
    )


def _remix_contract(mechanic, blueprint) -> str:
    remix_solution = getattr(blueprint, "remix_solution_code", "")
    if not remix_solution:
        return (
            "PHASE 6 CONTRACT — invent a small twist that keeps the same function and "
            "target concept. The earlier code must fail the new tests."
        )
    return (
        "PHASE 6 CONTRACT — the algorithm is authored too. Narrate this exact world "
        "change; do not substitute a different rule:\n"
        f"  {(' '.join((getattr(mechanic, 'remix_goal', '') or '').split()))}\n\n"
        "Copy this EXACTLY into `remix.solution_code`:\n---\n"
        f"{remix_solution}\n---\n"
        "Set `remix.starting_code` to the phase-5 code. Write the twist and visible scene "
        "changes around this contract."
    )


def _code_consequence_block(world: World, blueprint) -> str:
    if (world.id != "isharet_cairo" or getattr(blueprint, "mechanic_id", None) != "release_each_car"
            or not getattr(blueprint, "tests", None)):
        return ""
    return (
        "TRAFFIC SCENE FACTS — first three vehicles: taxi, minibus, tuktuk. Remix "
        "adds taxi and minibus behind them. Only `signal` (off/red/amber/green), `waiting_cars` "
        "(0..5), `cars_visible` (0..5), `cars_passed` (0..5), "
        "`waiting_pedestrians` (0..4), `pedestrians_crossed` (0..4), "
        "`timer_seconds` (0..5), and `timer_for` (signal/cars/pedestrians) affect "
        "the picture. Never claim an ambulance appears: there is no ambulance asset. Click signal "
        "FIRST: countdown and turn it RED to stop cars; click officer SECOND: cars "
        "arrive one by one at the line, still red. Cars do not cross until code runs. "
        "In remix all five cars pass with the same loop. Speak kindly "
        "about every driver and child, without insults.\n"
        "TRAFFIC CODE CONSEQUENCE — the client's runner stores values by the EXACT test "
        "call, not by variable name or `return`. Never use `= return`. "
        "Phase 4 understand.on_run.props.cars_passed = 3 (read-only Run does not execute Python). "
        "Guided step 1 tests only len(cars); set on_run.props.cars_visible to the exact "
        "string `= len(cars)` and animate `cars_arrive`. Guided step 2 and guided.on_run "
        "bind cars_passed to `= released_count`. Remix binds cars_passed to "
        "`= released_count`, derived from its own five-car code run. "
        "The client will replace these strings with the real result of the learner's "
        "code. Code-driven runs must not have a `steps` beat overriding cars_passed with "
        "a fixed value.\n"
    )


def _authored_reference() -> str:
    path = Path(__file__).resolve().parents[3] / "content" / "prebuilt" / "variables-1-cmtwklihyqt4p01z00z8ue6zx.json"
    phases = json.loads(path.read_text(encoding="utf-8"))["data"]["phases"]
    return json.dumps(phases, ensure_ascii=False, separators=(",", ":"))



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
    if who is None:
        return ""
    line = f"  {speaker}"
    line += f" ({who.name_ar or ''}) — {who.description or ''}"

    return (
        "PHASE 1 IS SPOKEN BY THIS CHARACTER. Not another one:\n"
        f"{line}\n"
        "Write the encounter in their voice, about something they would actually notice.\n\n"
    )



def _actions_block(world: World) -> str:
    """The verbs a mission may use, and what each may be aimed at.

    Spelled out with targets, because the failure worth preventing is not an invented verb
    — the validator catches that — but a real verb aimed at something it does not accept.
    That reads as a near miss and costs a retry.
    """
    if not world.visual.actions:
        return ""

    lines = ["", "ACTIONS — what you may DO to the world. Each `on_run` may carry up to 3:"]
    for a in world.visual.actions:
        lines.append(f"  {a.id} — {' '.join((a.description or '').split())}")
        if a.targets:
            lines.append(f"      aim it at: {', '.join(a.targets)}")
        if a.from_code:
            lines.append(
                "      its value comes from the STUDENT'S CODE: give `from_variable` "
                "(a variable name, or the word return), and no `value`."
            )
    lines.append("")
    lines.append(
        "Use them. A mission that only sets counts is a picture; one that puts bread in "
        "Amina's hands, writes on the sign, or ties a variable to what is drawn is a world "
        "that answers the student. Prefer `bind` in a variables mission, and `face` "
        "wherever the student can be wrong."
    )
    return "\n".join(lines) + "\n"


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
    mechanic=None,
    blueprint=None,
) -> tuple[str, str]:
    """Return `(system, task)` for one generation attempt.

    `repetition` is which of the concept's three stops this is, and `already_taught` the
    phase-3 explanations the student has already been given. Both exist so phase 3 stops
    re-teaching a concept the child already met — see `_repetition_note`.
    """
    scene = world.scene(scene_id)
    scaffold = scaffold or {}

    # The mechanic is authored and the concrete code is composed in Python. The model
    # writes the story around this contract; it no longer invents the learning task.
    if mechanic is None:
        choices = world.mechanics_for(target_concept)
        if not choices:
            # Prompt-inspection tests build against concepts a world does not teach. Live
            # generation rejects this earlier in `mission_gen.generate`; this neutral
            # contract keeps the prompt helpers independently inspectable.
            mechanic = SimpleNamespace(
                id="no-mechanic",
                difficulty_band=1,
                goal_shape="Prompt inspection only.",
            )
            blueprint = SimpleNamespace(
                signature="example() -> int",
                solution_code="def example() -> int:\n    return 0",
                problems=[],
            )
        else:
            mechanic = choices[min(max(repetition, 1) - 1, len(choices) - 1)]
    if blueprint is None:
        from app.rules import mission_builder

        blueprint = mission_builder.compose(world, mechanic, scaffold=scaffold, seed=repetition)
    if blueprint.problems:
        raise ValueError("mechanic could not be composed: " + "; ".join(blueprint.problems))

    scaffold_note = ""
    full = [c for c, level in scaffold.items() if level == "FULL"]
    if full:
        scaffold_note = (
            f"SCAFFOLDING — this student is already strong on {', '.join(full)}. In "
            "phase 5, leave that part already written in the starter code so the blanks "
            "are about the target concept and not about something they know."
        )

    first_traffic_loop = world.id == "isharet_cairo" and mechanic.id == "release_each_car"
    pedestrian_loop = world.id == "isharet_cairo" and mechanic.id == "cross_each_pedestrian"
    template = PEDESTRIAN_TASK if pedestrian_loop else TRAFFIC_TASK if first_traffic_loop else TASK
    task = template.format(
        world_name=f"{world.world.name_ar} ({world.world.name_en})",
        premise=(world.world.premise_ar or "").strip(),
        scene=f"{scene.id} — {scene.description_ar or scene.description_en}" if scene else scene_id,
        target_concept=target_concept,
        carried=", ".join(carried_concepts) or "(nothing — this is their first concept)",
        vocabulary=_vocabulary_block(world),
        characters=_characters_block(world),
        interaction_block=_interactive_block(world),
        mechanic_id=mechanic.id,
        difficulty_band=mechanic.difficulty_band,
        mechanic_goal=" ".join(mechanic.goal_shape.split()),
        mechanic_signature=blueprint.signature,
        mechanic_solution=blueprint.solution_code,
        remix_contract=_remix_contract(mechanic, blueprint),
        sprites=_sprites_block(world),
        animations="  " + ", ".join(world.visual.animations),
        simulation=_simulation_block(world),
        actions_block=_actions_block(world),
        code_consequence_block=_code_consequence_block(world, blueprint),
        repetition_note=_repetition_note(target_concept, repetition, already_taught or []),
        discover_slot=_DISCOVER_SLOT.get(min(max(repetition, 1), 3), _DISCOVER_SLOT[3]),
        speaker_note=_speaker_note(world, speaker),
        scaffold_note=scaffold_note,
        repetition=repetition,
        authored_reference=_authored_reference() if first_traffic_loop or pedestrian_loop else "",
    )
    return (PEDESTRIAN_SYSTEM if pedestrian_loop else TRAFFIC_SYSTEM if first_traffic_loop else SYSTEM), task


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
