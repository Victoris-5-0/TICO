import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { bakeryScene, fixtures, fixtureNames, isWorldProp, propAssetUrls, propSrc, worldPropNames, worldProps } from "./scene-manifest";
import { ORDER_LOAVES, ORDER_TOTAL, PROP_NAMES, TOUR } from "./world-tour";
import { BATCH_SIZE, bakeryReducer, initialBakeryState, type BakeryState, type Phase } from "./simulation";

/**
 * The tour is authored data with no server behind it, so nothing at runtime would catch a
 * stop naming a prop that does not exist — the child would simply be shown a ring around
 * empty air while Hassan talks about a scale. These are the checks that would have caught
 * that, and they are cheap because the script is a plain array.
 */

const ACTORS = Object.keys(bakeryScene.actors);
const isDrawable = (name: string) => isWorldProp(name) || fixtureNames.includes(name) || ACTORS.includes(name);

test("every stop is bilingual, attributed, and reachable", () => {
  assert.ok(TOUR.length > 0);
  assert.equal(new Set(TOUR.map((stop) => stop.id)).size, TOUR.length, "stop ids must be unique");
  for (const stop of TOUR) {
    assert.ok(stop.ar.trim().length > 0, `${stop.id} has no Arabic`);
    assert.ok(stop.en.trim().length > 0, `${stop.id} has no English`);
    assert.ok(["tico", "hassan", "mariam"].includes(stop.speaker), `${stop.id} has no speaker`);
    assert.ok(["ask", "say", "watch"].includes(stop.kind), `${stop.id} has no kind`);
  }
});

test("only Am Hassan and TICO speak until the customer walks in", () => {
  // The opening was specified as the two of them alone. Mariam is the one exception, and
  // she may not speak before `arrive` has actually put her in the shop.
  assert.equal(TOUR[0].speaker, "tico");
  assert.equal(TOUR[1].speaker, "hassan");
  assert.match(TOUR[0].ar, /تيكو/);
  assert.match(TOUR[1].ar, /حسن/);
  const arrives = TOUR.findIndex((stop) => stop.action === "arrive");
  assert.ok(arrives > 0, "nobody ever arrives");
  for (const [i, stop] of TOUR.entries()) {
    if (stop.speaker === "mariam") assert.ok(i > arrives, `${stop.id} speaks before she is in the shop`);
    else assert.ok(stop.speaker === "tico" || stop.speaker === "hassan", `${stop.id} has an unexpected speaker`);
  }
});

test("everything a stop points at is something the scene can actually render", () => {
  for (const stop of TOUR) {
    if (!stop.look) continue;
    assert.ok(isDrawable(stop.look), `${stop.id} points at unknown ${stop.look}`);
  }
});

test("an ask always names the thing it is waiting to be clicked", () => {
  // Without a `look` an `ask` is unwinnable: nothing lights up, nothing is clickable, and
  // the tour stops dead with no Next button to rescue it.
  for (const stop of TOUR.filter((item) => item.kind === "ask")) {
    assert.ok(stop.look, `${stop.id} asks for a click with nothing to click`);
    assert.match(stop.ar, /اضغط/, `${stop.id} does not tell the child to press anything`);
  }
});

test("everything an ask waits on is something the scene makes clickable", () => {
  // `BakeryScene` only wires `onPick` onto loose props and fixtures. An ask pointing at
  // anything else — an actor, a prop drawn by `NeighborhoodDetails` — lights up, looks
  // exactly like a real target and does nothing, which is how the oven and the tray sat
  // dead through the first build of this screen.
  const clickable = new Set<string>([...worldPropNames, ...Object.keys(fixtures)]);
  for (const stop of TOUR.filter((item) => item.kind === "ask")) {
    assert.ok(clickable.has(stop.look!), `${stop.id} waits on ${stop.look}, which cannot be clicked`);
  }
});

test("the child presses something before most of what they are told", () => {
  const asks = TOUR.filter((stop) => stop.kind === "ask").length;
  assert.ok(asks >= 10, `only ${asks} things to press in ${TOUR.length} stops`);
});

test("every tappable thing has a name in both languages", () => {
  for (const stop of TOUR) {
    if (!stop.look) continue;
    assert.ok(PROP_NAMES[stop.look], `${stop.look} has no accessible name`);
    assert.ok(PROP_NAMES[stop.look].ar.trim() && PROP_NAMES[stop.look].en.trim(), `${stop.look} is missing a translation`);
  }
});

test("every action runs on a watch stop, and something is said after it", () => {
  // An action on an `ask` or a `say` would never fire: the player only dispatches on entry
  // to a stop, and only a `watch` holds the script still while the bakery does the work.
  const actions = TOUR.filter((stop) => stop.action);
  assert.ok(actions.length >= 4, `only ${actions.length} animated beats`);
  for (const stop of actions) {
    assert.equal(stop.kind, "watch", `${stop.id} carries an action but is a ${stop.kind}`);
    assert.ok(TOUR.indexOf(stop) < TOUR.length - 1, `${stop.id} ends the script on an animation`);
  }
});

test("the encounter is a sequence the reducer can actually play", () => {
  // The script promises a walk in, a handover, a payment and a walk out. This plays the
  // real reducer through every animated beat in script order, so a beat the simulation
  // would refuse — serving bread that was never baked, leaving before arriving, baking
  // onto a tray that is still full — fails here rather than in front of a child.
  const running = (s: BakeryState) => s.phase !== "idle" && s.phase !== "complete";
  const settle = (s: BakeryState) => {
    for (let i = 0; i < 2000 && running(s); i += 1) s = bakeryReducer(s, { type: "tick", ms: 100 });
    return s;
  };

  let state = initialBakeryState();
  const seen: Phase[] = [];
  for (const stop of TOUR) {
    if (!stop.action) continue;
    const started
      = stop.action === "arrive" ? bakeryReducer(state, { type: "arrive" })
      : stop.action === "bake" ? bakeryReducer(state, { type: "bake" })
      : stop.action === "serve" ? bakeryReducer(state, { type: "serve", count: ORDER_LOAVES, price: ORDER_TOTAL })
      : bakeryReducer(state, { type: "leave" });
    assert.ok(running(started), `${stop.id} was refused by the reducer`);
    assert.notEqual(started.notice, "full", `${stop.id} tried to bake onto a full tray`);
    assert.notEqual(started.notice, "empty", `${stop.id} tried to serve bread that is not there`);
    seen.push(started.phase);
    state = settle(started);
  }

  assert.deepEqual(seen, ["loading", "arriving", "handover", "exiting"]);
  assert.equal(state.money, ORDER_TOTAL, "the till never took the money");
  assert.equal(state.served.length, 1, "the customer never left");
  // Eight baked, five sold: the subtraction TICO says out loud has to be true.
  assert.equal(BATCH_SIZE - ORDER_LOAVES, 3);
  assert.equal(state.loaves.filter((loaf) => loaf.owner === "tray").length, BATCH_SIZE - ORDER_LOAVES);
});

test("the tour's frames exist as WebPs and stay inside a 1.5 MB prop budget", () => {
  const urls = propAssetUrls(worldPropNames);
  assert.ok(urls.length > 0);
  let bytes = 0;
  for (const url of urls) {
    const file = join(process.cwd(), "public", url);
    assert.equal(readFileSync(file).subarray(8, 12).toString(), "WEBP", url);
    bytes += statSync(file).size;
  }
  // Separate from the scene's own 1.5 MB budget in scene-manifest.test.ts: these load
  // alongside it, so the opening costs both. Keep an eye on the sum.
  assert.ok(bytes < 1_500_000, `Tour props are ${bytes} bytes`);
});

test("every placed prop has artwork, and sits inside the 1600x900 world", () => {
  for (const [name, at] of Object.entries(worldProps)) {
    assert.ok(statSync(join(process.cwd(), "public", propSrc(name as keyof typeof worldProps))).size > 0, `${name} has no file`);
    assert.ok(at.x >= 0 && at.y >= 0, `${name} starts off-canvas`);
    assert.ok(at.x + at.width <= 1600, `${name} runs off the right edge`);
    assert.ok(at.y + at.height <= 900, `${name} runs off the bottom`);
  }
});

test("no two props overlap, because they are all on screen at the same time", () => {
  // There is no camera: every prop is drawn in the one wide view for the whole tour, so
  // two props sharing a rectangle is a prop sitting on top of another one, and a click
  // target underneath a click target.
  const placed = worldPropNames;
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = worldProps[placed[i]];
      const b = worldProps[placed[j]];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert.ok(apart, `${placed[i]} overlaps ${placed[j]}`);
    }
  }
});

test("nothing is parked outside the shop except the delivery scooter", () => {
  // The instruction on the 2026-09-13 background was explicit: everything belongs to the
  // bakery, so it goes inside the arch. The arch runs from x=210 to x=1390 and its floor
  // from y=640 to y=690; the scooter is the one thing that is not bakery equipment, and it
  // is parked at the very left of the street.
  for (const name of worldPropNames) {
    const at = worldProps[name];
    if (name === "scooter-crate") {
      assert.ok(at.x < 250, "the scooter is parked at the far left of the street");
      assert.ok(at.y >= 690, "the scooter stands on the pavement, not in the shop");
      continue;
    }
    assert.ok(at.x >= 210 && at.x + at.width <= 1390, `${name} is outside the arch`);
    assert.ok(at.y + at.height <= 690, `${name} is past the shop floor`);
  }
});

test("props are sized against the baker, not the old shopfront", () => {
  // Everything was cut down when the background changed. The baker is 250 tall for about
  // 1.75 m, so a bakery prop taller than he is would be a mistake rather than a choice.
  for (const name of worldPropNames) {
    if (name === "scooter-crate") continue;
    assert.ok(worldProps[name].height < bakeryScene.bakerSize, `${name} is taller than the baker`);
  }
});
