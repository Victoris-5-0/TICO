import { test } from "node:test";
import assert from "node:assert/strict";
import { CUSTOMER_IDS, CUSTOMER_ORDER_SIZES, bakeryReducer, initialBakeryState, type BakeryState } from "./simulation";
import { getCustomerOrders, customerTimeLabel, CUSTOMER_PROFILES } from "./customer-orders";

test("custom orders match the actual simulation quantities", () => {
  const orders = getCustomerOrders(initialBakeryState());
  assert.equal(new Set(Object.values(orders).map((order) => order.loaves)).size, 3);
  for (const id of CUSTOMER_IDS) assert.equal(orders[id].loaves, CUSTOMER_ORDER_SIZES[id]);
  assert.equal(Object.values(orders).reduce((sum, order) => sum + order.loaves, 0), 16);
});

test("one playback clock drives patience; idle, pause, hidden and invalid ticks freeze it", () => {
  const idle = initialBakeryState();
  const playing = bakeryReducer(idle, { type: "demo" });
  const tick = (state: BakeryState, ms: number) => bakeryReducer(state, { type: "tick", ms });
  for (const state of [idle, { ...playing, paused: true }, { ...playing, hidden: true }]) {
    assert.deepEqual(getCustomerOrders(tick(state, 15000)), getCustomerOrders(state));
  }
  for (const ms of [NaN, Infinity, -1, 0]) assert.deepEqual(tick(playing, ms), playing);
  const stalled = tick(playing, 90000);
  assert.equal(getCustomerOrders(stalled).dina.patience, CUSTOMER_PROFILES.dina.maxPatience - 1);
  assert.deepEqual(getCustomerOrders(bakeryReducer(stalled, { type: "reset" })), getCustomerOrders(idle));
});

test("different customers become impatient at different times and zero means hurry", () => {
  const state = { ...initialBakeryState(), playbackElapsed: 15000 };
  const orders = getCustomerOrders(state);
  assert.equal(orders.dina.urgency, "rush");
  assert.equal(orders.dina.patience, 3);
  assert.equal(orders.hoda.urgency, "calm");
  assert.equal(orders.mariam.urgency, "hurry");
  const expired = getCustomerOrders({ ...state, playbackElapsed: 90000 }).dina;
  assert.equal(expired.patience, 0);
  assert.equal(customerTimeLabel(expired, "en"), "In a hurry!");
});

test("thanks only appears once the handoff has completed", () => {
  const state: BakeryState = { ...initialBakeryState(), phase: "handover", active: "mariam" };
  assert.notEqual(getCustomerOrders(state).mariam.urgency, "served");
  const served = getCustomerOrders({ ...state, phase: "exiting" }).mariam;
  assert.equal(served.urgency, "served");
  assert.equal(customerTimeLabel(served, "en"), "Thanks!");
});

test("Arabic localizes names, mood, seconds and served state", () => {
  const orders = getCustomerOrders(initialBakeryState(), "ar-EG");
  assert.equal(orders.mariam.customerName, "مريم");
  assert.equal(customerTimeLabel(orders.mariam, "ar-EG"), "٢٤ ث");
  const served = getCustomerOrders({ ...initialBakeryState(), served: ["mariam"] }, "ar-EG");
  assert.equal(customerTimeLabel(served.mariam, "ar-EG"), "شكراً!");
});

test("mission scenes without preview order data retain the authored two-loaf baseline", () => {
  const orders = getCustomerOrders({ ...initialBakeryState(), orderSizes: undefined, playbackElapsed: undefined });
  for (const id of CUSTOMER_IDS) assert.equal(orders[id].loaves, 2);
});
