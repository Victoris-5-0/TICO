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
