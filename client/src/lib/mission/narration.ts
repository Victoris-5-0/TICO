import type { PhasedMissionOut } from "@/lib/ai/types";

/**
 * Every line of a mission that can be spoken, and the key its recording is filed under.
 *
 * One list, used by both sides: `scripts/generate-mission-audio.ts` walks it to decide
 * what to synthesise, and the player walks it to decide what to play. If the two had
 * their own copies, a key renamed in one place would silently produce a mission whose
 * audio never plays — the file would exist, under a name nothing asks for.
 *
 * Keys are positional (`explore.q1`) rather than content-derived, so re-recording a line
 * after an edit overwrites the same file instead of orphaning the old one.
 */

export type NarrationLine = {
  /** Stable id. Becomes the filename: `<key>.mp3`. */
  key: string;
  text: string;
  /** Who is speaking, where the mission says. Used to pick a voice per character. */
  speaker: string;
};

/**
 * The narrative lines — what a child listens to rather than reads.
 *
 * Questions, hints and code annotations are deliberately excluded from `core`: they are
 * read while thinking, often re-read, and narrating them turns a puzzle into a lecture.
 * `all` includes them for when there is budget to record everything.
 */
export function narrationLines(mission: PhasedMissionOut, scope: "core" | "all" = "core"): NarrationLine[] {
  const p = mission.phases;
  const lines: NarrationLine[] = [];

  const push = (key: string, text: string | null | undefined, speaker: string) => {
    const trimmed = (text ?? "").trim();
    if (trimmed) lines.push({ key, text: trimmed, speaker });
  };

  // 1. The problem, in the voice of whoever has it.
  push("encounter", p.encounter.lineAr, p.encounter.speaker || "tico");

  // 2. TICO opening the questions.
  push("explore.intro", p.explore.ticoIntroAr, "tico");

  // 3. The concept, named and explained.
  push("discover.explanation", p.discover.explanationAr, "tico");
  push("discover.tico", p.discover.ticoLineAr, "tico");

  // 4. The twist that starts phase 6.
  push("remix.twist", p.remix.twistAr, "tico");

  if (scope === "core") return lines;

  p.explore.rounds.forEach((round, i) => {
    push(`explore.q${i + 1}`, round.questionAr, "tico");
    push(`explore.nudge${i + 1}`, round.nudgeAr, "tico");
  });
  push("understand.intro", p.understand.introAr, "tico");
  p.guided.steps.forEach((step, i) => {
    push(`guided.prompt${i + 1}`, step.promptAr, "tico");
    push(`guided.hint${i + 1}`, step.hintAr, "tico");
  });
  push("remix.requirement", p.remix.newRequirementAr, "tico");

  return lines;
}

/** Where a mission's recordings live, relative to `public/`. */
export const narrationDir = (missionId: string) => `/audio/missions/${missionId}`;

/** The manifest the player reads to know which recordings exist. */
export const NARRATION_MANIFEST = "/audio/missions/manifest.json";

export type NarrationManifest = {
  voiceId: string;
  model: string;
  /** missionId -> the line keys that have a recording. */
  missions: Record<string, string[]>;
};
