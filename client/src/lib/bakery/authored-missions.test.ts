import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PhasedMissionOut } from "@/lib/ai/types";
import { beatsOf, castOf, flourSacks, interactionsOf, isScenePhase, pressTarget, queueLength, shopOpen, undrawnProps, settledProps } from "./mission-scene";
import { bakeryScene, fixtures, worldPropNames } from "./scene-manifest";
import { CUSTOMER_IDS } from "./simulation";

/**
 * Every authored mission, checked the way `ai/guards.py` checks a generated one.
 *
 * A mission written by hand and imported from a file never passes through that validator,
 * so it gets the equivalent here, against what the client actually draws. These checks are
 * not theoretical: each one is a defect that shipped at least once — a function taught in
 * the variables lesson, a customer asked about before she was on screen, an order for more
 * bread than the tray held, a `steps` animation the scene had never heard of.
 */

/** Authored by hand, in play order. Everything else in the directory is still generated. */
const AUTHORED = [
  { file: "variables-1-cmtwklihyqt4p01z00z8ue6zx.json", concept: "variables", stop: 1 },
  { file: "variables-2-cmtwkm8raqt5d01z04ksf3jl8.json", concept: "variables", stop: 2 },
  { file: "conditionals-1-cmtwko9x1qt6m01z0ccv78mlk.json", concept: "conditionals", stop: 1 },
  { file: "conditionals-2-cmtwkp4a4qt7801z0a156a0j4.json", concept: "conditionals", stop: 2 },
] as const;

const load = (file: string) => {
  const path = join(process.cwd(), "..", "ai-backend", "content", "prebuilt", file);
  return (JSON.parse(readFileSync(path, "utf8")) as { data: PhasedMissionOut }).data;
};

const missions = AUTHORED.map((entry) => ({ ...entry, mission: load(entry.file) }));

/** What each concept is allowed to contain. The order is fixed and cumulative. */
const FORBIDDEN: Record<string, RegExp> = {
  variables: /\bdef\b|\blambda\b|\bif\b|\bfor\b|\bwhile\b/,
  conditionals: /\bdef\b|\blambda\b|\bfor\b|\bwhile\b/,
  loops: /\bdef\b|\blambda\b/,
};

const codeOf = (m: PhasedMissionOut) => [
  m.phases.understand.code,
  m.phases.guided.solutionCode,
  m.phases.remix.startingCode,
  m.phases.remix.solutionCode,
  ...m.phases.guided.steps.map((s) => s.code),
];

const changesOf = (m: PhasedMissionOut) => [
  m.phases.understand.onRun, m.phases.guided.onRun, m.phases.remix.onRun, m.phases.remix.worldChange,
  ...m.phases.guided.steps.flatMap((step) => [step.onEnter, step.onRun]),
  ...interactionsOf(m.phases.encounter.world).map((interaction) => interaction.onPress),
];

/**
 * Run one of these programs without Python.
 *
 * Handles exactly what the authored missions use: assignment of an int or a string, one
 * binary operation between two names or literals, and a single `if`/`else` whose bodies
 * are assignments. Anything else throws, which is itself the check — a mission using
 * syntax this cannot read is a mission nobody has verified the expectations of.
 */
function evaluate(source: string): Map<string, number | string | boolean> {
  const vars = new Map<string, number | string | boolean>();
  const value = (token: string): number | string | boolean => {
    const text = token.trim();
    if (/^-?\d+$/.test(text)) return Number(text);
    if (/^".*"$/.test(text) || /^'.*'$/.test(text)) return text.slice(1, -1);
    if (text === "True" || text === "False") return text === "True";
    const compare = /^(\w+|\d+)\s*(>=|<=|==|!=|>|<)\s*(\w+|\d+)$/.exec(text);
    if (compare) {
      const a = value(compare[1]) as number, b = value(compare[3]) as number;
      return ({ '>=': a >= b, '<=': a <= b, '==': a === b, '!=': a !== b, '>': a > b, '<': a < b })[compare[2] as '>'];
    }
    if (!vars.has(text)) throw new Error(`unknown name: ${text}`);
    return vars.get(text)!;
  };
  const assign = (line: string) => {
    const [name, rhs] = [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()];
    const op = /\s(>=|<=|==|!=|>|<|\+|-|\*)\s/.exec(rhs);
    if (!op) { vars.set(name, value(rhs)); return; }
    const a = value(rhs.slice(0, op.index)) as number;
    const b = value(rhs.slice(op.index + op[0].length)) as number;
    const table: Record<string, number | boolean> = {
      ">=": a >= b, "<=": a <= b, "==": a === b, "!=": a !== b, ">": a > b, "<": a < b,
      "+": a + b, "-": a - b, "*": a * b,
    };
    vars.set(name, table[op[1]]);
  };

  const lines = source.split("\n").filter((l) => l.trim());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const branch = /^if\s+(.+):$/.exec(line.trim());
    if (!branch) {
      if (line.trim().startsWith("else:")) throw new Error("else without if");
      assign(line);
      continue;
    }
    // Collect the two indented bodies, then run only the one the condition selects.
    const taken: string[] = [];
    const otherwise: string[] = [];
    let bucket = taken;
    while (i + 1 < lines.length && (lines[i + 1].startsWith(" ") || lines[i + 1].trim() === "else:")) {
      i += 1;
      if (lines[i].trim() === "else:") { bucket = otherwise; continue; }
      bucket.push(lines[i].trim());
    }
    for (const body of value(branch[1]) ? taken : otherwise) assign(body);
  }
  return vars;
}

for (const { file, concept, stop, mission } of missions) {
  const label = `${concept}/${stop} ${mission.titleAr}`;
  const phases = mission.phases;

  test(`${label}: six phases, right concept, validated`, () => {
    for (const key of ["encounter", "explore", "discover", "understand", "guided", "remix"] as const) {
      assert.ok(phases[key], `${key} is missing`);
    }
    assert.equal(mission.targetConceptId, concept, "the mission teaches a different concept than its file says");
    assert.ok(mission.validated);
    assert.match(file, new RegExp(`^${concept}-${stop}-${mission.id}\\.json$`), "file name, stop and id disagree");
  });

  test(`${label}: stays inside its concept`, () => {
    for (const code of codeOf(mission)) {
      assert.doesNotMatch(code, FORBIDDEN[concept], `uses syntax from a later concept`);
    }
    if (concept === "conditionals") {
      assert.match(phases.remix.solutionCode, /\bif\b/, "a conditionals mission with no condition in it");
      for (const step of phases.guided.steps) assert.ok(step.blanks.some((blank) => /^if /m.test(blank)), "the learner must write an if branch, not just a comparison");
    }
  });

  test(`${label}: three beats the child acts on`, () => {
    // Click, write, then write again after the world moves. A mission with fewer is a
    // worksheet with a picture beside it.
    assert.ok(pressTarget(phases.encounter.world?.props), "nothing to press in the opening");
    assert.ok(phases.guided.steps.length >= 2, "at least two guided stops plus the remix");
    const interactions = interactionsOf(phases.encounter.world);
    assert.ok(interactions.length >= 2, "each mission needs multiple scene interactions");
    let world = phases.encounter.world?.props ?? {};
    for (const interaction of interactions) {
      const next = settledProps(interaction.onPress, world);
      assert.notDeepEqual(next, world, `${interaction.target} changes nothing`);
      assert.ok(interaction.onPress.captionAr, "the consequence needs a caption");
      world = next;
    }
    assert.ok(phases.remix.solutionCode.trim(), "nothing to write in the twist");
    assert.equal(phases.encounter.ctaAr ?? null, null, "a Continue button competes with the thing to press");
    assert.ok(interactions.some((interaction) => /اضغط/.test(interaction.promptAr)), "nobody says to press it");
  });

  test(`${label}: the solutions actually pass their own tests`, () => {
    for (const [where, code, tests] of [
      ["guided", phases.guided.solutionCode, phases.guided.tests],
      ["remix", phases.remix.solutionCode, phases.remix.tests],
    ] as const) {
      const vars = evaluate(code);
      for (const check of tests) {
        const actual = vars.get(check.call);
        assert.notEqual(actual, undefined, `${where}: ${check.call} is never assigned`);
        // Python's `repr` is what the worker compares against, so booleans are capitalised.
        const shown = typeof actual === "boolean" ? (actual ? "True" : "False") : String(actual);
        assert.equal(shown, check.expected, `${where}: ${check.call} is ${shown}, not ${check.expected}`);
      }
    }
  });

  test(`${label}: every coding stop is solvable and changes the world`, () => {
    for (const step of phases.guided.steps) {
      let code = step.code;
      for (const answer of step.blanks) code = code.replace("___", answer);
      const vars = evaluate(code);
      assert.ok(step.onRun?.captionAr, "coding stop has no outcome");
      assert.ok(step.tests?.length, "coding stop has no own tests");
      for (const check of step.tests ?? []) assert.equal(String(vars.get(check.call)), check.expected);
    }
  });

  test(`${label}: the twist adds to their work instead of replacing it`, () => {
    assert.ok(phases.remix.solutionCode.startsWith(phases.guided.solutionCode), "the twist rewrites earlier lines");
    assert.equal(phases.remix.startingCode, phases.guided.solutionCode, "their line is not carried forward");
    for (const earlier of phases.guided.tests) {
      assert.ok(
        phases.remix.tests.some((later) => later.call === earlier.call),
        `the twist drops the earlier check on ${earlier.call}`,
      );
    }
  });

  test(`${label}: blanks and hints are usable`, () => {
    for (const [i, step] of phases.guided.steps.entries()) {
      const gaps = step.code.split("___").length - 1;
      assert.equal(gaps, step.blanks.length, `step ${i + 1}: ${gaps} blanks for ${step.blanks.length} answers`);
      assert.ok(step.promptAr.trim(), `step ${i + 1} asks for nothing`);
      // Rung one of the ladder, and the fallback when the AI service is unreachable.
      assert.ok(step.hintAr?.trim(), `step ${i + 1} has no hint`);
    }
    for (const round of phases.explore.rounds) {
      assert.ok(round.correctIndex >= 0 && round.correctIndex < round.optionsAr.length, "the answer is not on the list");
      assert.ok(round.nudgeAr.trim(), "a wrong answer gets no nudge");
    }
  });

  test(`${label}: nobody appears out of nowhere`, () => {
    const twist = beatsOf(phases.remix.worldChange);
    assert.ok(twist.length >= 3, `the twist is ${twist.length} beats`);
    const arrives = twist.findIndex((b) => b.animate === "arriving");
    assert.ok(arrives >= 0, "nobody is ever seen walking in");
    const speakers = new Set([phases.encounter.speakerNameAr, "تيكو", "عم حسن"]);
    const guest = twist.findIndex((b) => b.speakerNameAr && !speakers.has(b.speakerNameAr));
    if (guest >= 0) assert.ok(guest > arrives, "a customer speaks before she has arrived");
    for (const b of beatsOf(phases.remix.onRun)) {
      assert.ok(b.lineAr?.trim(), "a beat plays in silence");
    }
  });

  test(`${label}: the world it asks for is one the scene can draw`, () => {
    const worlds = [phases.encounter.world?.props, ...changesOf(mission).flatMap((c) => [c?.props, ...beatsOf(c).map((b) => b.props)])];
    for (const props of worlds) {
      if (!props) continue;
      for (const [key] of undrawnProps(props)) {
        assert.match(key, /^[a-z_]+$/, `${key} would show up in the readouts as noise`);
      }
      const sacks = flourSacks(props);
      if (sacks !== undefined) assert.ok(sacks >= 0 && sacks <= 4, `${sacks} sacks cannot be drawn`);
      assert.ok(queueLength(props) <= CUSTOMER_IDS.length);
      if (props.sign !== undefined) assert.notEqual(shopOpen(props), undefined, `sign: ${props.sign} means nothing`);
      if (props.customer) assert.ok(castOf(props), `customer: ${props.customer} is nobody in this world`);
    }
    for (const change of changesOf(mission)) {
      for (const animate of [change?.animate, ...beatsOf(change).map((b) => b.animate)]) {
        if (animate) assert.ok(isScenePhase(animate), `${animate} is not a phase the scene knows`);
      }
    }
  });

  test(`${label}: what it points at can be lit and pressed`, () => {
    // `loaf` and `dough` are drawn per-item from the simulation rather than placed, but
    // they light up like anything else — a question may point at the bread itself.
    const known = new Set<string>([...worldPropNames, ...Object.keys(fixtures), "sign", "hassan", "loaf", "dough"]);
    assert.ok(known.has(pressTarget(phases.encounter.world?.props)!), "the opening waits on something unclickable");
    for (const round of phases.explore.rounds) {
      for (const name of round.highlight ?? []) assert.ok(known.has(name), `a question points at ${name}`);
    }
    for (const note of phases.understand.annotations ?? []) {
      if (note.pointsAt) assert.ok(known.has(note.pointsAt), `an annotation points at ${note.pointsAt}`);
    }
  });

  test(`${label}: whoever speaks exists in this world`, () => {
    const drawn = new Set(["tico", ...Object.keys(bakeryScene.actors)]);
    assert.ok(drawn.has(phases.encounter.speaker), `${phases.encounter.speaker} has no artwork`);
    assert.ok(phases.encounter.speakerNameAr.trim() && phases.encounter.lineAr.trim());
  });
}

test("the set is serial: one file per stop, and each concept starts at one", () => {
  const seen = new Map<string, number[]>();
  for (const { concept, stop } of AUTHORED) {
    const stops = seen.get(concept) ?? [];
    assert.ok(!stops.includes(stop), `two authored missions claim ${concept} stop ${stop}`);
    seen.set(concept, [...stops, stop]);
  }
  for (const [concept, stops] of seen) {
    assert.deepEqual([...stops].sort(), stops, `${concept} stops are out of order`);
    assert.equal(stops[0], 1, `${concept} has no stop 1`);
  }
});

test("the missions vary: not four rounds of putting a number in a variable", () => {
  const kinds = missions.map(({ mission }) => {
    const code = mission.phases.remix.solutionCode;
    if (/\bif\b/.test(code)) return "branch";
    if (/[><]=|==/.test(code)) return "compare";
    if (/=\s*\w+\s*[-+*]\s*\w+/.test(code)) return "arithmetic";
    if (/=\s*"/.test(code)) return "string";
    return "number";
  });
  assert.ok(new Set(kinds).size >= 3, `only ${new Set(kinds).size} kinds of value across ${kinds.length} missions`);
});

test("the missions use more of the cast than one person", () => {
  const named = new Set<string>();
  for (const { mission } of missions) {
    for (const change of changesOf(mission)) {
      for (const props of [change?.props, ...beatsOf(change).map((b) => b.props)]) {
        for (const id of castOf(props ?? {}) ?? []) named.add(id);
      }
    }
  }
  assert.ok(named.size >= 3, `only ${named.size} named customers across every authored mission`);
});
