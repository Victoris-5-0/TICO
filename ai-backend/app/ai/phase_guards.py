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

        ok_filled, why = sandbox.passes(filled, expectations)
        if not ok_filled:
            report.fail(f"{where}: filling the blanks does not solve it — {why[:1]}")

        # Substituting None rather than deleting keeps it syntactically valid, so this
        # tests whether the blank matters rather than whether the code parses.
        ok_empty, _ = sandbox.passes(step.code.replace("___", "None"), expectations)
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


def _function_names(code: str) -> set[str]:
    return set(re.findall(r"^def\s+(\w+)", code, re.MULTILINE))


def _normalise(code: str) -> str:
    """Compare code ignoring blank lines and trailing whitespace."""
    return "\n".join(line.rstrip() for line in code.strip().splitlines() if line.strip())
