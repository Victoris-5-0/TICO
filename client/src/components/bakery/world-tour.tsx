"use client";

/**
 * The opening tour, as a script.
 *
 * Everything that plays it lives in `ScriptPlayer` — this file only decides which script
 * and where the last button goes. Mission one is the same component with a different
 * array, which is the point: what a child sees in a mission is the world they were just
 * shown round, not a new screen.
 */

import type { Locale } from "@/i18n/config";
import { tourNarrationDir } from "@/lib/bakery/tour-narration";
import manifest from "@/lib/bakery/tour-narration-manifest.json";
import { TOUR } from "@/lib/bakery/world-tour";
import { ScriptPlayer } from "./script-player";

const WORLD = "el-forn";

/**
 * Which stops have a recording. Imported rather than read from `public/` at runtime, for
 * the same reason the mission manifest is: on a deploy where `public/` is a CDN and not
 * bundled with the server, a file read returns nothing and the tour goes silently mute.
 */
const NARRATION = {
  dir: tourNarrationDir(WORLD),
  keys: (manifest as { tours?: Record<string, string[]> }).tours?.[WORLD] ?? [],
};

export function BakeryWorldTour({ locale }: { locale: Locale }) {
  return (
    <ScriptPlayer
      locale={locale}
      script={TOUR}
      finishHref={`/${locale}/worlds/${WORLD}`}
      finishLabel={{ ar: "يلا نشوف المهام", en: "See the missions" }}
      narration={NARRATION}
    />
  );
}
