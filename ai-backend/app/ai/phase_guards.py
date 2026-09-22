"""Validation for a six-phase mission. Nothing reaches a student without passing here.

Separate from `guards.py` because the checks are a different shape: a single mission is
validated on its own terms, while a six-phase mission is mostly about **relationships
between phases**.

    phase 5 must be phase 4's code with parts removed
    phase 6 must start from phase 5's finished code, and that code must now fail

A mission where those drift apart reads perfectly and is incoherent to play: the student
is shown one function and asked to complete a different one, or the world "changes" and
their code still works. Neither is catchable by looking at any phase alone.

Two rules, as everywhere else in this service:

* **A model never validates its own output.** `validated` is set from these results.
* **A failed check rejects the mission.** An unsolvable mission in front of a child who
  is already unsure is the worst thing the system can do.
"""

from __future__ import annotations

import ast

import re

from app.ai import sandbox
from app.ai.guards import ValidationReport
from app.manifests.models import World


def validate_phases(mission, world: World) -> ValidationReport:
    """Run every check across all six phases."""
    report = ValidationReport()
    p = mission.phases

    _encounter(p.encounter, world, report)
    _explore(p.explore, world, report)
    _discover(p.discover, mission.target_concept_id, report)
    _understand(p.understand, world, report)
    _guided(p.guided, p.understand, world, report)
    _remix(p.remix, p.guided, world, report)

    # Not about what is drawn, but about whether it is true.
    _check_arithmetic(mission, world, report)

    return report


def validate_generation_quality(mission, world: World, *, blueprint=None) -> ValidationReport:
    """The quality bar for a *new* model mission.

    `validate_phases` keeps old persisted missions replayable and proves that their code
    is legal. This stricter pass is called only while generating a new row. It rejects
    the failure modes that are valid JSON but poor gameplay: dead clicks, a one-question
    lesson, one-token coding, a silent Run button, or code that never uses the concept.
    """
    report = ValidationReport()
    report.checks_run.append("generated-mission-quality")
    p = mission.phases

    targets = set(world.visual.interactive_targets)
    interactions = p.encounter.world.interactions
    if targets:
        if len(interactions) != 2:
            report.fail(
                f"encounter: needs exactly 2 scene interactions; got {len(interactions)}"
            )
        for index, interaction in enumerate(interactions, 1):
            where = f"encounter interaction {index}"
            if interaction.target not in targets:
                report.fail(
                    f"{where}: '{interaction.target}' is not a clickable target "
                    f"(have: {sorted(targets)})"
                )
            expected_target = (
                world.visual.interactive_targets[index - 1]
                if index <= len(world.visual.interactive_targets) else None
            )
            if expected_target is not None and interaction.target != expected_target:
                report.fail(
                    f"{where}: expected '{expected_target}' here so the scene keeps its "
                    f"authored order, got '{interaction.target}'"
                )
            if "اضغط" not in interaction.prompt_ar:
                report.fail(f"{where}: prompt does not tell the learner to press the target")
            if len(interaction.on_press.steps) < 2:
                report.fail(f"{where}: needs at least 2 narrated visual beats")
            if not _has_visible_consequence(interaction.on_press):
                report.fail(f"{where}: clicking has no visible consequence")
            _check_change_deep(interaction.on_press, world, where, report)
    elif interactions:
        report.fail("encounter: this renderer has no clickable targets, but interactions were added")

    if len(p.explore.rounds) < 2:
        report.fail("explore: needs at least 2 reasoning rounds for a real learning arc")

    if len(p.guided.steps) != 2:
        report.fail(f"guided: needs exactly 2 coding steps; got {len(p.guided.steps)}")
    elif len(p.guided.steps[0].blanks) != 1 or len(p.guided.steps[1].blanks) < 2:
        report.fail(
            "guided: learning curve must grow from 1 blank in step 1 to at least 2 "
            "blanks in step 2"
        )

    code_changes = [
        ("understand.on_run", p.understand.on_run),
        ("guided.on_run", p.guided.on_run),
        ("remix.world_change", p.remix.world_change),
        ("remix.on_run", p.remix.on_run),
    ]
    for index, step in enumerate(p.guided.steps, 1):
        if step.on_run is None:
            report.fail(f"guided step {index}: running the step has no scene consequence")
        else:
            code_changes.append((f"guided step {index}.on_run", step.on_run))

    for where, change in code_changes:
        if not _has_visible_consequence(change):
            report.fail(f"{where}: code runs but the world does not visibly react")
        _check_change_deep(change, world, where, report)

    if world.id == "isharet_cairo" and getattr(blueprint, "mechanic_id", None) == "cross_each_pedestrian":
        first_question = p.explore.rounds[0].question_ar if p.explore.rounds else ""
        if "متغير" not in first_question or ("تكر" not in first_question and "نكرر" not in first_question):
            report.fail("explore: first ask whether variables or repetition solve the crossing")
        if interactions and not any(
            beat.animate == "signal_countdown" and beat.props.get("timer_seconds") == 5
            for beat in interactions[0].on_press.steps
        ):
            report.fail("encounter interaction 1: the signal countdown must last 5 seconds")
        for code in (p.understand.code, p.guided.solution_code, p.remix.solution_code):
            try:
                tree = ast.parse(code)
                if any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.If)) for node in ast.walk(tree)):
                    report.fail("first pedestrian loop: do not introduce functions or conditions")
            except SyntaxError:
                pass
        guided_calls = {test.call: test.expected for test in p.guided.tests}
        remix_calls = {test.call: test.expected for test in p.remix.tests}
        if guided_calls.get("len(people)") != "2" or guided_calls.get("crossed_count") != "2":
            report.fail("guided: count both initial pedestrians")
        if remix_calls.get("len(people)") != "4" or remix_calls.get("crossed_count") != "4":
            report.fail("remix: count all four pedestrians")
        if p.guided.steps and p.guided.steps[0].on_enter and p.guided.steps[0].on_enter.animate == "pedestrians_arrive":
            report.fail("guided: pedestrians must appear directly on the pavement")
        if p.remix.world_change.animate == "pedestrians_arrive":
            report.fail("remix: new pedestrians must appear directly on the pavement")
        for where, change in code_changes:
            if where == "remix.world_change":
                continue
            if where == "understand.on_run":
                if change.props.get("pedestrians_crossed") != 2:
                    report.fail("understand: show both crossings in the read-only example")
                continue
            if change.props.get("pedestrians_crossed") != "= crossed_count":
                report.fail(f"{where}: crossing count must come from the learner's code")
        if p.guided.steps:
            first = p.guided.steps[0]
            if "for person in ___:" not in first.code or first.tests is None or {test.call for test in first.tests} != {"crossed_count"}:
                report.fail("guided step 1: the learner must complete and run a for loop, not only a list")
            if first.on_run is None or not any(beat.animate == "pedestrians_cross" for beat in first.on_run.steps):
                report.fail("guided step 1: the loop must visibly cross pedestrians")
        for where, change in code_changes:
            if where != "remix.world_change" and any(beat.animate == "cars_arrive" for beat in change.steps):
                report.fail(f"{where}: do not replay car arrivals during code practice")
        if p.remix.world_change.props.get("waiting_pedestrians") != 4:
            report.fail("remix: the new people must be visible before running code")
        if not any(beat.animate == "pedestrians_cross" for beat in p.guided.on_run.steps):
            report.fail("guided: code must visibly move pedestrians across the road")

    if world.id == "isharet_cairo" and getattr(blueprint, "mechanic_id", None) == "release_each_car":
        for where, change in code_changes:
            if where not in ("guided step 1.on_run", "remix.world_change") and any(
                beat.animate == "cars_arrive" for beat in change.steps
            ):
                report.fail(f"{where}: car arrivals may only introduce a new queue")
        # This first loop stop must teach repetition using top-level code. Functions
        # belong to their later concept, and every visible count names real queue art.
        visible_props = {
            "signal", "waiting_cars", "cars_visible", "cars_passed",
            "waiting_pedestrians", "pedestrians_crossed", "timer_seconds", "timer_for",
            "car_move_from",
        }
        scenes = [("encounter.world", p.encounter.world.props)]
        for index, interaction in enumerate(interactions, 1):
            scenes.append((f"encounter interaction {index}", interaction.on_press.props))
            scenes.extend(
                (f"encounter interaction {index}.steps[{beat_number}]", beat.props)
                for beat_number, beat in enumerate(interaction.on_press.steps, 1)
            )
        for where, change in code_changes:
            scenes.append((where, change.props))
            scenes.extend(
                (f"{where}.steps[{beat_number}]", beat.props)
                for beat_number, beat in enumerate(change.steps, 1)
            )
        for where, props in scenes:
            for key in props.keys() - visible_props:
                report.fail(f"{where}: '{key}' is not a state the traffic renderer displays")

        for code in (p.understand.code, p.guided.solution_code, p.remix.solution_code):
            try:
                if any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) for node in ast.walk(ast.parse(code))):
                    report.fail("first traffic loop: functions belong to a later lesson")
            except SyntaxError:
                pass

        guided_calls = {test.call: test.expected for test in p.guided.tests}
        remix_calls = {test.call: test.expected for test in p.remix.tests}
        if guided_calls.get("len(cars)") != "3" or guided_calls.get("released_count") != "3":
            report.fail("guided: first loop must test the three-car list and its repeated count")
        if remix_calls.get("len(cars)") != "5" or remix_calls.get("released_count") != "5":
            report.fail("remix: the same loop must handle a five-car queue")
        if p.guided.steps:
            first = p.guided.steps[0]
            if first.tests is None or {test.call for test in first.tests} != {"len(cars)"}:
                report.fail("guided step 1: assess only the list before introducing the loop")
            if first.on_run is None or first.on_run.animate != "cars_arrive" or first.on_run.props.get("cars_visible") != "= len(cars)":
                report.fail("guided step 1: the list result must animate arriving cars")
            if first.on_enter is None or first.on_enter.props.get("cars_visible") != 0:
                report.fail("guided step 1: reset to an empty road before the new queue")
        if len(p.guided.steps) > 1:
            second = p.guided.steps[1]
            active = second.tests if second.tests is not None else p.guided.tests
            if "released_count" not in {test.call for test in active}:
                report.fail("guided step 2: run the loop and observe released_count")
        first_question = p.explore.rounds[0].question_ar if p.explore.rounds else ""
        if "متغير" not in first_question or "تكر" not in first_question:
            report.fail("explore: first ask whether variables or repetition solve the queue")
        for where, change in code_changes:
            if where == "remix.world_change":
                continue
            if where == "understand.on_run":
                if change.props.get("cars_passed") != 3:
                    report.fail(
                        f"{where}: read-only Run cannot evaluate Python; cars_passed "
                        "must be the derived three-car example value"
                    )
                continue
            if where == "guided step 1.on_run":
                continue
            expected_binding = "= released_count"
            if change is not None and change.props.get("cars_passed") != expected_binding:
                report.fail(
                    f"{where}: cars_passed must bind to '{expected_binding}' so the "
                    "client resolves the result of the learner's actual test call"
                )
            if change is not None and change.steps and change.steps[-1].props.get("cars_passed") != expected_binding:
                report.fail(f"{where}: the last animation beat overrides the Python result")

        for index, interaction in enumerate(interactions, 1):
            expected_animations = (
                {"signal_countdown", "signal_switch"}
                if index == 1 else {"car_arrive"}
            )
            actual = {beat.animate for beat in interaction.on_press.steps}
            if not expected_animations <= actual:
                report.fail(
                    f"encounter interaction {index}: expected visible traffic beats "
                    f"{sorted(expected_animations)}, got {sorted(str(a) for a in actual)}"
                )
            if interaction.on_press.props.get("signal") != "red":
                report.fail(f"encounter interaction {index}: cars must wait at a red signal")
        if interactions and not any(
            beat.animate == "signal_countdown" and beat.props.get("timer_seconds") == 5
            for beat in interactions[0].on_press.steps
        ):
            report.fail("encounter interaction 1: the signal countdown must last 5 seconds")
        if p.remix.world_change.props.get("cars_visible") != 5:
            report.fail("remix.world_change: the larger queue needs all 5 vehicles visible")
        if p.remix.on_run.props.get("cars_visible") != 5:
            report.fail("remix.on_run: the five-car queue must stay visible during release")
        if p.remix.world_change.animate != "cars_arrive" and len(p.remix.world_change.steps) < 5:
            report.fail("remix.world_change: the new queue must arrive, not appear instantly")

    if blueprint is not None:
        if _normalise(p.understand.code) != _normalise(blueprint.solution_code):
            report.fail("understand: changed the authored mechanic's finished code")
        if _normalise(p.guided.solution_code) != _normalise(blueprint.solution_code):
            report.fail("guided: changed the authored mechanic's finished code")
        if _normalise(p.remix.starting_code) != _normalise(blueprint.solution_code):
            report.fail("remix: does not start from the code the learner just completed")
        if mission.difficulty_band != blueprint.difficulty_band:
            report.fail("mission difficulty does not match the mastery-selected mechanic")
        authored_remix = getattr(blueprint, "remix_solution_code", "")
        if authored_remix and _normalise(p.remix.solution_code) != _normalise(authored_remix):
            report.fail("remix: changed the authored mechanic's adaptation code")

    _check_target_concept(p.guided.solution_code, mission.target_concept_id, report)
    _check_target_concept(p.remix.solution_code, mission.target_concept_id, report, where="remix")
    return report


# ------------------------------------------------------------------ shared checks


def _check_animation(change, world: World, where: str, report: ValidationReport) -> None:
    """An animation the client cannot play leaves a dead screen while the code looks fine.

    This is the failure nothing else would catch: the mission is correct, solvable, and
    renders as a still image.
    """
    if change and change.animate and not world.visual.can_animate(change.animate):
        report.fail(
            f"{where}: animation '{change.animate}' is not in the {world.id} manifest "
            f"(have: {world.visual.animations})"
        )
    _check_actions(change, world, where, report)



def _check_actions(change, world: World, where: str, report: ValidationReport) -> None:
    """An action the client cannot perform is a dead beat in the middle of a mission.

    Same failure as an unknown animation, one step worse: an animation that does not exist
    leaves the scene still, but an action that does not exist leaves the *story* broken —
    the mission says Amina is handed bread and she is not, and the next phase talks as
    though she was.

    Three things are checked, and the third is the one that matters:

      the verb exists in this world's manifest
      the target is one the verb accepts
      a `from_code` action names where its value comes from, and a fixed one does not

    That last check is what keeps `write` and `bind` honest. Their whole point is that the
    value comes from running the student's code; one with a hardcoded value is a mission
    pretending to react while showing a constant.
    """
    for action in getattr(change, "actions", None) or []:
        spec = world.visual.action(action.do)
        if spec is None:
            report.fail(
                f"{where}: action '{action.do}' is not one this world can perform "
                f"(have: {[a.id for a in world.visual.actions]})"
            )
            continue

        if spec.targets:
            if not action.target:
                report.fail(f"{where}: action '{action.do}' needs a target ({spec.targets})")
            elif action.target not in spec.targets:
                report.fail(
                    f"{where}: '{action.do}' cannot be aimed at '{action.target}' "
                    f"(accepts: {spec.targets})"
                )
        elif action.target:
            report.fail(f"{where}: action '{action.do}' takes no target, got '{action.target}'")

        if spec.from_code:
            if not action.from_variable:
                report.fail(
                    f"{where}: '{action.do}' must say which variable or return value "
                    "supplies it — that is the point of it"
                )
            if action.value is not None:
                report.fail(
                    f"{where}: '{action.do}' carries a fixed value '{action.value}'. Its "
                    "value comes from the student's code, or the world is only pretending "
                    "to react."
                )
        elif action.from_variable:
            report.fail(
                f"{where}: '{action.do}' is not driven by the student's code, so "
                f"from_variable='{action.from_variable}' would be ignored"
            )


def _check_props(props: dict | None, world: World, where: str, report: ValidationReport) -> None:
    for name in props or {}:
        if not world.visual.can_draw(name):
            report.fail(
                f"{where}: '{name}' is not a sprite this world can draw "
                f"(have: {sorted(world.visual.sprites)})"
            )



#: Vocabulary a mission uses for a quantity the scene has already fixed. Assignments to
#: these names are checked against `simulation.quantities`.
_QUANTITY_ALIASES = {
    "loaves_per_tray": "tray_capacity",
    "tray_capacity": "tray_capacity",
    "batch_size": "batch_size",
    "loaves_per_batch": "batch_size",
    "order_size": "order_size",
    "loaves_per_customer": "order_size",
    "queue_length": "queue_length",
    "customers": "queue_length",
    "customers_waiting": "queue_length",
}


def _check_arithmetic(mission, world: World, report: ValidationReport) -> None:
    """Every literal the mission assigns must agree with what the scene draws.

    A mission teaching `loaves_per_tray = 12` is perfectly good Python. It runs, its tests
    pass, the sandbox is satisfied — and the child watches eight loaves land on the tray
    while being told there are twelve. Every other guard here asks "can the client draw
    this?"; this one asks "is it true?", and nothing else in the pipeline does.

    Only assignments of plain integers to known names are checked. A mission is free to
    invent its own quantities; it is not free to redefine one the scene has committed to.

    **Every code surface a student reads has to be checked, and `remix.solution_code` is
    the one that matters most.** It was missing until 2026-09-11, and the hole is not
    academic: a mission shipped `validated: true` whose remix twist was "Hassan brought
    bigger trays that hold 12", with `remix.starting_code` at the honest `= 8` — so the
    checked field passed — and `loaves_per_tray = 12` in the solution the child is asked
    to write. The phase where the mission is most tempted to redefine a quantity is
    exactly the phase that was not looked at.
    """
    sim = world.simulation
    if sim is None:
        return

    report.checks_run.append("arithmetic")

    for label, code in (
        ("understand", mission.phases.understand.code),
        ("guided", mission.phases.guided.solution_code),
        ("remix", mission.phases.remix.starting_code),
        ("remix solution", mission.phases.remix.solution_code),
    ):
        if not code:
            continue
        try:
            tree = ast.parse(code)
        except SyntaxError:
            continue  # the sandbox reports this far better than we could

        for node in ast.walk(tree):
            if not isinstance(node, ast.Assign):
                continue
            if not (isinstance(node.value, ast.Constant) and isinstance(node.value.value, int)):
                continue
            for target in node.targets:
                if not isinstance(target, ast.Name):
                    continue
                quantity = _QUANTITY_ALIASES.get(target.id)
                if quantity and sim.contradicts(quantity, node.value.value):
                    report.fail(
                        f"{label}: `{target.id} = {node.value.value}` contradicts the scene, "
                        f"which draws {quantity} = {sim.quantities[quantity]}. Use that value "
                        f"or a different name."
                    )

# --------------------------------------------------------------------- per phase


def _encounter(phase, world: World, report: ValidationReport) -> None:
    report.checks_run.append("encounter")

    speakers = {c.id for c in world.characters} | {"tico"}
    if phase.speaker not in speakers:
        report.fail(f"encounter: '{phase.speaker}' is not a character in this world")

    if not phase.line_ar.strip():
        report.fail("encounter: the speaker says nothing")

    # The one phase that must contain no programming at all — the student should want
    # the problem solved before they know a language is involved.
    for token in ("def ", "return", "print(", "python", "Python"):
        if token in phase.line_ar:
            report.fail(
                f"encounter: mentions {token!r}. This phase is the problem only, "
                "stated before any language exists"
            )

    _check_props(phase.world.props, world, "encounter", report)


def _explore(phase, world: World, report: ValidationReport) -> None:
    report.checks_run.append("explore")

    if not phase.rounds:
        report.fail("explore: no questions")

    for i, rnd in enumerate(phase.rounds, 1):
        where = f"explore round {i}"

        if len(set(rnd.options_ar)) != len(rnd.options_ar):
            report.fail(f"{where}: duplicate options")

        if not rnd.nudge_ar.strip():
            report.fail(
                f"{where}: no nudge. A wrong answer must lead somewhere — this phase "
                "has no failure state"
            )

        for token in ("def ", "return", "==", "if ", "print("):
            if token in rnd.question_ar:
                report.fail(
                    f"{where}: contains {token!r}. Phase 2 is reasoning about the "
                    "situation, with no code in sight"
                )

        for prop in rnd.highlight:
            if not world.visual.can_draw(prop):
                report.fail(f"{where}: highlights '{prop}', which is not a sprite")


def _discover(phase, expected_slug: str, report: ValidationReport) -> None:
    report.checks_run.append("discover")

    if phase.concept_slug != expected_slug:
        report.fail(
            f"discover: names concept '{phase.concept_slug}' but this mission teaches "
            f"'{expected_slug}'"
        )

    if len(phase.explanation_ar.splitlines()) > 5:
        report.fail("discover: the explanation is a lecture. Three lines is the brief")


def _understand(phase, world: World, report: ValidationReport) -> None:
    """Phase 4 shows finished code and is RUNNABLE — cause and effect before responsibility."""
    report.checks_run.append("understand")

    if "___" in phase.code:
        report.fail("understand: the code has blanks. Phase 4 shows the finished thing")

    result = sandbox.run(phase.code, [])
    if not result.ok:
        report.fail(f"understand: the code will not even load: {result.error}")

    if not phase.on_run.animate:
        report.fail(
            "understand: nothing animates on run. Watching the world work is the entire "
            "reason this phase is runnable rather than a screenshot"
        )

    _check_animation(phase.on_run, world, "understand.on_run", report)
    _check_props(phase.on_run.props, world, "understand.on_run", report)

    for a in phase.annotations:
        if a.points_at and not world.visual.can_draw(a.points_at):
            report.fail(f"understand: annotation points at '{a.points_at}', not a sprite")


def _guided(phase, understand, world: World, report: ValidationReport) -> None:
    """Their first typing. The solution must pass; every step must genuinely fail empty."""
    report.checks_run.append("guided")

    expectations = [(t.call, t.expected) for t in phase.tests]
    if len(expectations) < 2:
        report.fail("guided: fewer than two tests")
        return

    ok, failures = sandbox.passes(phase.solution_code, expectations)
    if not ok:
        for f in failures:
            report.fail(f"guided: the solution fails its own test: {f}")

    # Phase 5 must be phase 4's function, or the student is asked to reproduce something
    # they were never shown.
    shown = _function_names(understand.code)
    asked = _function_names(phase.solution_code)
    if shown and asked and shown != asked:
        report.fail(
            f"guided: defines {sorted(asked)} but phase 4 showed {sorted(shown)}. "
            "They must be the same function evolving, not two exercises"
        )

    for i, step in enumerate(phase.steps, 1):
        where = f"guided step {i}"

        if "___" not in step.code:
            report.fail(f"{where}: no blank, so there is nothing for the student to do")
            continue

        filled = step.code
        for answer in step.blanks:
            filled = filled.replace("___", answer, 1)

        step_expectations = (
            [(t.call, t.expected) for t in step.tests]
            if step.tests is not None else expectations
        )
        ok_filled, why = sandbox.passes(filled, step_expectations)
        if not ok_filled:
            report.fail(f"{where}: filling the blanks does not solve it — {why[:1]}")

        # Substituting None rather than deleting keeps it syntactically valid, so this
        # tests whether the blank matters rather than whether the code parses.
        ok_empty, _ = sandbox.passes(step.code.replace("___", "None"), step_expectations)
        if ok_empty:
            report.fail(f"{where}: passes without filling the blank — nothing to do")

    _check_animation(phase.on_run, world, "guided.on_run", report)
    _check_props(phase.on_run.props, world, "guided.on_run", report)


def _remix(phase, guided, world: World, report: ValidationReport) -> None:
    """The world changed, so what they already wrote must now be wrong — and fixable."""
    report.checks_run.append("remix")

    expectations = [(t.call, t.expected) for t in phase.tests]
    if len(expectations) < 2:
        report.fail("remix: fewer than two tests")
        return

    ok, failures = sandbox.passes(phase.solution_code, expectations)
    if not ok:
        for f in failures:
            report.fail(f"remix: the new solution fails its own test: {f}")

    # The entire idea of phase 6.
    still_passes, _ = sandbox.passes(phase.starting_code, expectations)
    if still_passes:
        report.fail(
            "remix: their existing code already satisfies the new requirement, so "
            "nothing actually changed and there is nothing to adapt"
        )

    if _normalise(phase.starting_code) != _normalise(guided.solution_code):
        report.warn(
            "remix: starting_code differs from the phase-5 solution. The client should "
            "load what the student actually wrote; this is only the fallback"
        )

    if not phase.twist_ar.strip():
        report.fail("remix: no twist, so the world did not visibly change")

    _check_animation(phase.world_change, world, "remix.world_change", report)
    _check_animation(phase.on_run, world, "remix.on_run", report)
    _check_props(phase.world_change.props, world, "remix.world_change", report)


# ------------------------------------------------------------------------ helpers


def _has_visible_consequence(change) -> bool:
    if change is None:
        return False
    return bool(
        change.animate
        or change.actions
        or change.props
        or change.steps
        or (change.caption_ar or "").strip()
    )


def _check_change_deep(change, world: World, where: str, report: ValidationReport) -> None:
    """Validate the outer change and every ordered beat the client will play."""
    if change is None:
        return
    _check_animation(change, world, where, report)
    _check_props(change.props, world, where, report)
    for index, beat in enumerate(change.steps, 1):
        beat_where = f"{where}.steps[{index}]"
        if beat.animate and not world.visual.can_animate(beat.animate):
            report.fail(
                f"{beat_where}: animation '{beat.animate}' is not in the {world.id} manifest"
            )
        _check_props(beat.props, world, beat_where, report)
        if not (beat.line_ar or "").strip():
            report.fail(f"{beat_where}: visual beat has no narration")


def _check_target_concept(
    code: str,
    concept: str,
    report: ValidationReport,
    *,
    where: str = "guided",
) -> None:
    """Prove the code uses the concept instead of merely mentioning it in prose."""
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return  # The sandbox reports the syntax failure with better detail.

    nodes = tuple(ast.walk(tree))
    uses = {
        "variables": any(isinstance(node, (ast.Assign, ast.AnnAssign)) for node in nodes),
        "conditionals": any(isinstance(node, ast.If) for node in nodes),
        "loops": any(isinstance(node, (ast.For, ast.While)) for node in nodes),
        "functions": any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) for node in nodes),
    }
    if concept in uses and not uses[concept]:
        syntax = {
            "variables": "an assignment",
            "conditionals": "a Python if statement",
            "loops": "a Python for or while loop",
            "functions": "a function definition",
        }[concept]
        report.fail(f"{where}: claims to teach {concept} but contains no {syntax}")


def _function_names(code: str) -> set[str]:
    return set(re.findall(r"^def\s+(\w+)", code, re.MULTILINE))


def _normalise(code: str) -> str:
    """Compare code ignoring blank lines and trailing whitespace."""
    return "\n".join(line.rstrip() for line in code.strip().splitlines() if line.strip())
