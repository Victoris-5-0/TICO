import { db } from "@/lib/db";

import type { MapWorld } from "@/components/mission-ui/worlds-map";
import { worlds as authored } from "@/content/worlds";
import type { Locale } from "@/i18n/config";

/**
 * Which world a student may walk into, and how far through each they already are.
 *
 * The painted map has six clearings and the curriculum has three worlds, so two kinds of
 * world carry a lock and they are shut for different reasons: one waits on the world
 * before it, the other waits on us drawing it. A child reads "not yet yours" and "not yet
 * made" as the same thing unless the map says which, so the status keeps them apart and
 * the plaque names the world that has to be finished first.
 *
 * Unlocking is linear, per `docs/decisions/0001-mvp-baseline.md`: curriculum order is
 * fixed, and a world opens when the one before it is finished — never on XP.
 */

/** The map art has three core launch worlds across Egypt. */
export const CLEARINGS = 3;

export async function buildWorldsMap({
  userId,
  locale,
}: {
  userId?: string | null;
  locale: Locale;
}): Promise<MapWorld[]> {
  const tracks = await db.track.findMany({
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" }, select: { id: true } } },
  });

  const completed = userId
    ? new Set(
        (
          await db.userProgress.findMany({
            where: { userId, completed: true },
            select: { lessonId: true },
          })
        ).map((row) => row.lessonId),
      )
    : new Set<string>();

  // A world with no missions is not somewhere to walk into, so it never takes a clearing.
  const playable = tracks.filter((track) => track.lessons.length).slice(0, CLEARINGS);

  const map: MapWorld[] = [];
  /** The world before this one: whether it is finished decides whether this one is open. */
  let previous: { title: string; finished: boolean } | null = null;

  for (const track of playable) {
    const missionsDone = track.lessons.filter((lesson) => completed.has(lesson.id)).length;
    const finished = missionsDone === track.lessons.length;
    /** The world ahead of this one, while it is still unfinished — what shuts this one. */
    const blocker = previous && !previous.finished ? previous.title : null;

    map.push({
      slot: map.length + 1,
      slug: track.slug,
      // The database keeps one title per track; the authored worlds keep both languages.
      title: authored.find((world) => world.slug === track.slug)?.title[locale] ?? track.title,
      status: finished ? "completed" : blocker ? "locked" : "current",
      after: blocker,
      missionsDone,
      missionsTotal: track.lessons.length,
    });

    previous = { title: map[map.length - 1].title, finished };
  }

  // A clearing with nothing on it is still a place on the map, so it is numbered rather
  // than called "Coming soon" twice over — the plaque's second line already says that.
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  while (map.length < CLEARINGS) {
    const slot = map.length + 1;
    map.push({
      slot,
      slug: null,
      title: locale === "ar-EG" ? `العالم ${arabicDigits[slot]}` : `World 0${slot}`,
      status: "soon",
      after: null,
      missionsDone: 0,
      missionsTotal: 0,
    });
  }

  return map;
}
