import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MissionPlayer } from "@/components/mission-player/mission-player";
import { getAuthToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/config";
import { missionService } from "@/services/mission.service";
import { worlds } from "@/content/worlds";

type Params = Promise<{ locale: string; worldSlug: string; missionId: string }>;
type Search = Promise<{ lesson?: string }>;

/**
 * `generateMetadata` and the page both need the mission, and Next.js runs them as part
 * of the same request. `cache` dedupes that to one query — Prisma calls are not
 * request-deduped the way `fetch` is, so without this every page view took two
 * connections out of the pool to read the same row.
 */
const loadMission = cache(async (missionId: string) => {
  // The phases come from `GET /v1/missions/{id}` when there is a token to call with, so
  // the player renders what the AI service serves. `getPhasedMission` falls back to the
  // stored row when the call fails, which is what keeps a reload working during an
  // outage — so a missing token is not an error here.
  let token = "";
  try {
    token = await getAuthToken();
  } catch {
    // Not signed in, or no session. The stored row still renders.
  }
  return missionService.getPhasedMission(missionId, token);
});

/**
 * Which lines of this mission have a recording.
 *
 * Imported rather than read from disk: `public/` is not part of the server bundle on most
 * deploys, so a `readFileSync` there works locally and quietly returns nothing in
 * production — every mission silent, with no error to notice. A mission absent from the
 * manifest simply has no audio, which is correct for anything outside the pinned set.
 */
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
        select: { id: true, slug: true, order: true },
      })
    : null;

  const lessonRecord = fromUrl ?? (stored.lessonId
    ? await db.lesson.findUnique({ where: { id: stored.lessonId }, select: { id: true, slug: true, order: true } })
    : null);
  const authoredWorld = worlds.find((world) => world.slug === worldSlug);
  const missionName = authoredWorld?.missions[lessonRecord?.order ?? -1]?.[locale] ?? null;

  return (
    <MissionPlayer
      locale={locale}
      mission={stored.mission}
      worldSlug={stored.trackSlug}
      worldTitle={stored.trackTitle}
      lessonId={lessonRecord?.id ?? stored.lessonId}
      lessonSlug={lessonRecord?.slug ?? lessonSlug ?? null}
      missionName={missionName}
      narrationKeys={[]}
    />
  );
}
