import assert from "node:assert/strict";
import test from "node:test";

import { missionSceneDuration, missionSceneState } from "./mission-scene";
import { DURATIONS } from "./simulation";

test("generated handover includes bread transfer followed by payment", () => {
  assert.equal(missionSceneDuration("handover"), DURATIONS.handover + DURATIONS.paying);

  const handing = missionSceneState({ props: { loaf: 2 }, animate: "handover", progress: 0.25 });
  assert.equal(handing.phase, "handover");
  assert.equal(handing.active, "mariam");
  assert.ok(handing.loaves.every((loaf) => loaf.owner === "handover:mariam"));

  const paying = missionSceneState({ props: { loaf: 2 }, animate: "handover", progress: 0.8 });
  assert.equal(paying.phase, "paying");
  assert.equal(paying.active, "mariam");
  assert.ok(paying.loaves.every((loaf) => loaf.owner === "customer:mariam"));
});

test("mission props still control the visible loaf count", () => {
  const state = missionSceneState({ props: { loaf: 5 } });
  assert.equal(state.loaves.length, 5);
});
