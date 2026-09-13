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
import { TOUR } from "@/lib/bakery/world-tour";
import { ScriptPlayer } from "./script-player";

export function BakeryWorldTour({ locale }: { locale: Locale }) {
  return (
    <ScriptPlayer
      locale={locale}
      script={TOUR}
      finishHref={`/${locale}/worlds/el-forn`}
      finishLabel={{ ar: "يلا نشوف المهام", en: "See the missions" }}
    />
  );
}
