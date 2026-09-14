import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ALLOWED_IMPORTS, casePassed, LIMITS, normaliseLiteral, PYODIDE_VERSION, isRunnerMessage, PROTOCOL_VERSION, WORKER_URL } from "./protocol";

const workerSource = () => readFileSync(join(process.cwd(), "public", WORKER_URL), "utf8");

/**
 * The client and the Python service have to agree on what "passes" means.
 *
 * Every `expected` in a mission was produced by `ai-backend/app/ai/sandbox.py` running
 * the reference solution and recording `repr()`. If the browser compares differently,
 * a mission passes validation on the server and fails in front of a child — the worst
 * kind of drift, because both halves look correct on their own.
 *
 * These cases are taken straight from `sandbox._normalise`.
 */
test("literal comparison matches the backend's _normalise", () => {
  // Quote style must not decide a test. `repr()` gives 'open'; a manifest writes "open".
  assert.equal(normaliseLiteral("'open'"), "open");
  assert.equal(normaliseLiteral('"open"'), "open");
  assert.ok(casePassed("'open'", '"open"'));

  // Numbers and surrounding whitespace.
  assert.ok(casePassed("13", " 13 "));
  assert.ok(casePassed("37", "37"));

  // Arabic survives intact, and is compared by content rather than by quoting.
  assert.ok(casePassed("'صباح الخير'", '"صباح الخير"'));

  // Genuinely different values still differ.
  assert.ok(!casePassed("16", "13"));

  // A quoted 8 and a bare 8 compare equal, because stripping the quotes is exactly what
  // the server does. Worth pinning: it is the one place this comparison is lossy, and it
  // is lossy deliberately and identically on both sides.
  assert.ok(casePassed("'8'", "8"));

  // A mismatched pair of quotes is not stripped.
  assert.equal(normaliseLiteral("'open\""), "'open\"");
  assert.equal(normaliseLiteral(undefined), "");
});

test("a message from anywhere else is rejected", () => {
  assert.ok(isRunnerMessage({ version: PROTOCOL_VERSION, kind: "ready" }));
  assert.ok(!isRunnerMessage({ version: PROTOCOL_VERSION + 1, kind: "ready" }));
  assert.ok(!isRunnerMessage({ version: PROTOCOL_VERSION, kind: "something-else" }));
  assert.ok(!isRunnerMessage(null));
  assert.ok(!isRunnerMessage("ready"));
});

test("limits match docs/07 and the Pyodide version is pinned", () => {
  // docs/07 "Limits" — these are the published numbers, not preferences.
  assert.equal(LIMITS.runMs, 5_000);
  assert.equal(LIMITS.outputBytes, 65_536);
  assert.equal(LIMITS.sourceBytes, 64 * 1024);
  assert.equal(LIMITS.maxCases, 30);

  // "Pin the Pyodide version" — a floating version would change the interpreter under
  // a classroom without anyone choosing to.
  assert.match(PYODIDE_VERSION, /^\d+\.\d+\.\d+$/);
});

test("the import allowlist stays small and is curriculum-only", () => {
  // docs/07: "Audit the allowlist before expanding it." Nothing here reaches the
  // filesystem, the network or the process.
  const forbidden = ["os", "sys", "subprocess", "socket", "shutil", "pathlib", "importlib", "ctypes", "urllib", "requests"];
  for (const name of forbidden) {
    assert.ok(!(ALLOWED_IMPORTS as readonly string[]).includes(name), `${name} must not be allowed`);
  }
  assert.ok(ALLOWED_IMPORTS.length <= 8, "the allowlist should stay reviewable at a glance");
});

/**
 * The worker is the one file that must never drift from docs/07's hard rules, and the
 * cheapest guard is to assert the shape of the source itself.
 */
test("the worker keeps the safeguards docs/07 names", () => {
  const source = workerSource();

  // "Generate harness data with JSON serialization; never interpolate learner text
  // into Python source."
  assert.ok(source.includes("json.loads(_TICO_PAYLOAD)"), "the payload must cross as JSON");
  assert.ok(!/\$\{\s*request\.source/.test(source), "learner source must never be interpolated into Python");

  // "Use fresh globals ... for every run."
  assert.ok(source.includes('_env = {"__builtins__"'), "each run needs its own namespace");

  // "Replace `__import__` with an allowlist guard."
  assert.ok(source.includes('_env["__builtins__"]["__import__"] = _guarded_import'));

  // "Limit exception text and strip harness internals from learner-facing traces."
  assert.match(source, /function sanitise|const sanitise/);
  assert.ok(source.includes("_TICO_[A-Z_]+"), "harness names must be stripped from traces");
});

/**
 * The worker is a static file, so it cannot import this module — see the note on
 * `WORKER_URL`. That duplication is only safe while something checks it.
 */
test("the worker's copied constants still match protocol.ts", () => {
  const source = workerSource();

  assert.ok(source.includes(`const PROTOCOL_VERSION = ${PROTOCOL_VERSION};`), "protocol version drifted");
  assert.ok(source.includes(`const PYODIDE_VERSION = "${PYODIDE_VERSION}";`), "Pyodide version drifted");
  assert.ok(source.includes(`outputBytes: ${LIMITS.outputBytes}`), "output cap drifted");
  assert.ok(source.includes(`maxCases: ${LIMITS.maxCases}`), "case cap drifted");

  for (const name of ALLOWED_IMPORTS) {
    assert.ok(source.includes(`"${name}"`), `allowlist entry ${name} missing from the worker`);
  }
});

test("the worker is a module, served from public/, because Pyodide requires one", () => {
  // Pyodide calls importScripts("data:text/javascript,") to detect a classic worker and
  // aborts with "Classic web workers are not supported" if it succeeds. Turbopack's
  // bundled-worker helper produced exactly that, so the worker must stay a static file.
  assert.ok(WORKER_URL.startsWith("/"), "the worker must be served as a static file");
  assert.ok(existsSync(join(process.cwd(), "public", WORKER_URL)), `${WORKER_URL} is missing from public/`);
  assert.ok(!existsSync(join(process.cwd(), "src/lib/runner/python.worker.ts")),
    "the bundled worker must not come back — Turbopack makes it classic and Pyodide refuses to start");
});
