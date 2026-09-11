import { db } from "@/lib/db";

import type { ChallengeNode } from "@/components/mission-ui/challenge-map";
import type { MapStage } from "@/components/mission-ui/challenge-map-view";

/**
 * What a student sees on the painted map: which missions exist, which are open, and
 * where TICO is standing.
 *
 * One place rather than two. The world page and the challenge map both answer "what have
 * I unlocked?", and when each worked it out for itself they could disagree — a world page
 * offering a mission the map still showed as locked is the kind of contradiction a child
 * reads as the game being broken.
 */

/**
 * Where each world's missions sit on its painted map. Authored to the artwork, in the
 * 1440 x 1929 scene the component expects.
 */
const POSITIONS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  bakery: [[521, 141], [720, 488], [708, 842], [459, 1168], [839, 1548]],
  traffic: [[498, 148], [794, 562], [392, 846], [919, 1330], [653, 1653]],
};

/** Only two worlds have map artwork. A third would need its own painted scene. */
const THEMES: Record<string, "bakery" | "traffic"> = {
  "el-forn": "bakery",
  "isharet-cairo": "traffic",
};

/** The scene TICO stands in, and the sprite's own size, both in scene units. */
const SCENE = { width: 1440, height: 1929 };
const TICO = { width: 305, height: 329 };
const NODE = { width: 184, height: 144 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Stand TICO next to a mission rather than parked at the bottom of the map.
 *
 * The companion is how a student finds their place on a map of five identical-looking
 * stops, so it belongs beside the one they are on. It goes on whichever side has room
 * and is kept inside the scene, since both sprite and node are positioned from their
 * top-left corner and a node near an edge would otherwise push TICO off the artwork.
 */
function standBeside(node: { x: number; y: number }) {
  const toTheRight = node.x < SCENE.width / 2;
  return {
    x: clamp(toTheRight ? node.x + NODE.width - 24 : node.x - TICO.width + 24, 8, SCENE.width - TICO.width - 8),
    y: clamp(node.y + NODE.height - 64, 8, SCENE.height - TICO.height - 8),
  };
}

export type ChallengeMapData = {
  stages: MapStage[];
  /** A world with missions but no painted map, named rather than quietly dropped. */
  pending: string | null;
  /** The mission that just opened up, when the student arrives from a finished one. */
  unlocked: { nodeId: string; label: string } | null;
};

export async function buildChallengeMap({
  userId,
  ar,
  trackSlug,
  done,
}: {
  userId?: string | null;
  ar: boolean;
  /** One world's map, for a world page. Omit for every world. */
  trackSlug?: string;
  /** The lesson slug a student just finished, from `?done=`. */
  done?: string;
}): Promise<ChallengeMapData> {
  const tracks = await db.track.findMany({
    where: trackSlug ? { slug: trackSlug } : undefined,
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" }, select: { id: true, slug: true, title: true } } },
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

  const stages: MapStage[] = [];
  /** The node TICO stands on in each stage, in step with `stages`. */
  const standing: ChallengeNode[] = [];
  let unlocked: ChallengeMapData["unlocked"] = null;

  for (const track of tracks) {
    const theme = THEMES[track.slug];
    if (!theme || !track.lessons.length) continue;

    // The first unfinished lesson is where the student is; everything after it waits.
    const currentIndex = track.lessons.findIndex((lesson) => !completed.has(lesson.id));
    const positions = POSITIONS[theme];

    const nodes: ChallengeNode[] = track.lessons.slice(0, positions.length).map((lesson, index) => {
      const [x, y] = positions[index];
      const status: ChallengeNode["status"] =
        completed.has(lesson.id) ? "completed"
        : index === currentIndex ? "current"
        : "locked";
      return { id: `${track.slug}-${lesson.slug}`, label: lesson.title, x, y, status };
    });

    // Arriving from a finished mission: the lesson after it is what just opened up.
    //
    // Announced only when that lesson is genuinely reachable now. `?done=` is a hint in a
    // URL — anyone can type it, and a student who quit a mission early would otherwise be
    // congratulated on unlocking something still locked behind them.
    if (done) {
      const finished = track.lessons.findIndex((lesson) => lesson.slug === done);
      const next = finished >= 0 ? track.lessons[finished + 1] : undefined;
      const reachable = next && nodes.find((node) => node.id === `${track.slug}-${next.slug}`)?.status === "current";
      if (next && reachable) unlocked = { nodeId: `${track.slug}-${next.slug}`, label: next.title };
    }

    // TICO waits on the mission they are about to play, or on the last one they beat
    // when the world is finished.
    const here = nodes.find((node) => node.status === "current") ?? nodes[nodes.length - 1];

    stages.push({
      id: track.slug,
      worldSlug: track.slug,
      title: track.title,
      stageLabel: ar ? `المرحلة ${stages.length + 1}` : `Stage 0${stages.length + 1}`,
      theme,
      nodes,
      slugs: Object.fromEntries(track.lessons.map((lesson) => [`${track.slug}-${lesson.slug}`, lesson.slug])),
      companion: standBeside(here),
    });
    standing.push(here);
  }

  // One speech bubble, on the world the student is actually in. TICO stands on every
  // map — that is how you find your place — but a page of three worlds with three of
  // them talking at once is noise, not guidance.
  const speaking = standing.findIndex((node) => node.status === "current");
  const index = speaking >= 0 ? speaking : 0;
  const stage = stages[index];
  if (stage?.companion) {
    stage.companion = {
      ...stage.companion,
      message:
        standing[index].status === "completed"
          ? (ar ? "خلّصت العالم ده!" : "World complete!")
          : completed.size
            ? (ar ? "دورك هنا!" : "You're up next!")
            : (ar ? "مين عايز يبدأ؟" : "Who's starting?"),
    };
  }

  // A world page asks about one world and cannot be missing another; the full map can.
  const pending = trackSlug
    ? null
    : tracks.find((track) => !THEMES[track.slug] && track.lessons.length)?.title ?? null;

  return { stages, pending, unlocked };
}
