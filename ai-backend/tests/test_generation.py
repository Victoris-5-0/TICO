"""Mission generation: composer, sandbox, validator.

Offline. No database, no API key, no network — which is the whole argument for keeping
the model out of the composer. If these pass, generation works; the model only decides
how nice the Arabic reads.

The headline test is `test_every_mechanic_generates_a_valid_mission`. It composes one
mission from every mechanic in every manifest and validates it, so a manifest edit that
breaks generation fails the build rather than a child's lesson.
"""

from __future__ import annotations

import pytest

from app import manifests as M
from app.ai import guards, sandbox
from app.rules import mission_builder as composer

ALL_MECHANICS = [
    pytest.param(world, mech, id=f"{world.id}/{mech.id}")
    for world in M.all_worlds()
    for mech in world.mechanics
]


# ========================================================================= sandbox


def test_sandbox_evaluates_expressions():
    code = "def double(n: int) -> int:\n    return n * 2\n"
    result = sandbox.run(code, ["double(21)", "double(0)"])
    assert result.all_ok
    assert result.values() == ["42", "0"]


def test_sandbox_handles_arabic():
    """The whole product is Egyptian Arabic. Mojibake here would poison every mission."""
    code = 'def greet(name: str) -> str:\n    return f"أهلا {name}"\n'
    result = sandbox.run(code, ['greet("سلمى")'])
    assert result.all_ok
    assert "سلمى" in result.results[0].value


def test_sandbox_survives_a_syntax_error():
    result = sandbox.run("def broken(:\n    pass", ["broken()"])
    assert not result.ok
    assert "SyntaxError" in (result.error or "")


def test_sandbox_kills_an_infinite_loop():
    """A generated `while` that never ends must cost one worker seconds, not the service."""
    result = sandbox.run("while True:\n    pass\n", ["1"], timeout=3)
    assert not result.ok
    assert "timed out" in (result.error or "")


def test_sandbox_reports_a_raising_call_without_losing_the_others():
    code = "def half(n):\n    return 10 / n\n"
    result = sandbox.run(code, ["half(2)", "half(0)", "half(5)"])
    assert result.ok
    assert [c.ok for c in result.results] == [True, False, True]
    assert "ZeroDivisionError" in result.results[1].error


def test_passes_ignores_quote_style():
    """`repr()` gives 'open'; a manifest writes "open". Same string."""
    ok, _ = sandbox.passes('def f():\n    return "open"\n', [("f()", '"open"')])
    assert ok


# ======================================================================== composer


@pytest.mark.parametrize("world,mech", ALL_MECHANICS)
def test_every_mechanic_generates_a_valid_mission(world, mech):
    """The load-bearing test. Every authored mechanic must produce a playable mission."""
    mission = composer.compose(world, mech, seed=1234)
    report = guards.validate(mission, world)
    assert report.ok, f"{world.id}/{mech.id} rejected: {report.failures}"


@pytest.mark.parametrize("world,mech", ALL_MECHANICS)
def test_expected_values_are_derived_not_invented(world, mech):
    """Every test's expected value came from running the reference solution."""
    mission = composer.compose(world, mech, seed=99)
    assert len(mission.tests) >= 2
    ok, failures = sandbox.passes(mission.solution_code, mission.tests)
    assert ok, f"{world.id}/{mech.id}: solution fails its own tests: {failures}"


@pytest.mark.parametrize("world,mech", ALL_MECHANICS)
def test_the_starter_never_already_passes(world, mech):
    """A mission whose starter passes is a screenshot, not a task."""
    mission = composer.compose(world, mech, seed=99)
    ok, _ = sandbox.passes(mission.starter_code, mission.tests)
    assert not ok, f"{world.id}/{mech.id}: nothing for the student to do"


def test_the_same_seed_gives_the_same_mission():
    """Reproducibility is what makes a generated mission debuggable at all."""
    world = M.get("el_forn")
    mech = world.mechanic("threshold_decision")
    a = composer.compose(world, mech, seed=7)
    b = composer.compose(world, mech, seed=7)
    assert a.solution_code == b.solution_code
    assert a.tests == b.tests
    assert a.params == b.params


def test_different_seeds_vary_the_scenario_not_the_concept():
    """Variation is the point; changing what is taught is not."""
    world = M.get("isharet_cairo")
    mech = world.mechanic("two_way_rule")
    missions = [composer.compose(world, mech, seed=s) for s in range(12)]

    assert len({m.solution_code for m in missions}) > 1, "no variation at all"
    assert {m.target_concept for m in missions} == {"conditionals"}
    assert {m.mechanic_id for m in missions} == {"two_way_rule"}


def test_parameters_stay_inside_their_declared_bounds():
    world = M.get("isharet_cairo")
    mech = world.mechanic("priority_override")
    spec = mech.param_schema["threshold"]
    for seed in range(20):
        value = composer.compose(world, mech, seed=seed).params["threshold"]
        assert spec["min"] <= value <= spec["max"]


def test_enum_parameters_only_take_declared_options():
    world = M.get("el_forn")
    mech = world.mechanic("compose_notice")
    allowed = set(mech.param_schema["fn_name"]["options"])
    for seed in range(20):
        assert composer.compose(world, mech, seed=seed).params["fn_name"] in allowed


def test_scaffold_is_pre_filled_into_the_starter():
    """A student strong on variables should not have to re-derive `count = 0`."""
    world = M.get("el_mahatta")
    mech = world.mechanic("count_matching")

    full = composer.compose(world, mech, seed=3, scaffold={"variables": "FULL"})
    none = composer.compose(world, mech, seed=3, scaffold={"variables": "NONE"})

    assert "count = 0" in full.starter_code
    assert "count = 0" not in none.starter_code
    # Scaffolding must not change the task or the answer.
    assert full.solution_code == none.solution_code
    assert full.tests == none.tests


def test_a_brief_appears_and_its_absence_leaves_no_empty_comment():
    world = M.get("el_forn")
    mech = world.mechanic("compose_notice")

    with_brief = composer.compose(world, mech, seed=7, brief_ar="الفرن فتح بدري.")
    assert "الفرن فتح بدري." in with_brief.starter_code

    without = composer.compose(world, mech, seed=7)
    assert not any(line.strip() == "#" for line in without.starter_code.splitlines())


def test_generation_works_with_no_model_at_all():
    """The dependency direction that matters: a model outage costs variety, not missions."""
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("multiply_quantities"), seed=5)
    assert guards.validate(mission, world).ok
    assert mission.brief_ar == ""


# ======================================================================= validator


def test_validator_rejects_an_unsolvable_mission():
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("multiply_quantities"), seed=5)
    mission.tests = [(mission.tests[0][0], "999999")]  # an answer the solution never gives

    report = guards.validate(mission, world)
    assert not report.ok
    assert any("fails its own test" in f for f in report.failures)


def test_validator_rejects_a_starter_that_is_already_finished():
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("multiply_quantities"), seed=5)
    mission.starter_code = mission.solution_code

    report = guards.validate(mission, world)
    assert not report.ok
    assert any("already passes" in f for f in report.failures)


def test_validator_rejects_an_unfilled_placeholder():
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("multiply_quantities"), seed=5)
    mission.starter_code += "\n# <<forgotten>>"

    report = guards.validate(mission, world)
    assert not report.ok
    assert any("placeholder" in f for f in report.failures)


def test_validator_rejects_a_parameter_that_is_not_a_world_noun():
    """Selection, never invention — enforced, not asserted.

    A bakery has loaves and trays. It has no profit margin, and a mission asking a child
    about one is a mission about a world that does not exist.
    """
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("multiply_quantities"), seed=5)
    mission.solution_code = (
        "def calculate(profit_margin: int, tax_rate: int) -> int:\n"
        "    return profit_margin * tax_rate\n"
    )

    report = guards.validate(mission, world)
    assert not report.ok
    assert any("does not exist there" in f for f in report.failures)


def test_validator_allows_ordinary_local_names():
    """A loop variable is not an invented noun.

    The first live generation was rejected for naming a loop variable `order`, which
    cost a whole retry. Locals may be called anything; only parameters must be world
    nouns.
    """
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("sum_a_list"), seed=5)
    mission.solution_code = (
        "def total_orders(orders: list) -> int:\n"
        "    running_total = 0\n"
        "    for single_order in orders:\n"
        "        running_total = running_total + single_order\n"
        "    return running_total\n"
    )
    mission.tests = [("total_orders([1, 2, 3])", "6"), ("total_orders([])", "0")]

    report = guards.validate(mission, world)
    assert report.ok, report.failures


def test_validator_rejects_a_scene_from_another_world():
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("multiply_quantities"), seed=5)
    mission.scene_id = "traffic_establishing"

    report = guards.validate(mission, world)
    assert not report.ok
    assert any("not in the el_forn manifest" in f for f in report.failures)


def test_validation_report_is_storable():
    """It is written to `generated_missions` so a rejection can be explained months later."""
    world = M.get("el_forn")
    mission = composer.compose(world, world.mechanic("compose_notice"), seed=2)
    payload = guards.validate(mission, world).as_dict()

    assert set(payload) == {"ok", "failures", "warnings", "checks_run"}
    assert len(payload["checks_run"]) >= 5


# ==================================================================== hint guard


def test_hint_guard_catches_a_verbatim_solution_line():
    """The most important safety property in the product."""
    solution = (
        "def signal_for(a: int, b: int) -> str:\n"
        "    if a > b:\n"
        '        return "أخضر"\n'
        '    return "أحمر"\n'
    )
    leaked, why = guards.hint_leaks_answer('جرب تكتب: if a > b:\n        return "أخضر"', solution)
    assert leaked and "verbatim" in why


def test_hint_guard_allows_a_real_hint():
    solution = 'def f(a, b):\n    if a > b:\n        return "أخضر"\n'
    hint = "فكر: إزاي تقارن رقمين في بايثون؟ في فرق بين علامة واحدة واتنين."
    leaked, _ = guards.hint_leaks_answer(hint, solution)
    assert not leaked


def test_hint_guard_catches_an_announced_answer():
    leaked, why = guards.hint_leaks_answer("الحل هو إنك تستخدم if", "def f():\n    pass\n")
    assert leaked and "announces" in why


def test_hint_guard_does_not_trip_on_short_shared_lines():
    """A hint may say `pass` or `return`. Those are vocabulary, not the answer."""
    leaked, _ = guards.hint_leaks_answer(
        "شيل الـ pass واكتب return مكانها.", "def f():\n    pass\n"
    )
    assert not leaked


# ------------------------------------------------------- the exercise-shaped flattening


def test_as_exercise_reads_fields_that_exist():
    """`/v1/missions/generate` flattens six phases into an `exercises` row.

    This exists because that endpoint shipped with two bugs that no test would have caught:
    a `NameError` on an unimported module, and a read of `guided.starting_code`, which the
    six-phase schema does not have. Both were found by generating a real mission, not by
    the suite — the endpoint had no coverage at all.

    Run against the committed example mission, so it costs nothing and cannot drift from
    the shape the service actually produces.
    """
    import json
    import pathlib

    from app.schemas import phases as P
    from app.schemas.missions import GenerateMissionResponse
    from app.services.missions import ENGINE_VERSION, as_exercise

    example = pathlib.Path(__file__).resolve().parents[1] / "docs" / "example-mission-response.json"
    mission = P.PhasedMissionOut.model_validate(json.loads(example.read_text(encoding="utf-8"))["data"])

    # Constructing the DTO is most of the assertion: a missing or misnamed field raises.
    response = GenerateMissionResponse(**as_exercise(mission))

    # The starter is the first guided step's code — there is no separate starting file.
    assert response.starter_code == mission.phases.guided.steps[0].code
    assert response.test_cases, "an exercise with no tests cannot be marked passed"
    assert len(response.hints) == 4, "one authored fallback per rung"

    # The version must match what `persist` stamps on the row, or the response describes a
    # different artefact from the one that was stored.
    assert response.engine_version == ENGINE_VERSION


def test_as_exercise_keeps_hidden_tests_hidden():
    """A hidden test shown to the student is the answer, spelled out as an assertion."""
    import json
    import pathlib

    from app.schemas import phases as P
    from app.services.missions import as_exercise

    example = pathlib.Path(__file__).resolve().parents[1] / "docs" / "example-mission-response.json"
    mission = P.PhasedMissionOut.model_validate(json.loads(example.read_text(encoding="utf-8"))["data"])
    mission.phases.guided.tests[0].hidden = True

    flattened = as_exercise(mission)
    assert flattened["test_cases"][0]["isHidden"] is True
    assert [t["isHidden"] for t in flattened["test_cases"]] == [
        t.hidden for t in mission.phases.guided.tests
    ]


# ------------------------------------------------- the scene's arithmetic is binding


def _example_mission():
    import json
    import pathlib

    from app.schemas import phases as P

    example = pathlib.Path(__file__).resolve().parents[1] / "docs" / "example-mission-response.json"
    return P.PhasedMissionOut.model_validate(json.loads(example.read_text(encoding="utf-8"))["data"])


def test_the_manifest_carries_the_scenes_own_numbers():
    """`visual` says what can be drawn; `simulation` says what is true about it.

    These come from `client/src/lib/bakery/simulation.ts` by way of the bakery-v2
    inventory. Without them the manifest could describe a tray it could draw but not how
    many loaves fit on it.
    """
    from app import manifests

    sim = manifests.get("el_forn").simulation
    assert sim is not None, "el_forn has a running interactive scene and must declare it"
    assert sim.quantities["tray_capacity"] == 8
    assert sim.quantities["order_size"] == 2
    assert sim.quantities["queue_length"] == 8
    # Two batches of eight, two loaves each, eight customers. The scene is built on this.
    assert (
        sim.quantities["batch_size"] * sim.quantities["batches_to_clear_queue"]
        == sim.quantities["order_size"] * sim.quantities["queue_length"]
    )


def test_a_mission_may_not_contradict_what_the_scene_draws():
    """The bug this guard exists for, and the one nothing else could catch.

    `loaves_per_tray = 12` is correct Python. It runs, its tests pass, the sandbox is
    satisfied — and the child watches eight loaves land on the tray while being told there
    are twelve. Generation really did produce exactly this before the scene's numbers
    reached the prompt.
    """
    from app import manifests
    from app.ai.phase_guards import validate_phases

    world = manifests.get("el_forn")
    mission = _example_mission()
    mission.phases.understand.code = (
        "def calculate_loaves(trays: int) -> int:\n"
        "    loaves_per_tray = 12\n"
        "    return trays * loaves_per_tray"
    )

    report = validate_phases(mission, world)
    assert not report.ok
    assert any("contradicts the scene" in f and "tray_capacity = 8" in f for f in report.failures)


def test_the_value_the_scene_actually_draws_is_accepted():
    from app import manifests
    from app.ai.phase_guards import validate_phases

    world = manifests.get("el_forn")
    mission = _example_mission()
    mission.phases.understand.code = (
        "def calculate_loaves(trays: int) -> int:\n"
        "    loaves_per_tray = 8\n"
        "    return trays * loaves_per_tray"
    )

    assert not [f for f in validate_phases(mission, world).failures if "contradicts" in f]


def test_a_quantity_the_scene_has_no_opinion_on_is_left_alone():
    """A mission may invent its own numbers. It may not redefine the scene's."""
    from app import manifests
    from app.ai.phase_guards import validate_phases

    world = manifests.get("el_forn")
    mission = _example_mission()
    mission.phases.understand.code = (
        "def total(days: int) -> int:\n"
        "    price_per_loaf = 75\n"
        "    return days * price_per_loaf"
    )

    assert not [f for f in validate_phases(mission, world).failures if "contradicts" in f]


def test_the_remix_solution_is_checked_too():
    """The phase most tempted to redefine a quantity, and the one that went unchecked.

    A real mission shipped `validated: true` with this exact shape: the twist announced
    bigger trays holding twelve, `remix.starting_code` kept the honest `= 8` so the
    checked field passed, and the solution the child was asked to write set
    `loaves_per_tray = 12` while the scene drew eight. `_check_arithmetic` read
    `understand.code`, `guided.solution_code` and `remix.starting_code` — every code
    surface except that one.
    """
    from app import manifests
    from app.ai.phase_guards import validate_phases

    world = manifests.get("el_forn")
    mission = _example_mission()
    honest = (
        "def calculate_loaves(trays: int) -> int:\n"
        "    loaves_per_tray = 8\n"
        "    return trays * loaves_per_tray"
    )
    mission.phases.understand.code = honest
    mission.phases.guided.solution_code = honest
    mission.phases.remix.starting_code = honest
    mission.phases.remix.solution_code = honest.replace("= 8", "= 12")

    report = validate_phases(mission, world)
    assert not report.ok
    assert any(
        "remix solution" in f and "contradicts the scene" in f and "tray_capacity = 8" in f
        for f in report.failures
    ), report.failures


def test_a_remix_that_invents_its_own_quantity_is_fine():
    """The fence must not make phase 6 impossible — only honest.

    A twist is still allowed to change the world; it just may not renumber something the
    scene has committed to drawing.
    """
    from app import manifests
    from app.ai.phase_guards import validate_phases

    world = manifests.get("el_forn")
    mission = _example_mission()
    mission.phases.remix.solution_code = (
        "def calculate_loaves(trays: int) -> int:\n"
        "    loaves_per_tray = 8\n"
        "    reserved_for_neighbours = 3\n"
        "    return trays * loaves_per_tray - reserved_for_neighbours"
    )

    assert not [f for f in validate_phases(mission, world).failures if "contradicts" in f]


def test_the_scene_numbers_reach_the_model():
    """A guard that only rejects is a worse tool than a prompt that prevents."""
    from app import manifests
    from app.ai.prompts import mission_gen as prompt

    world = manifests.get("el_forn")
    _, task = prompt.build(
        world, target_concept="variables", carried_concepts=[],
        scene_id="bakery_gameplay", scaffold={},
    )

    assert "FIXED NUMBERS" in task
    assert "tray_capacity = 8" in task
    # And the buttons, because a mission needing a verb the scene lacks is unplayable.
    assert "bake" in task and "serve" in task
    # The numbers alone were not enough: the model read them and still renumbered the
    # tray in phase 6, because "the world changes" invites exactly that.
    assert "PHASE 6 TWIST MAY NOT CHANGE" in task


def test_a_world_with_no_interactive_scene_still_validates():
    """Only el_forn has a running demo. The other two must not need a `simulation`."""
    from app import manifests
    from app.ai.prompts import mission_gen as prompt

    for world_id in ("el_mahatta", "isharet_cairo"):
        world = manifests.get(world_id)
        assert world.simulation is None
        _, task = prompt.build(
            world, target_concept="variables", carried_concepts=[],
            scene_id=world.scenes[0].id, scaffold={},
        )
        assert "FIXED NUMBERS" not in task


def test_every_animation_named_is_one_the_client_implements():
    """Four of the old names rendered nothing at all.

    `trays_into_oven`, `loaves_appear`, `count_up` and `tray_burns` were in the manifest
    and in no state machine; `tray_burns` had no artwork either. A mission naming one was
    valid, solvable, and showed a still image.
    """
    from app import manifests

    animations = set(manifests.get("el_forn").visual.animations)
    assert not animations & {"trays_into_oven", "loaves_appear", "count_up", "tray_burns"}
    # The phases bakery-v2 really runs.
    assert {"loading", "baking", "retrieving", "stocking", "handover"} <= animations


def test_the_committed_example_mission_still_validates():
    """It is used as a fixture in several tests, so a stale one fails them confusingly.

    It went stale exactly once: after the bakery-v2 merge it named three animations that
    no longer exist, and had to be regenerated.
    """
    from app import manifests
    from app.ai.phase_guards import validate_phases

    report = validate_phases(_example_mission(), manifests.get("el_forn"))
    assert report.ok, report.failures


# ------------------------------------------------------- the actions vocabulary


def _with_action(action: dict):
    """The committed example mission, carrying one action on its guided phase."""
    import json
    import pathlib

    from app.schemas import phases as P

    example = pathlib.Path(__file__).resolve().parents[1] / "docs" / "example-mission-response.json"
    mission = P.PhasedMissionOut.model_validate(json.loads(example.read_text(encoding="utf-8"))["data"])
    mission.phases.guided.on_run.actions = [P.WorldAction.model_validate(action)]
    return mission


def _guided_failures(mission):
    from app import manifests
    from app.ai.phase_guards import validate_phases

    return [f for f in validate_phases(mission, manifests.get("el_forn")).failures if "guided.on_run" in f]


def test_the_world_declares_what_a_mission_may_do_to_it():
    """The third fence. `sprites` says what can be drawn, `animations` what can move, and
    `actions` what a mission may act upon — the piece that was missing, and the reason a
    mission could not say "put two loaves in Amina's hands"."""
    from app import manifests

    visual = manifests.get("el_forn").visual
    assert {a.id for a in visual.actions} == {"bind", "write", "give", "face", "set", "focus"}
    assert visual.can_act("give")
    assert not visual.can_act("teleport")


def test_a_world_with_no_interactive_client_declares_none():
    """Only el_forn has a scene that can act. The other two must keep loading."""
    from app import manifests

    for world_id in ("el_mahatta", "isharet_cairo"):
        assert manifests.get(world_id).visual.actions == []


@pytest.mark.parametrize(
    ("label", "action", "expect"),
    [
        ("invented verb", {"do": "teleport", "target": "loaf"}, "is not one this world can perform"),
        ("bad target", {"do": "give", "target": "ambulance"}, "cannot be aimed at"),
        ("missing target", {"do": "give"}, "needs a target"),
        ("target on a targetless verb", {"do": "focus", "target": "loaf"}, "takes no target"),
    ],
)
def test_an_action_the_client_cannot_perform_is_rejected(label, action, expect):
    """Worse than an unknown animation. A missing animation leaves the scene still; a
    missing action leaves the *story* broken — the mission says Amina was handed bread,
    she was not, and the next phase talks as though she was."""
    failures = _guided_failures(_with_action(action))
    assert failures, label
    assert expect in failures[0], failures[0]


def test_a_code_driven_action_must_say_where_its_value_comes_from():
    """`bind` and `write` exist so the world reacts to what the code *produced* rather
    than to whether it passed. One carrying a hardcoded value is a mission pretending to
    react while showing a constant."""
    assert any("must say which variable" in f for f in _guided_failures({"do": "bind", "target": "loaf"} and _with_action({"do": "bind", "target": "loaf"})))

    fixed = _guided_failures(_with_action({"do": "bind", "target": "loaf", "value": 8, "from_variable": "x"}))
    assert any("carries a fixed value" in f for f in fixed)


def test_a_fixed_action_may_not_claim_to_read_the_students_code():
    """The reverse mistake: `face` is not driven by their code, so a `from_variable` on it
    would silently do nothing."""
    failures = _guided_failures(_with_action({"do": "face", "target": "amina", "from_variable": "mood"}))
    assert any("would be ignored" in f for f in failures)


@pytest.mark.parametrize(
    "action",
    [
        {"do": "bind", "target": "loaf", "from_variable": "loaves_per_tray"},
        {"do": "write", "target": "shop_sign", "from_variable": "return"},
        {"do": "give", "target": "amina"},
        {"do": "set", "target": "oven", "value": "lit"},
        {"do": "face", "target": "youssef", "value": "puzzled"},
        {"do": "focus"},
    ],
)
def test_a_well_formed_action_is_accepted(action):
    assert not _guided_failures(_with_action(action))


def test_the_model_is_told_which_actions_it_may_use():
    """A guard that only rejects is worse than a prompt that prevents. The targets are
    spelled out because the failure worth avoiding is not an invented verb — the validator
    catches that — but a real verb aimed at something it does not accept."""
    from app import manifests
    from app.ai.prompts import mission_gen as prompt

    _, task = prompt.build(
        manifests.get("el_forn"), target_concept="variables", carried_concepts=[],
        scene_id="bakery_gameplay", scaffold={},
    )
    assert "ACTIONS —" in task
    assert "bind" in task and "aim it at: loaf" in task
    # And nothing is offered to a world that cannot act on anything.
    _, other = prompt.build(
        manifests.get("el_mahatta"), target_concept="variables", carried_concepts=[],
        scene_id=manifests.get("el_mahatta").scenes[0].id, scaffold={},
    )
    assert "ACTIONS —" not in other
