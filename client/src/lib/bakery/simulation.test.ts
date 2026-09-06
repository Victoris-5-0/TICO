import { test } from "node:test";
import assert from "node:assert/strict";
import { bakeryReducer as reduce, initialBakeryState, CUSTOMER_IDS, isBusy, readyLoaves, type BakeryState, type Phase } from "./simulation";

function until(state: BakeryState, phase: Phase): BakeryState {
  for (let i = 0; i < 2000; i++) {
    if (state.phase === phase) return state;
    state = reduce(state, { type: "tick", ms: 100 });
  }
  throw new Error(`Did not reach ${phase}`);
}
function stockTray() { return until(reduce(initialBakeryState(), { type: "bake" }), "idle"); }
function assertInventory(state: BakeryState) {
  assert.equal(new Set(state.loaves.map((loaf) => loaf.id)).size, state.loaves.length);
  assert.equal(state.loaves.length, state.batches * 8);
  assert.equal(state.queue.length + state.served.length, 8);
  assert.deepEqual([...state.served, ...state.queue], CUSTOMER_IDS);
  for (const id of state.served) assert.equal(state.loaves.filter((loaf) => loaf.owner === `customer:${id}`).length, 2);
}
test("starts with eight distinct customers, an empty tray and no automatic playback", () => {
  const state = initialBakeryState();
  assert.equal(state.queue.length, 8);
  assert.equal(state.loaves.length, 0);
  assert.equal(state.auto, false);
});
test("empty service explains the missing batch and changes no inventory", () => {
  const next = reduce(initialBakeryState(), { type: "serve" });
  assert.equal(next.notice, "empty");
  assert.equal(next.phase, "idle");
  assert.equal(next.served.length, 0);
  assert.equal(next.loaves.length, 0);
});
test("bread ownership follows dough, oven, peel and tray", () => {
  let state = reduce(initialBakeryState(), { type: "bake" });
  for (const [phase, owner] of [["loading", "dough"], ["baking", "oven"], ["retrieving", "peel"], ["stocking", "peel"], ["idle", "tray"]] as const) {
    state = until(state, phase);
    assert.equal(state.loaves.length, 8);
    assert.ok(state.loaves.every((loaf) => loaf.owner === owner));
  }
});
test("one baker operation at a time, including rapid repeated clicks", () => {
  const baking = reduce(initialBakeryState(), { type: "bake" });
  for (const type of ["bake", "serve", "demo"] as const) assert.deepEqual(reduce(baking, { type }), baking);
  const serving = reduce(stockTray(), { type: "serve" });
  for (const type of ["bake", "serve", "demo"] as const) assert.deepEqual(reduce(serving, { type }), serving);
  assert.equal(readyLoaves(serving).length, 6);
});
test("serve FIFO, transfer exactly two loaves, then advance the queue", () => {
  let state = reduce(stockTray(), { type: "serve" });
  assert.equal(state.active, "mariam");
  assert.equal(state.loaves.filter((loaf) => loaf.owner === "handover:mariam").length, 2);
  state = until(state, "exiting");
  assert.equal(state.loaves.filter((loaf) => loaf.owner === "customer:mariam").length, 2);
  state = until(state, "idle");
  assert.deepEqual(state.served, ["mariam"]);
  assert.equal(state.queue[0], "nour");
  assertInventory(state);
});
test("full tray does not permit another batch", () => {
  const state = reduce(stockTray(), { type: "bake" });
  assert.equal(state.notice, "full");
  assert.equal(state.batches, 1);
  assert.equal(readyLoaves(state).length, 8);
});
test("pause and visibility freeze every phase without changing ownership", () => {
  for (const phase of ["loading", "baking", "retrieving", "stocking", "handover", "exiting", "advancing"] as const) {
    const state = until(reduce(initialBakeryState(), { type: "demo" }), phase);
    const paused = reduce(state, { type: "pause" });
    assert.deepEqual(reduce(paused, { type: "tick", ms: 90000 }), paused);
    assert.deepEqual(reduce(paused, { type: "pause" }), state);
    const hidden = reduce(state, { type: "visibility", hidden: true });
    assert.deepEqual(reduce(hidden, { type: "tick", ms: 90000 }), hidden);
    assert.deepEqual(reduce(hidden, { type: "visibility", hidden: false }), state);
  }
});
test("reset mid-handoff removes reservations and prevents stale completion", () => {
  const mid = reduce(reduce(stockTray(), { type: "serve" }), { type: "tick", ms: 800 });
  const reset = reduce(mid, { type: "reset" });
  assert.deepEqual(reset, initialBakeryState());
  assert.deepEqual(reduce(reset, { type: "tick", ms: 30000 }), reset);
});
test("demo completes eight customers with two batches, preserving inventory at each step", () => {
  let state = reduce(initialBakeryState(), { type: "demo" });
  for (let i = 0; i < 10000 && isBusy(state); i++) {
    assertInventory(state);
    state = reduce(state, { type: "tick", ms: 50 });
  }
  assert.equal(state.phase, "complete");
  assert.deepEqual(state.served, CUSTOMER_IDS);
  assert.equal(state.batches, 2);
  assert.equal(state.loaves.length, 16);
  assert.equal(readyLoaves(state).length, 0);
  assert.equal(state.auto, false);
  assertInventory(state);
});
test("invalid deltas are ignored and long stalls cannot skip a phase", () => {
  const state = reduce(initialBakeryState(), { type: "bake" });
  for (const ms of [NaN, Infinity, -1, 0]) assert.deepEqual(reduce(state, { type: "tick", ms }), state);
  const stalled = reduce(state, { type: "tick", ms: 90000 });
  assert.equal(stalled.phase, "loading");
  assert.equal(stalled.elapsed, 1000);
});
