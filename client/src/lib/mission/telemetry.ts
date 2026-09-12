"use client";

/**
 * Everything the player tells the server, and nothing it needs back to keep working.
 *
 * `client/AGENTS.md` is firm about this: "The AI service going down must never block a
 * student... A mission must stay completable with the AI service switched off entirely."
 * So every call here returns a value the caller can proceed without, and never throws.
 * A failed session create means the mission plays unrecorded — which is worse than
 * recorded, and far better than a child staring at an error.
 *
 * These hit our own Next routes, not the Python service directly. Those routes already
 * own the `X-Request-ID`, envelope and fallback rules from `src/lib/ai/client.ts`.
 */

import type { Phase } from "@/lib/ai/types";

export type LastResult = "PASSED" | "FAILED" | "ERROR" | "TIMEOUT" | null;

/** The phase names the database enum uses, per position in the six-phase loop. */
export const DB_PHASE: readonly Phase[] = [
  "ENCOUNTER", "EXPLORE", "DISCOVER", "UNDERSTAND", "GUIDED_CODING", "ADAPT_REMIX",
];

export type MissionDebrief = {
  sessionId: string;
  outcome: string;
  totalAttempts: number;
  hintsUsed: number;
  timeSpentMs: number;
  conceptsMastered?: string[];
  ticoFeedback?: string;
  starsEarned?: number;
  xpAwarded?: number;
};

async function post<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { data?: T };
    return payload.data ?? null;
  } catch {
    // Offline, blocked, or the route is down. The mission carries on regardless.
    return null;
  }
}

/** Open (or re-join) the practice session for this mission. Null means unrecorded. */
export async function startSession(input: { generatedMissionId: string; lessonId?: string | null }) {
  const data = await post<{ id: string }>("/api/v1/sessions", {
    generatedMissionId: input.generatedMissionId,
    lessonId: input.lessonId ?? null,
  });
  return data?.id ?? null;
}

/** Tell the server which phase they are on. The hint ladder reads this. */
export function reportPhase(sessionId: string | null, step: number) {
  if (!sessionId) return;
  const phase = DB_PHASE[step];
  if (!phase) return;
  void post(`/api/v1/sessions/${sessionId}`, { phase }, "PATCH");
}

/**
 * Record one attempt.
 *
 * Fire-and-forget: the child has already seen their result from the local runner, and
 * making them wait on a round trip to be told what they can see would be backwards.
 */
export function reportSubmission(
  sessionId: string | null,
  input: { code: string; status: Exclude<LastResult, null>; output: string; durationMs: number },
) {
  if (!sessionId) return;
  void post("/api/v1/submissions", { sessionId, ...input });
}

/**
 * Ask for the next hint.
 *
 * The rung is decided server-side from the prior `hint_events` — never here — and the
 * rung that comes back is the one the hint was written for, so it is what gets shown.
 * Returning null lets the caller fall back to the mission's authored hint.
 *
 * `phase` and `guidedStep` are sent because the ladder depends on both: `ADAPT_REMIX`
 * starts a rung higher than `GUIDED_CODING` since the student has already seen this code
 * work, and the step keeps a hint about step 2 from talking about step 1. Omitting them
 * made every remix hint arrive as though it were a first encounter.
 */
export async function requestHint(input: {
  sessionId: string | null;
  missionId: string;
  codeExcerpt: string;
  lastResult: LastResult;
  locale: string;
  phase: Phase;
  /** Which guided step they are on. Null in the remix, which has a single edit. */
  guidedStep?: number | null;
  /** The failing message from the local runner, when there is one. */
  errorText?: string | null;
}): Promise<{ text: string; rung: number } | null> {
  if (!input.sessionId) return null;
  const data = await post<{ hint?: string; text?: string; hintLevel?: number; rung?: number }>(
    "/api/v1/hints",
    {
      sessionId: input.sessionId,
      exerciseId: input.missionId,
      codeExcerpt: input.codeExcerpt.slice(0, 4000),
      lastResult: input.lastResult,
      locale: input.locale,
      phase: input.phase,
      guidedStep: input.guidedStep ?? null,
      errorText: input.errorText?.slice(0, 8000) ?? null,
    },
  );
  const text = data?.hint ?? data?.text;
  if (!text) return null;
  return { text, rung: data?.hintLevel ?? data?.rung ?? 1 };
}

/** Close the session as solved, then read the debrief. Either half may be null. */
export async function finishSession(sessionId: string | null): Promise<MissionDebrief | null> {
  if (!sessionId) return null;
  await post(`/api/v1/sessions/${sessionId}`, { outcome: "SOLVED" }, "PATCH");
  return post<MissionDebrief>(`/api/v1/sessions/${sessionId}/debrief`, {});
}
