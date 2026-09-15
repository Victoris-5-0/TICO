import type { NarrationLine } from "@/lib/mission/narration";
import type { Script } from "./script";

/**
 * Every line of an authored script that can be spoken, and the key its recording is
 * filed under.
 *
 * The same arrangement as `lib/mission/narration.ts` for the pinned missions: one list,
 * walked by `scripts/generate-tour-audio.ts` to decide what to synthesise and by the
 * player to decide what to play. A stop's `id` is already stable and unique — it is what
 * the tour's tests and the player key on — so it is the filename too, and re-recording a
 * line after an edit overwrites the same file.
 *
 * Only `ar` is recorded. The tour is spoken in Egyptian Arabic; `en` is a working
 * translation for a judge reading the screen, not a second performance.
 */
export function tourNarrationLines(script: Script): NarrationLine[] {
  return script
    .map((stop) => ({ key: stop.id, text: stop.ar.trim(), speaker: stop.speaker }))
    .filter((line) => line.text);
}

/** Where a world's tour recordings live, relative to `public/`. */
export const tourNarrationDir = (world: string) => `/audio/tours/${world}`;

/** The manifest the player reads to know which stops have a recording. */
export type TourNarrationManifest = {
  voiceId: string;
  model: string;
  /** world slug -> the stop ids that have a recording. */
  tours: Record<string, string[]>;
};
