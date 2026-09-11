/**
 * The wire between the React client and the Pyodide worker.
 *
 * `docs/07-browser-python-runner.md` requires versioned messages and that every payload
 * is parsed rather than trusted. `PROTOCOL_VERSION` is checked on both sides, so a stale
 * worker left behind by a deploy is rejected instead of half-understood.
 */

export const PROTOCOL_VERSION = 1;

/** Pinned, per docs/07. Never float this to `latest`. */
export const PYODIDE_VERSION = "314.0.6";
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * The worker is served as a static file rather than bundled.
 *
 * Pyodide aborts with "Classic web workers are not supported" unless it is in a real
 * module worker, and Turbopack's bundled-worker helper produces a classic one whatever
 * `type` is passed. A plain file from `public/` with `{ type: "module" }` is a module
 * worker — checked in Chrome 146 using Pyodide's own test. The trade-off is that the
 * worker repeats the constants above; `protocol.test.ts` asserts they still agree.
 */
export const WORKER_URL = "/runner/python-worker.js";

// --------------------------------------------------------------------------- limits

/** docs/07 "Limits". Enforced in the worker, and again in the client before sending. */
export const LIMITS = {
  /** Wall clock for one run, covering every case in it. */
  runMs: 3_000,
  /** Bytes of UTF-8 across stdout and stderr. */
  outputBytes: 65_536,
  /** Bytes of source. */
  sourceBytes: 64 * 1024,
  maxCases: 30,
} as const;

/**
 * Curriculum-approved standard library only.
 *
 * docs/07: "Permit only curriculum-approved standard-library modules. Audit the
 * allowlist before expanding it." The Python curriculum reaches variables,
 * conditionals, loops and functions — none of which need an import at all. These are
 * here so that a student who has read ahead is not punished for it, not because any
 * mission requires them.
 */
export const ALLOWED_IMPORTS = ["math", "random", "statistics", "string", "decimal", "fractions"] as const;

// -------------------------------------------------------------------------- requests

export type RunnerRequest = {
  version: typeof PROTOCOL_VERSION;
  kind: "run";
  requestId: string;
  /** The student's source. Executed once, in fresh globals. */
  source: string;
  /**
   * Expressions to evaluate afterwards, e.g. `calculate_loaves(2)`.
   *
   * These come from the mission, which the Python validator already checked — never
   * from the student. The worker still parses each one and refuses anything that is not
   * a plain call, because "it came from us" is an assumption and this is the place that
   * would pay for it being wrong.
   */
  cases: Array<{ call: string; expected: string; hidden?: boolean }>;
};

// --------------------------------------------------------------------------- results

/**
 * docs/07 "Result semantics" — the UI must be able to tell these apart, because the
 * child is told something different for each.
 */
export type CaseStatus = "PASSED" | "WRONG_OUTPUT" | "RAISED" | "REJECTED";

export type CaseResult = {
  call: string;
  status: CaseStatus;
  /** `repr()` of what came back. Absent when nothing came back. */
  actual?: string;
  expected: string;
  /** Sanitised, one line, harness frames stripped. */
  error?: string;
  hidden?: boolean;
};

export type RunOutcome =
  | "OK"
  /** The source itself would not compile. */
  | "SYNTAX_ERROR"
  /** The source raised while being executed, before any case ran. */
  | "RUNTIME_ERROR"
  /** Exceeded `LIMITS.runMs`. The worker is gone; a fresh one replaces it. */
  | "TIMEOUT"
  /** The runner could not start, or the message was not understood. */
  | "RUNNER_ERROR";

export type RunnerResult = {
  version: typeof PROTOCOL_VERSION;
  kind: "result";
  requestId: string;
  outcome: RunOutcome;
  cases: CaseResult[];
  /** Captured stdout, truncated to `LIMITS.outputBytes`. */
  stdout: string;
  /** Present for SYNTAX_ERROR, RUNTIME_ERROR and RUNNER_ERROR. Already sanitised. */
  error?: string;
  durationMs: number;
};

export type RunnerReady = {
  version: typeof PROTOCOL_VERSION;
  kind: "ready";
};

export type RunnerFailed = {
  version: typeof PROTOCOL_VERSION;
  kind: "failed";
  error: string;
};

export type RunnerMessage = RunnerResult | RunnerReady | RunnerFailed;

/** Every payload is parsed, never trusted — docs/07 "Harness safeguards". */
export function isRunnerMessage(value: unknown): value is RunnerMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<RunnerMessage>;
  if (message.version !== PROTOCOL_VERSION) return false;
  return message.kind === "result" || message.kind === "ready" || message.kind === "failed";
}

/**
 * Compare a value against what a test expects.
 *
 * Mirrors `ai-backend/app/ai/sandbox.py::_normalise` exactly. The server derived every
 * `expected` by running the reference solution and recording `repr()`, so the client has
 * to agree with it character for character — a mission that passes validation and fails
 * in the browser is worse than one that never shipped.
 */
export function normaliseLiteral(literal: string | undefined): string {
  if (literal === undefined || literal === null) return "";
  const text = literal.trim();
  if (text.length >= 2 && text[0] === text[text.length - 1] && (text[0] === '"' || text[0] === "'")) {
    return text.slice(1, -1);
  }
  return text;
}

export const casePassed = (actual: string | undefined, expected: string) =>
  normaliseLiteral(actual) === normaliseLiteral(expected);
