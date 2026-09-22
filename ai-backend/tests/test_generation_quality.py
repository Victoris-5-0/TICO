"""The new traffic preview may vary in prose, never in its beginner learning arc."""

import ast

from app import manifests
from app.ai import phase_guards, traffic_beginner, traffic_pedestrians
from app.ai.chains import mission_gen
from app.ai.prompts import mission_gen as prompt
from app.rules import mission_builder


def _blueprint():
    world = manifests.get("isharet_cairo")
    mechanic = world.mechanics_for("loops")[0]
    blueprint = mission_builder.compose(world, mechanic, scaffold={"variables": "PARTIAL"}, seed=1)
    assert not blueprint.problems
    return world, mechanic, blueprint


def _mission():
    world, _, blueprint = _blueprint()
    return world, blueprint, traffic_pedestrians.build({}, blueprint, scaffold={"variables": "PARTIAL"})


def test_traffic_learning_curve_has_three_loop_stops_without_function_definitions():
    world = manifests.get("isharet_cairo")
    mechanics = world.mechanics_for("loops")
    assert [m.id for m in mechanics] == ["cross_each_pedestrian", "release_each_car", "release_regular_cars", "cycle_junctions"]
    assert [m.difficulty_band for m in mechanics] == [3, 3, 5, 7]
    for mechanic in mechanics:
        blueprint = mission_builder.compose(world, mechanic, seed=1)
        assert not blueprint.problems
        tree = ast.parse(blueprint.solution_code)
        assert any(isinstance(node, ast.For) for node in ast.walk(tree))
        assert not any(isinstance(node, ast.FunctionDef) for node in ast.walk(tree))


def test_live_traffic_stops_match_their_reviewed_fallbacks():
    world = manifests.get("isharet_cairo")
    assert mission_gen.mechanic_for_stop(world, "loops", 1).id == "release_each_car"
    assert mission_gen.mechanic_for_stop(world, "loops", 2).id == "cross_each_pedestrian"


def test_traffic_manifest_only_names_real_clicks_and_five_visible_cars():
    world = manifests.get("isharet_cairo")
    assert world.visual.interactive_targets == ["signal", "officer"]
    assert world.visual.sprites["cars_visible"].max_shown == 5
    assert {"car_arrive", "cars_arrive", "signal_countdown", "cars_move"} <= set(world.visual.animations)


def test_model_only_writes_prose_and_receives_authored_bakery_reference():
    world, mechanic, blueprint = _blueprint()
    system, task = prompt.build(
        world, target_concept="loops", carried_concepts=["variables"],
        scene_id="traffic_establishing", repetition=1, mechanic=mechanic, blueprint=blueprint,
    )
    assert prompt.PROMPT_VERSION == "mission_gen/v6-traffic-pedestrian-loop"
    assert "Do not output phases, code, or world props" in task
    assert "عم حسن" in task
    assert "not loops" in system


def test_reviewed_traffic_shape_passes_playability_and_code_guards():
    world, blueprint, mission = _mission()
    assert phase_guards.validate_phases(mission, world).ok
    quality = phase_guards.validate_generation_quality(mission, world, blueprint=blueprint)
    assert quality.ok, quality.failures
    assert "def " not in mission.phases.understand.code
    assert mission.phases.guided.steps[0].tests[0].call == "crossed_count"
    assert "for person in ___:" in mission.phases.guided.steps[0].code
    assert mission.phases.guided.steps[1].tests[0].call == "crossed_count"
    assert mission.phases.guided.steps[1].blanks == ["person", "people", "1"]
    assert not any(
        beat.animate == "cars_arrive"
        for change in (mission.phases.understand.on_run, mission.phases.guided.on_run, mission.phases.remix.on_run)
        for beat in change.steps
    )
    assert mission.phases.remix.world_change.props["waiting_pedestrians"] == 4
    assert mission.phases.remix.world_change.animate == "officer_point"
    assert [note.line for note in mission.phases.understand.annotations] == [1, 2, 3, 4]


def test_model_story_cannot_make_the_unlit_signal_red_before_first_click():
    world, _, blueprint = _blueprint()
    mission = traffic_pedestrians.build(
        {"encounter_line_ar": "أنا كريم وعلي ونادية مستنيين على الرصيف."},
        blueprint,
        scaffold={},
    )
    assert "علي ونادية" in mission.phases.encounter.line_ar
    assert phase_guards.validate_phases(mission, world).ok


def test_quality_rejects_nonprogressive_flow_and_scene_jumps():
    world, blueprint, mission = _mission()
    mission.phases.explore.rounds[0].question_ar = "كام عربية؟"
    mission.phases.guided.steps[0].code = 'people = [___]'
    mission.phases.remix.world_change.props["waiting_pedestrians"] = 2
    quality = phase_guards.validate_generation_quality(mission, world, blueprint=blueprint)
    assert not quality.ok
    assert any("variables or repetition" in reason for reason in quality.failures)
    assert any("complete and run a for loop" in reason for reason in quality.failures)
    assert any("new people must be visible" in reason for reason in quality.failures)


def test_extra_click_and_short_countdown_are_rejected_without_crashing():
    world, blueprint, mission = _mission()
    interactions = mission.phases.encounter.world.interactions
    interactions[0].on_press.steps[0].props["timer_seconds"] = 3
    interactions.append(interactions[1].model_copy(deep=True))
    quality = phase_guards.validate_generation_quality(mission, world, blueprint=blueprint)
    assert any("last 5 seconds" in reason for reason in quality.failures)
    assert any("exactly 2 scene interactions" in reason for reason in quality.failures)


def test_second_traffic_mission_reuses_the_queue_without_reintroducing_cars_on_run():
    world = manifests.get("isharet_cairo")
    mechanic = world.mechanics_for("loops")[1]
    blueprint = mission_builder.compose(world, mechanic, seed=2)
    mission = traffic_beginner.build({}, blueprint, scaffold={})
    assert phase_guards.validate_phases(mission, world).ok
    assert phase_guards.validate_generation_quality(mission, world, blueprint=blueprint).ok
    for change in (
        mission.phases.understand.on_run,
        mission.phases.guided.steps[1].on_run,
        mission.phases.guided.on_run,
        mission.phases.remix.on_run,
    ):
        assert not any(beat.animate == "cars_arrive" for beat in change.steps)
