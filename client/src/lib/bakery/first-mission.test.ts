import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PhasedMissionOut } from "@/lib/ai/types";
import { flourSacks, isScenePhase, queueLength, shopOpen, undrawnProps } from "./mission-scene";
import { bakeryScene, fixtures, worldPropNames } from "./scene-manifest";
import { CUSTOMER_IDS } from "./simulation";

/**
 * The authored first mission, checked the way `ai/guards.py` checks a generated one.
 *
 * A mission written by hand and imported from a file never passes through that validator,
 * so it gets the equivalent here — on the client, against what the client actually draws.
 * Reading across into `ai-backend/content/` is the same build-time coupling the pin script
 * already has; nothing at runtime crosses that line.
 */

/**
 * Both `variables-1` rows, deliberately.
 *
 * Which row a student is served is decided by `startForLesson` and, when the AI service is
 * unreachable, by `startForStudent` picking from the pool. There is more than one row for
 * this lesson, so authoring into one of them is a coin flip — content went into the wrong
 * one twice before this test existed. Both files carry the same mission, and the last test
 * here proves they still do.
 */
const IDS = ["cmtwklihyqt4p01z00z8ue6zx", "cmtyoknlbyf1t05b421irls62"] as const;
const load = (id: string) => {
  const file = join(process.cwd(), "..", "ai-backend", "content", "prebuilt", `variables-1-${id}.json`);
  return (JSON.parse(readFileSync(file, "utf8")) as { data: PhasedMissionOut }).data;
};

const mission = load(IDS[0]);
const phases = mission.phases;
const everyCode = () => [
  phases.understand.code,
  phases.guided.solutionCode,
  phases.remix.startingCode,
  phases.remix.solutionCode,
  ...phases.guided.steps.map((s) => s.code),
];
const everyChange = () => [phases.understand.onRun, phases.guided.onRun, phases.remix.onRun, phases.remix.worldChange];

test("all six phases are present and it is the variables lesson", () => {
  for (const key of ["encounter", "explore", "discover", "understand", "guided", "remix"] as const) {
    assert.ok(phases[key], `${key} is missing`);
  }
  assert.equal(mission.targetConceptId, "variables");
  assert.ok(mission.validated, "an unvalidated mission is never shown");
});

test("the variables lesson teaches variables and nothing else", () => {
  // The generated mission this replaced taught `def calculate_flour_weight(...)`: a
  // function, in the lesson before functions exist anywhere in the curriculum.
  for (const code of everyCode()) {
    assert.doesNotMatch(code, /\bdef\b|\blambda\b/, "mission one defines a function");
    assert.doesNotMatch(code, /\bif\b|\bfor\b|\bwhile\b/, "mission one uses control flow");
  }
});

test("the very first thing they write is the shop sign", () => {
  // The whole ramp rests on this: one word, and the world visibly changes. A first step
  // that is arithmetic, or that needs two lines, is a jump.
  const first = phases.guided.steps[0];
  assert.match(first.code, /^sign = /, "the first line is not the sign");
  assert.equal(first.blanks.length, 1, "the first step asks for more than one thing");
  assert.deepEqual(first.blanks, ["open"]);
  assert.equal(phases.understand.code.split("\n").length, 1, "they are shown more than one line first");
});

test("the ramp is one word, then one number — and nothing steeper", () => {
  const lines = (code: string) => code.split("\n").filter((l) => l.trim()).length;
  assert.equal(lines(phases.guided.solutionCode), 1, "the guided rung is more than one line");
  assert.equal(lines(phases.remix.solutionCode), 2, "the twist adds more than one line");
  assert.ok(phases.remix.solutionCode.startsWith(phases.guided.solutionCode), "the twist rewrites their work");
  assert.equal(phases.remix.startingCode, phases.guided.solutionCode, "their line is not carried forward");
  // Old behaviour must survive the twist, or being right becomes temporary.
  for (const earlier of phases.guided.tests) {
    assert.ok(
      phases.remix.tests.some((later) => later.call === earlier.call && later.expected === earlier.expected),
      `the twist drops the earlier check on ${earlier.call}`,
    );
  }
});

test("every blank is really in its step, and every test matches the solution", () => {
  for (const [index, step] of phases.guided.steps.entries()) {
    const gaps = step.code.split("___").length - 1;
    assert.equal(gaps, step.blanks.length, `step ${index + 1} has ${gaps} blanks for ${step.blanks.length} answers`);
    assert.ok(step.promptAr.trim(), `step ${index + 1} asks for nothing`);
  }
  // `repr()` on the worker, quotes stripped by `normaliseLiteral` — so a string expectation
  // is written bare. A quoted one would still pass, but the two must not disagree.
  const assigned = (code: string, name: string) => new RegExp(`^${name}\\s*=\\s*"?([^"\\n]+)"?$`, "m").exec(code)?.[1];
  for (const [label, code, tests] of [
    ["guided", phases.guided.solutionCode, phases.guided.tests],
    ["remix", phases.remix.solutionCode, phases.remix.tests],
  ] as const) {
    for (const check of tests) {
      assert.equal(assigned(code, check.call), check.expected, `${label}: ${check.call} is not ${check.expected}`);
    }
  }
});

test("each question has one right answer and points at something on screen", () => {
  assert.ok(phases.explore.rounds.length >= 2, "one round is not an exploration");
  for (const round of phases.explore.rounds) {
    assert.ok(round.correctIndex >= 0 && round.correctIndex < round.optionsAr.length, "the right answer is not on the list");
    assert.ok(round.nudgeAr.trim(), "a wrong answer gets no nudge");
    for (const name of round.highlight ?? []) {
      const known = worldPropNames.includes(name as never) || name in fixtures || name === "sign";
      assert.ok(known, `a question points at ${name}, which the scene cannot light`);
    }
  }
});

test("every animation it names is one the scene can play", () => {
  for (const change of everyChange()) {
    if (!change?.animate) continue;
    assert.ok(isScenePhase(change.animate), `${change.animate} is not a phase the scene knows`);
  }
});

test("the shop opens because of their code, and one customer arrives after", () => {
  assert.equal(shopOpen(phases.encounter.world!.props!), false, "the day starts with the shop already open");
  assert.equal(shopOpen(phases.guided.onRun!.props!), true, "writing the line does not open the shop");
  // Nobody is standing in a shut shop, and this mission is about one neighbour — not the
  // eight the old mapper drew into every scene regardless.
  assert.equal(queueLength(phases.encounter.world!.props!), 0, "a customer waits outside a shut shop");
  assert.equal(queueLength(phases.remix.onRun!.props!), 1, "this mission is about one customer");
});

test("the world it asks for is a world the scene can draw", () => {
  for (const props of [phases.encounter.world?.props, ...everyChange().map((c) => c?.props)]) {
    if (!props) continue;
    for (const [key] of undrawnProps(props)) {
      assert.match(key, /^[a-z_]+$/, `${key} would show up in the readouts as noise`);
    }
    const sacks = flourSacks(props);
    if (sacks !== undefined) assert.ok(sacks >= 0 && sacks <= 4, `${sacks} sacks cannot be drawn`);
    assert.ok(queueLength(props) <= CUSTOMER_IDS.length);
    if (props.sign !== undefined) assert.notEqual(shopOpen(props), undefined, `sign: ${props.sign} means nothing`);
  }
});

test("whoever speaks has a face", () => {
  const drawn = new Set(["tico", ...Object.keys(bakeryScene.actors)]);
  assert.ok(drawn.has(phases.encounter.speaker), `${phases.encounter.speaker} has no artwork`);
  assert.ok(phases.encounter.speakerNameAr.trim() && phases.encounter.lineAr.trim());
});

test("both rows for this lesson carry the same mission", () => {
  const [a, b] = IDS.map(load);
  assert.deepEqual(a.phases, b.phases, "the two variables-1 rows would play differently");
  assert.equal(a.titleAr, b.titleAr);
  for (const id of IDS) assert.equal(load(id).id, id, "a file carries an id that is not its own");
});
