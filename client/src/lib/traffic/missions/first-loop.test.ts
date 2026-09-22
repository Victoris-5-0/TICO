import assert from "node:assert/strict";
import test from "node:test";

import { firstTrafficLoopMission } from "./first-loop";

test("the first traffic mission connects interaction, loop code, and visible consequences", () => {
  const mission = firstTrafficLoopMission("traffic-loop-1");
  const { encounter, guided, remix } = mission.phases;

  assert.equal(mission.targetConceptId, "loops");
  assert.ok(encounter.world);
  assert.equal(encounter.world.interactions?.length, 2);
  assert.equal(encounter.world.interactions?.[0].onPress.steps?.[0].animate, "signal_countdown");
  assert.equal(encounter.world.interactions?.[0].onPress.steps?.[0].props?.timer_seconds, 5);
  assert.equal(guided.steps.length, 2);
  assert.deepEqual(guided.steps[0].blanks, ['"taxi", "bus", "tuktuk"']);
  assert.deepEqual(guided.steps[1].blanks, ["cars", "1"]);
  assert.equal(guided.steps[0].onEnter?.animate, "officer_point");
  assert.equal(guided.steps[0].onEnter?.props?.cars_visible, 0);
  assert.equal(guided.steps[0].onRun?.animate, "cars_arrive");
  assert.equal(guided.onRun?.steps?.some((beat) => beat.animate === "cars_arrive"), false);
  assert.equal(guided.onRun?.steps?.filter((beat) => beat.animate === "cars_move").length, 3);
  assert.equal(guided.onRun?.steps?.filter((beat) => beat.animate === "signal_countdown").length, 2);
  assert.equal(guided.onRun?.steps?.filter((beat) => beat.animate === "pedestrians_cross").length, 1);
  assert.equal(guided.onRun?.props?.pedestrians_crossed, 4);
  assert.equal(remix.tests[0].expected, "5");
  assert.equal(remix.onRun?.steps?.filter((beat) => beat.animate === "cars_move").length, 5);
  assert.equal(remix.onRun?.steps?.some((beat) => beat.animate === "cars_arrive"), false);
  assert.equal(remix.worldChange.animate, "cars_arrive");
  assert.equal(remix.worldChange.props?.cars_visible, 5);
  assert.equal(remix.onRun?.steps?.filter((beat) => beat.animate === "pedestrians_cross").length, 1);
});
