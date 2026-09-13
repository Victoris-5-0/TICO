/**
 * Lessons that are played as an authored script rather than a generated mission.
 *
 * NOT WIRED YET. The mission route still renders the old `MissionPlayer` for every
 * lesson; this registry and the script beside it are the material for the interactivity
 * rebuild described in `docs/14-interactive-missions.md`, kept here so the work already
 * done is not lost. Nothing imports it from a page.
 *
 * Keyed by lesson slug, deliberately. The alternative — keying by generated mission id —
 * is what went wrong before: two `variables-1` rows existed for this lesson, the claim
 * service picked whichever it liked, and content authored into one of them was simply
 * never the one served. A lesson is a stable thing a person can name; a mission row is
 * an implementation detail of the pool.
 *
 * A lesson listed here ignores its row's `content` entirely. The row still exists and the
 * session still runs against it, so progress, telemetry and lesson credit are unchanged —
 * only what is rendered differs.
 */

import type { Script } from "../script";
import { OPENING_MESSAGE } from "./opening-message";

export type AuthoredMission = {
  script: Script;
  titleAr: string;
  titleEn: string;
};

export const AUTHORED: Record<string, AuthoredMission> = {
  "opening-message": {
    script: OPENING_MESSAGE,
    titleAr: "أول عيش في اليوم",
    titleEn: "The first bread of the day",
  },
};

export const authoredFor = (lessonSlug: string | null | undefined): AuthoredMission | null =>
  (lessonSlug && AUTHORED[lessonSlug]) || null;
