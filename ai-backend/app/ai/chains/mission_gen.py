"""Generate a six-phase mission, and never let a broken one reach a student.

    model invents  ->  run the code  ->  validate  ->  pass? ship it
                                                    ->  fail? retry once with the reason
                                                    ->  still failing? raise

The model is the star. It invents the scenario, the questions, the code and the twist, so
two students on the same concept get genuinely different missions rather than the same
mission with different numbers.

## What is never taken on trust

**Expected outputs.** The model writes test *inputs*; `sandbox` runs the solution to get
the outputs. A model asked for both will occasionally produce `total(4, 12) -> 46`, and
the child then fails a test that was wrong before they typed anything.

**"It's correct."** `validated` is set by `guards`, which runs the code at every stage —
the solution must pass, and the starter must fail.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from app.ai import phase_guards, sandbox, traffic_beginner
from app.ai.prompts import mission_gen as prompt
from app.ai.router import AICapability, get_model
from app.config import settings
from app.manifests.models import World
from app.rules import mission_builder
from app.schemas import phases as P

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 2


@dataclass
class GenerationOutcome:
    mission: P.PhasedMissionOut | None
    source: str                      # "model" — the only path that produces six phases
    attempts: int = 0
    latency_ms: int = 0
    model_name: str | None = None
    failures: list[str] = field(default_factory=list)


class GenerationFailed(RuntimeError):
    """Every attempt produced something that would not work for a student."""


def mechanic_for_stop(world: World, concept: str, repetition: int):
    mechanics = world.mechanics_for(concept)
    if not mechanics:
        raise GenerationFailed(f"{world.id} has no authored mechanic for {concept}")
    index = min(max(repetition, 1) - 1, len(mechanics) - 1)
    if world.id == "isharet_cairo" and concept == "loops" and repetition in (1, 2):
        # The first map stop teaches cars; the second teaches pedestrians.
        index = 2 - repetition
    return mechanics[index]


# --------------------------------------------------------------------------- helpers


def _derive_tests(solution_code: str, inputs: list[str]) -> tuple[list[P.MissionTest], list[str]]:
    """Run the solution against each input and record what came back.

    This is where a test's `expected` comes from. Built this way it cannot disagree with
    its own solution, which removes the entire class of unsolvable mission rather than
    trying to prompt around it.
    """
    if not inputs:
        return [], ["no test inputs were given"]

    result = sandbox.run(solution_code, inputs)
    if not result.ok:
        return [], [f"the solution did not run: {result.error}"]

    tests, problems = [], []
    for call in result.results:
        if not call.ok:
            problems.append(f"{call.expression} raised {call.error}")
            continue
        tests.append(P.MissionTest(call=call.expression, expected=call.value or "None"))
    return tests, problems


def _to_mission(raw: dict, world: World, *, concept: str, carried: list[str],
                scene_id: str, scaffold: dict[str, str],
                blueprint: mission_builder.ComposedMission) -> tuple[P.PhasedMissionOut, list[str]]:
    """Turn the model's JSON into the typed contract, deriving what must be derived."""
    if world.id == "isharet_cairo" and blueprint.mechanic_id == "cross_each_pedestrian":
        from app.ai import traffic_pedestrians
        try:
            return traffic_pedestrians.build(raw, blueprint, scaffold=scaffold), []
        except Exception as exc:
            return None, [f"pedestrian story could not be composed: {exc}"]
    if world.id == "isharet_cairo" and blueprint.mechanic_id == "release_each_car":
        try:
            return traffic_beginner.build(raw, blueprint, scaffold=scaffold), []
        except Exception as exc:  # A bad draft must never become a playable mission.
            return None, [f"traffic story could not be composed: {exc}"]
    problems: list[str] = []

    guided_raw = raw.get("guided") or {}
    remix_raw = raw.get("remix") or {}

    # Code is selected from an authored mechanic and rendered by Python. The model may
    # remove pieces for guided practice and extend it for the remix; it may not invent
    # the function the lesson is built around.
    guided_solution = blueprint.solution_code
    remix_solution = (
        blueprint.remix_solution_code
        or (remix_raw.get("solution_code") or "").strip()
    )

    guided_tests = [P.MissionTest(call=call, expected=expected) for call, expected in blueprint.tests]
    p1: list[str] = []
    if blueprint.remix_tests:
        remix_tests = [
            P.MissionTest(call=call, expected=expected)
            for call, expected in blueprint.remix_tests
        ]
        p2: list[str] = []
    else:
        remix_tests, p2 = _derive_tests(remix_solution, remix_raw.get("test_inputs") or [])
    problems += [f"guided: {x}" for x in p1]
    problems += [f"remix: {x}" for x in p2]

    # Phase 6 starts from phase 5's finished code — that is what makes the world feel
    # like it moved rather than a new exercise arriving.
    starting_code = guided_solution

    try:
        mission = P.PhasedMissionOut(
            id="",  # assigned when persisted
            world_id=world.id,
            scene_id=scene_id,
            target_concept_id=concept,
            carried_concept_ids=carried,
            title_ar=raw.get("title_ar") or world.world.name_ar,
            source="model",
            validated=False,  # guards decides
            scaffold=dict(scaffold),
            difficulty_band=blueprint.difficulty_band,
            phases=P.MissionPhases(
                encounter=P.PhaseEncounter(**(raw.get("encounter") or {})),
                explore=P.PhaseExplore(**(raw.get("explore") or {})),
                discover=P.PhaseDiscover(
                    concept_slug=concept, **(raw.get("discover") or {})
                ),
                understand=P.PhaseUnderstand(**(raw.get("understand") or {})),
                guided=P.PhaseGuided(
                    steps=guided_raw.get("steps") or [],
                    solution_code=guided_solution,
                    tests=guided_tests,
                    on_run=guided_raw.get("on_run") or {},
                ),
                remix=P.PhaseRemix(
                    twist_ar=remix_raw.get("twist_ar", ""),
                    new_requirement_ar=remix_raw.get("new_requirement_ar", ""),
                    world_change=remix_raw.get("world_change") or {},
                    starting_code=starting_code,
                    solution_code=remix_solution,
                    tests=remix_tests,
                    on_run=remix_raw.get("on_run") or {},
                ),
            ),
        )
    except Exception as exc:  # noqa: BLE001 - a shape error is a rejection, not a crash
        return None, problems + [f"the reply did not match the contract: {exc}"]

    return mission, problems


# ---------------------------------------------------------------------------- the run


def generate(
    world: World,
    *,
    target_concept: str,
    carried_concepts: list[str],
    scene_id: str,
    scaffold: dict[str, str] | None = None,
    repetition: int = 1,
    already_taught: list[str] | None = None,
    speaker: str | None = None,
) -> GenerationOutcome:
    """Ask the model for a mission, check it for real, retry once with the reasons."""
    scaffold = scaffold or {}
    started = time.time()
    outcome = GenerationOutcome(mission=None, source="model")

    if not settings.google_api_key:
        raise GenerationFailed("no GOOGLE_API_KEY — the model cannot be called")

    mechanic = mechanic_for_stop(world, target_concept, repetition)
    blueprint = mission_builder.compose(
        world,
        mechanic,
        scaffold=scaffold,
        # Repetition is stable for a learner stop, which makes a rejected generation
        # reproducible while still moving to the next authored difficulty over time.
        seed=repetition,
    )
    if blueprint.problems:
        raise GenerationFailed("authored mechanic failed composition: " + "; ".join(blueprint.problems))

    system, task = prompt.build(
        world,
        target_concept=target_concept,
        carried_concepts=carried_concepts,
        scene_id=scene_id,
        scaffold=scaffold,
        repetition=repetition,
        already_taught=already_taught,
        speaker=speaker,
        mechanic=mechanic,
        blueprint=blueprint,
    )
    outcome.model_name = settings.model_generate

    llm = get_model(
        AICapability.GENERATE,
        # High enough that two students get different scenarios; low enough that it
        # keeps following a nine-key JSON shape.
        temperature=0.4 if world.id == "isharet_cairo" else 0.8,
        max_output_tokens=settings.max_tokens_generate,
        timeout=90.0,
    )

    messages = [("system", system), ("human", task)]

    for attempt in range(1, MAX_ATTEMPTS + 1):
        outcome.attempts = attempt
        try:
            reply = llm.invoke(messages)
            raw = prompt.parse(reply.content or "")
        except Exception as exc:  # noqa: BLE001
            outcome.failures = [f"the model reply could not be read: {exc}"]
            log.warning("generation attempt %d unusable: %s", attempt, exc)
            messages.append(("human", prompt.retry_prompt(outcome.failures)))
            continue

        mission, problems = _to_mission(
            raw, world, concept=target_concept, carried=carried_concepts,
            scene_id=scene_id, scaffold=scaffold, blueprint=blueprint,
        )

        if mission is None:
            outcome.failures = problems
            messages.append(("human", prompt.retry_prompt(problems)))
            continue

        report = phase_guards.validate_phases(mission, world)
        quality = phase_guards.validate_generation_quality(
            mission, world, blueprint=blueprint
        )
        failures = problems + report.failures + quality.failures

        if not failures:
            mission.validated = True
            outcome.mission = mission
            outcome.latency_ms = int((time.time() - started) * 1000)
            log.info(
                "generated a six-phase mission for %s/%s in %d attempt(s), %dms",
                world.id, target_concept, attempt, outcome.latency_ms,
            )
            return outcome

        outcome.failures = failures
        log.info("generation attempt %d rejected: %s", attempt, failures[:3])
        messages.append(("human", prompt.retry_prompt(failures)))

    outcome.latency_ms = int((time.time() - started) * 1000)
    raise GenerationFailed(
        f"{MAX_ATTEMPTS} attempts produced nothing valid: {'; '.join(outcome.failures[:4])}"
    )
