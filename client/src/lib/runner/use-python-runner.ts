"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  casePassed,
  WORKER_URL,
  isRunnerMessage,
  LIMITS,
  PROTOCOL_VERSION,
  type CaseResult,
  type RunnerRequest,
  type RunnerResult,
} from "./protocol";

/**
 * Owns the Pyodide worker for one page.
 *
 * The lifecycle is the one in `docs/07-browser-python-runner.md`:
 *
 *     Loading -> Ready -> Running -> Ready
 *                   \-> Restarting -> Loading
 *     Loading -> Failed -> (retry) -> Loading
 *
 * Two rules from that document shape the code more than anything else:
 *
 * - **A worker that overruns is destroyed, not interrupted.** Synchronous Python cannot
 *   be safely interrupted from outside, so the timeout terminates the whole worker and a
 *   fresh one is created. Editor content lives in React and is untouched by this.
 * - **Results with a stale `requestId` are ignored.** A newer run cancels an older one,
 *   and a late reply from the old worker must never overwrite the new answer.
 */

export type RunnerState = "loading" | "ready" | "running" | "restarting" | "failed";

export type RunResult = {
  outcome: RunnerResult["outcome"];
  cases: CaseResult[];
  stdout: string;
  error?: string;
  durationMs: number;
  /** Every visible case passed. The only thing that should unlock progress. */
  allPassed: boolean;
};

export type RunInput = {
  source: string;
  cases: Array<{ call: string; expected: string; hidden?: boolean }>;
};

export function usePythonRunner() {
  const [state, setState] = useState<RunnerState>("loading");
  const [error, setError] = useState<string | null>(null);

  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: string; resolve: (result: RunResult) => void; timer: number } | null>(null);
  const generation = useRef(0);

  const settle = useCallback((result: RunResult) => {
    const current = pending.current;
    if (!current) return;
    clearTimeout(current.timer);
    pending.current = null;
    current.resolve(result);
  }, []);

  const spawn = useCallback(() => {
    generation.current += 1;

    // A static file, deliberately — see the header of `public/runner/python-worker.js`.
    // Turbopack's bundled-worker helper produces a classic worker even when asked for a
    // module, and Pyodide refuses to start in one.
    const instance = new Worker(WORKER_URL, { type: "module", name: "tico-python-runner" });

    instance.onmessage = (event: MessageEvent) => {
      // Every payload is parsed, never trusted — docs/07 "Harness safeguards".
      if (!isRunnerMessage(event.data)) return;
      const message = event.data;

      if (message.kind === "ready") {
        setState("ready");
        setError(null);
        return;
      }

      if (message.kind === "failed") {
        setState("failed");
        setError(message.error);
        settle({ outcome: "RUNNER_ERROR", cases: [], stdout: "", error: message.error, durationMs: 0, allPassed: false });
        return;
      }

      // A reply for a run we are no longer waiting on. Dropping it is the point.
      if (!pending.current || pending.current.id !== message.requestId) return;

      const cases = message.cases.map((row) =>
        row.status === "PASSED" && !casePassed(row.actual, row.expected)
          ? { ...row, status: "WRONG_OUTPUT" as const }
          : row,
      );

      setState("ready");
      settle({
        outcome: message.outcome,
        cases,
        stdout: message.stdout,
        error: message.error,
        durationMs: message.durationMs,
        allPassed: message.outcome === "OK" && cases.length > 0 && cases.every((c) => c.status === "PASSED"),
      });
    };

    instance.onerror = () => {
      setState("failed");
      setError("the runner stopped unexpectedly");
      settle({ outcome: "RUNNER_ERROR", cases: [], stdout: "", error: "the runner stopped unexpectedly", durationMs: 0, allPassed: false });
    };

    worker.current = instance;
  }, [settle]);

  useEffect(() => {
    spawn();
    return () => {
      worker.current?.terminate();
      worker.current = null;
    };
  }, [spawn]);

  /** Throw the worker away and start a clean one. The only reliable stop. */
  const restart = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setState("restarting");
    setError(null);
    spawn();
    setState("loading");
  }, [spawn]);

  const run = useCallback(
    (input: RunInput): Promise<RunResult> => {
      const source = input.source ?? "";

      if (new TextEncoder().encode(source).length > LIMITS.sourceBytes) {
        return Promise.resolve({
          outcome: "RUNNER_ERROR", cases: [], stdout: "",
          error: "that is more code than this exercise expects", durationMs: 0, allPassed: false,
        });
      }

      if (!worker.current) {
        return Promise.resolve({
          outcome: "RUNNER_ERROR", cases: [], stdout: "",
          error: "the runner is not available", durationMs: 0, allPassed: false,
        });
      }

      // A newer run cancels an older one. The old promise resolves rather than dangling.
      if (pending.current) {
        settle({ outcome: "RUNNER_ERROR", cases: [], stdout: "", error: "superseded", durationMs: 0, allPassed: false });
      }

      const requestId = `${generation.current}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

      return new Promise<RunResult>((resolve) => {
        const timer = window.setTimeout(() => {
          // Cannot interrupt synchronous Python; terminate and rebuild.
          pending.current = null;
          restart();
          resolve({
            outcome: "TIMEOUT", cases: [], stdout: "",
            error: `the code was still running after ${LIMITS.runMs / 1000} seconds`,
            durationMs: LIMITS.runMs, allPassed: false,
          });
        }, LIMITS.runMs);

        pending.current = { id: requestId, resolve, timer };
        setState("running");

        const request: RunnerRequest = {
          version: PROTOCOL_VERSION,
          kind: "run",
          requestId,
          source,
          cases: input.cases.slice(0, LIMITS.maxCases),
        };
        worker.current?.postMessage(request);
      });
    },
    [restart, settle],
  );

  return { state, error, run, restart };
}
