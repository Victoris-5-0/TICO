import { db } from "@/lib/db";

import type { MapChapter } from "@/components/mission-ui/chapters-map";
import type { MapWorld } from "@/components/mission-ui/chapter-worlds-map";
import { chapters, type Chapter } from "@/content/chapters";
import { worlds as authored } from "@/content/worlds";
import type { Locale } from "@/i18n/config";

/**
 * Which chapter a student may walk into, which of its worlds, and how far through each
 * they already are.
 *
 * Two maps, one answer. The chapters map and a chapter's worlds map both decide "what is
 * open?", and when each worked it out for itself they could disagree — a chapter offering
 * a world its own map still showed as locked is the kind of contradiction a child reads as
 * the game being broken. So both read the same progress here, and the same rule.
 *
 * Unlocking is linear, per `docs/decisions/0001-mvp-baseline.md`: curriculum order is
 * fixed, a world opens when the one before it is finished, and a chapter opens when the
 * chapter before it is finished — never on XP.
 */

type TrackRow = { slug: string; title: string; lessons: { id: string }[] };

type Progress = {
  /** Every world with missions in it, in curriculum order. */
  tracks: TrackRow[];
  /** Lesson ids the student has completed. */
  completed: Set<string>;
};

async function loadProgress(userId?: string | null): Promise<Progress> {
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

  // A world with no missions is not somewhere to walk into, so it never takes an island.
  return { tracks: tracks.filter((track) => track.lessons.length), completed };
}

/**
 * The tracks in each chapter, in the chapter's order.
 *
 * A track the content file does not claim is appended to the first chapter rather than
 * dropped: a world with missions in it must stay reachable from the map, even before
 * someone remembers to list it.
 */
function tracksByChapter(tracks: TrackRow[]): Map<Chapter["slug"], TrackRow[]> {
  const claimed = new Set(chapters.flatMap((chapter) => chapter.worlds));
  const map = new Map<Chapter["slug"], TrackRow[]>();
  for (const chapter of chapters) {
    const own = chapter.worlds
      .map((slug) => tracks.find((track) => track.slug === slug))
      .filter((track): track is TrackRow => Boolean(track));
    map.set(chapter.slug, own);
  }
  const first = map.get(chapters[0].slug)!;
  first.push(...tracks.filter((track) => !claimed.has(track.slug)));
  return map;
}

const finishedTrack = (track: TrackRow, completed: Set<string>) =>
  track.lessons.every((lesson) => completed.has(lesson.id));

/** The database keeps one title per track; the authored worlds keep both languages. */
const worldTitle = (track: TrackRow, locale: Locale) =>
  authored.find((world) => world.slug === track.slug)?.title[locale] ?? track.title;

type ChapterState = { chapter: Chapter; tracks: TrackRow[]; status: MapChapter["status"]; after: string | null };

function chapterStates(progress: Progress, locale: Locale): ChapterState[] {
  const grouped = tracksByChapter(progress.tracks);
  const states: ChapterState[] = [];
  /** The chapter before this one: whether it is finished decides whether this one is open. */
  let previous: { title: string; finished: boolean } | null = null;

  for (const chapter of chapters) {
    const tracks = grouped.get(chapter.slug) ?? [];
    const finished = tracks.length > 0 && tracks.every((track) => finishedTrack(track, progress.completed));
    /** The chapter ahead of this one, while it is still unfinished — what shuts this one. */
    const blocker = previous && !previous.finished ? previous.title : null;

    states.push({
      chapter,
      tracks,
      status: !tracks.length ? "soon" : finished ? "completed" : blocker ? "locked" : "current",
      after: blocker,
    });

    // A chapter with nothing built in it never opens, so it also never blocks: the road
    // stops at the last real chapter rather than at a drawing.
    if (tracks.length) previous = { title: chapter.title[locale], finished };
  }

  return states;
}

export async function buildChaptersMap({
  userId,
  locale,
}: {
  userId?: string | null;
  locale: Locale;
}): Promise<MapChapter[]> {
  const progress = await loadProgress(userId);

  return chapterStates(progress, locale).map(({ chapter, tracks, status, after }) => ({
    slug: chapter.slug,
    title: chapter.title[locale],
    kicker: chapter.kicker[locale],
    island: chapter.island,
    status,
    after,
    worldsDone: tracks.filter((track) => finishedTrack(track, progress.completed)).length,
    worldsTotal: tracks.length,
  }));
}

export type ChapterWorldsMap = {
  status: MapChapter["status"];
  worlds: MapWorld[];
};

export async function buildChapterWorlds({
  userId,
  locale,
  chapterSlug,
}: {
  userId?: string | null;
  locale: Locale;
  chapterSlug: Chapter["slug"];
}): Promise<ChapterWorldsMap> {
  const progress = await loadProgress(userId);
  const state = chapterStates(progress, locale).find(({ chapter }) => chapter.slug === chapterSlug)!;

  const worlds: MapWorld[] = [];
  let previous: { title: string; finished: boolean } | null = null;

  for (const track of state.tracks) {
    const missionsDone = track.lessons.filter((lesson) => progress.completed.has(lesson.id)).length;
    const finished = missionsDone === track.lessons.length;
    const blocker = previous && !previous.finished ? previous.title : null;
    const title = worldTitle(track, locale);

    worlds.push({
      slot: worlds.length + 1,
      slug: track.slug,
      title,
      status: finished ? "completed" : blocker ? "locked" : "current",
      after: blocker,
      missionsDone,
      missionsTotal: track.lessons.length,
    });

    previous = { title, finished };
  }

  return { status: state.status, worlds };
}
