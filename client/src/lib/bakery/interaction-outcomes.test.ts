import { test } from "node:test";
import assert from "node:assert/strict";
import { interactionsOf, missionSceneState, resolveChange, settledProps } from "./mission-scene";

test("a second customer arrives at the back without replacing the first", () => {
  const state = missionSceneState({ props: { queue: 2, customer: "hoda,omar", loaf: 3 }, animate: "arriving" });
  assert.deepEqual(state.queue, ["hoda", "omar"]);
  assert.equal(state.active, "omar");
});

test("a served customer carries the ordered bread and a zero queue stays empty", () => {
  const state = missionSceneState({ props: { queue: 1, customer: "mariam", loaf: 3, give: 5 }, animate: "handover" });
  assert.equal(state.loaves.filter((loaf) => loaf.owner === "tray").length, 3);
  assert.equal(state.loaves.filter((loaf) => loaf.owner === "handover:mariam").length, 5);
  assert.deepEqual(missionSceneState({ props: { queue: 0, customer: "mariam" } }).queue, []);
});

test("transitioning after payment retains the final queue, stock and takings", () => {
  const state = settledProps({ props: { loaf: 8 }, steps: [
    { props: { customer: "mariam", queue: 1, loaf: 3, total_price: 25 } },
    { props: { customer: "", queue: 0 } },
  ] }, { "flour-sack": 3 });
  assert.deepEqual(state, { "flour-sack": 3, loaf: 3, customer: "", queue: 0, total_price: 25 });
});

test("bindings use actual Python values in both resting props and animation beats", () => {
  const resolved = resolveChange({ props: { stock_count: "= remaining" }, steps: [{ props: { sign: "= sign" } }] }, { remaining: "3", sign: "'open'" });
  assert.equal(resolved.props?.stock_count, 3);
  assert.equal(resolved.steps?.[0].props?.sign, "open");
});

test("older sign missions retain their click while explicit interactions use their own outcome", () => {
  assert.equal(interactionsOf({ props: { press: "sign" } })[0].onPress.props?.sign, "open");
  assert.equal(interactionsOf({ interactions: [{ target: "tray", promptAr: "Count", onPress: { props: { stock_count: 3 } } }] })[0].onPress.props?.stock_count, 3);
});
