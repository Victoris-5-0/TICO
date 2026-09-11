import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MissionPlayer } from "@/components/mission-player/mission-player";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/config";
import { missionService } from "@/services/mission.service";

type Params = Promise<{ locale: string; worldSlug: string; missionId: string }>;
type Search = Promise<{ lesson?: string }>;

/**
 * `generateMetadata` and the page both need the mission, and Next.js runs them as part
 * of the same request. `cache` dedupes that to one query — Prisma calls are not
 * request-deduped the way `fetch` is, so without this every page view took two
 * connections out of the pool to read the same row.
 */
const loadMission = cache((missionId: string) => missionService.getPhasedMission(missionId));

/**
 * Which lines of this mission have a recording.
 *
 * Read from the generated manifest on the server, so the player ships with the answer
 * rather than fetching it and briefly rendering controls that may not work. A missing or
 * unreadable manifest means no audio — the mission plays silently, which is the correct
 * behaviour for anything outside the pinned set.
 */
const narrationKeys = cache((missionId: string): string[] => {
  try {
    const file = join(process.cwd(), "public/audio/missions/manifest.json");
    const manifest = JSON.parse(readFileSync(file, "utf8")) as { missions?: Record<string, string[]> };
    return manifest.missions?.[missionId] ?? [];
  } catch {
    return [];
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, missionId } = await params;
  if (!isLocale(locale)) return {};
  const stored = await loadMission(missionId);
  return stored
    ? { title: stored.mission.titleAr, robots: { index: false } }
    : { robots: { index: false } };
}

/**
 * Play one generated mission.
 *
 * A Server Component that reads the row and hands it to the client player, so the six
 * phases are in the first response rather than behind a fetch. `getPhasedMission`
 * returns null for a missing row, a row whose `content` lost its phases, and an
 * unvalidated mission — all three are a 404 here, because none of them is something a
 * student should be looking at.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale, worldSlug, missionId } = await params;
  const { lesson: lessonSlug } = await searchParams;
  if (!isLocale(locale)) notFound();

  const stored = await loadMission(missionId);
  if (!stored) notFound();

  // A mission reached through the wrong world would render the wrong scene assets.
  if (stored.trackSlug !== worldSlug) notFound();

  // `?lesson=` is set by the play route and is authoritative: a pinned mission is shared,
  // so the row itself cannot say which lesson a given student opened it from.
  const fromUrl = lessonSlug
    ? await db.lesson.findFirst({
        where: { slug: lessonSlug, track: { slug: worldSlug } },
        select: { id: true },
      })
    : null;

  return (
    <MissionPlayer
      locale={locale}
      mission={stored.mission}
      worldSlug={stored.trackSlug}
      worldTitle={stored.trackTitle}
      lessonId={fromUrl?.id ?? stored.lessonId}
      narrationKeys={narrationKeys(missionId)}
    />
  );
}
