import { test } from "node:test";
import assert from "node:assert/strict";

import { boundValue, worldAt, type LessonPhase } from "../script";
import { fixtures, isWorldProp, worldPropNames } from "../scene-manifest";
import { BATCH_SIZE, bakeryReducer, initialBakeryState, type BakeryState, type Phase } from "../simulation";
import { PROP_NAMES } from "../world-tour";
import { AUTHORED, authoredFor } from "./index";
import { FIRST_ORDER, LOAF_PRICE, OPENING_MESSAGE, SECOND_ORDER } from "./opening-message";

/**
 * The authored first mission, checked the way `ai/guards.py` checks a generated one: does
 * it name anything the client cannot draw, and can the world actually perform it?
 *
 * The playthrough at the bottom is the one that matters. An earlier draft had the customer
 * come back for seven loaves when three were left — a mission that stops dead with no way
 * forward and no error anywhere, because the reducer simply refuses and says nothing.
 */

const RUNGS: LessonPhase[] = ["encounter", "explore", "discover", "understand", "guided", "remix"];
const running = (s: BakeryState) => s.phase !== "idle" && s.phase !== "complete";
const settle = (s: BakeryState) => {
  for (let i = 0; i < 4000 && running(s); i += 1) s = bakeryReducer(s, { type: "tick", ms: 100 });
  return s;
};

test("the lesson is reachable by the slug the play route redirects with", () => {
  // `play/[lessonSlug]` redirects to the mission with `?lesson=<slug>`, and the page looks
  // the script up by that slug. A mismatch here is a mission that silently falls back to
  // whatever the generated row happens to hold.
  assert.ok(authoredFor("opening-message"), "lesson 1 has no authored script");
  assert.equal(authoredFor("opening-message")!.script, OPENING_MESSAGE);
  assert.equal(authoredFor("count-the-trays"), null, "a lesson claims a script it does not have");
  assert.equal(authoredFor(null), null);
  for (const [slug, mission] of Object.entries(AUTHORED)) {
    assert.ok(mission.titleAr.trim() && mission.titleEn.trim(), `${slug} has no title`);
  }
});

test("the six rungs are all there, in order", () => {
  const seen = OPENING_MESSAGE.map((stop) => stop.phase).filter(Boolean) as LessonPhase[];
  assert.deepEqual([...new Set(seen)], RUNGS, "a rung is missing or out of order");
  for (const stop of OPENING_MESSAGE) assert.ok(stop.phase, `${stop.id} belongs to no rung`);
});

test("the variables lesson teaches variables and nothing else", () => {
  // The generated mission for this lesson taught `def calculate_flour_weight(...)`: a
  // function, in the lesson before functions exist anywhere in the curriculum.
  for (const stop of OPENING_MESSAGE) {
    if (!stop.code) continue;
    for (const code of [stop.code.starter, stop.code.solution]) {
      assert.doesNotMatch(code, /\bdef\b|\blambda\b/, `${stop.id} defines a function`);
      assert.doesNotMatch(code, /\bif\b|\bfor\b|\bwhile\b/, `${stop.id} uses control flow`);
    }
  }
});

test("they read the finished code before they are asked to write any", () => {
  const typing = OPENING_MESSAGE.filter((stop) => stop.kind === "code");
  assert.ok(typing.length >= 3, "one typing step is not a lesson");
  assert.equal(typing[0].phase, "understand");
  assert.equal(typing[0].code!.readOnly, true, "the understand rung is editable");
  for (const stop of typing.slice(1)) {
    assert.notEqual(stop.code!.readOnly, true, `${stop.id} never lets them type`);
  }
});

test("every solution solves its own step, and no step starts already solved", () => {
  for (const stop of OPENING_MESSAGE) {
    if (!stop.code) continue;
    const { binding, starter, solution, answer, tests } = stop.code;
    assert.equal(boundValue(solution, binding), answer, `${stop.id}: the solution is not the answer`);
    assert.ok(tests.length > 0, `${stop.id} has no tests`);
    for (const check of tests) {
      assert.equal(check.call, binding, `${stop.id} tests something other than its binding`);
      assert.equal(check.expected, String(answer), `${stop.id}: the test disagrees with the answer`);
    }
    // A starter that already reads as the answer lets them press Run and pass untouched.
    if (!stop.code.readOnly) {
      assert.notEqual(boundValue(starter, binding), answer, `${stop.id} is already solved`);
    }
  }
});

test("the shop starts shut, opens, and the flour runs down", () => {
  assert.equal(worldAt(OPENING_MESSAGE, 0).open, false, "the day starts with the shop already open");
  assert.equal(worldAt(OPENING_MESSAGE, OPENING_MESSAGE.length - 1).open, true, "the shop never opens");
  const first = worldAt(OPENING_MESSAGE, 0).sacks;
  const last = worldAt(OPENING_MESSAGE, OPENING_MESSAGE.length - 1).sacks;
  assert.ok(last < first, "baking costs nothing");
  for (let i = 0; i < OPENING_MESSAGE.length; i += 1) {
    const { sacks } = worldAt(OPENING_MESSAGE, i);
    assert.ok(sacks >= 0 && sacks <= 4, `${OPENING_MESSAGE[i].id} asks for ${sacks} sacks`);
  }
  assert.equal(OPENING_MESSAGE.filter((s) => s.kind === "ask" && s.look === "sign").length, 1);
});

test("everything an ask waits on is something the scene makes clickable", () => {
  const clickable = new Set<string>([...worldPropNames, ...Object.keys(fixtures), "sign"]);
  for (const stop of OPENING_MESSAGE.filter((s) => s.kind === "ask")) {
    assert.ok(stop.look, `${stop.id} asks for a click with nothing to click`);
    assert.ok(clickable.has(stop.look), `${stop.id} waits on ${stop.look}, which cannot be clicked`);
    assert.match(stop.ar, /اضغط/, `${stop.id} never says to press anything`);
    if (isWorldProp(stop.look)) assert.ok(PROP_NAMES[stop.look], `${stop.look} has no accessible name`);
  }
});

test("each question has exactly one right answer", () => {
  const asked = OPENING_MESSAGE.filter((s) => s.kind === "choose");
  assert.ok(asked.length >= 2, "one round is not an exploration");
  for (const stop of asked) {
    assert.ok(stop.answers?.length, `${stop.id} asks with no answers`);
    assert.equal(stop.answers!.filter((a) => a.correct).length, 1, `${stop.id} has more than one right answer`);
  }
});

test("every animated beat runs on a watch stop and is followed by something", () => {
  const acting = OPENING_MESSAGE.filter((s) => s.action);
  assert.ok(acting.length >= 4, `only ${acting.length} animated beats`);
  for (const stop of acting) {
    assert.equal(stop.kind, "watch", `${stop.id} carries an action but is a ${stop.kind}`);
    assert.ok(OPENING_MESSAGE.indexOf(stop) < OPENING_MESSAGE.length - 1, `${stop.id} ends on an animation`);
  }
});

test("the bakery can perform the mission as written", () => {
  let state = initialBakeryState();
  const seen: Phase[] = [];
  const ordered = (upTo: number) =>
    [...OPENING_MESSAGE].slice(0, upTo).reverse().find((s) => s.code)?.code?.answer ?? 2;

  for (const [index, stop] of OPENING_MESSAGE.entries()) {
    if (!stop.action) continue;
    const count = ordered(index);
    const started
      = stop.action === "arrive" ? bakeryReducer(state, { type: "arrive" })
      : stop.action === "bake" ? bakeryReducer(state, { type: "bake" })
      : stop.action === "serve" ? bakeryReducer(state, { type: "serve", count, price: count * LOAF_PRICE })
      : bakeryReducer(state, { type: "leave" });

    assert.ok(running(started), `${stop.id} was refused by the reducer`);
    assert.notEqual(started.notice, "full", `${stop.id} baked onto a full tray`);
    assert.notEqual(started.notice, "empty", `${stop.id} asked for bread that is not there`);
    seen.push(started.phase);
    state = settle(started);
  }

  assert.deepEqual(seen, ["loading", "arriving", "handover", "handover", "exiting"]);
  assert.equal(FIRST_ORDER + SECOND_ORDER, BATCH_SIZE, "the two orders do not come off one batch");
  assert.equal(state.money, (FIRST_ORDER + SECOND_ORDER) * LOAF_PRICE, "the till does not add up");
  assert.equal(state.loaves.filter((l) => l.owner === "tray").length, 0, "bread was left on the tray");
  assert.equal(state.served.length, 1, "the customer never left");
});
