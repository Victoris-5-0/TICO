import { db } from "@/lib/db";
import { worlds } from "@/content/worlds";

import type { ChallengeNode } from "@/components/mission-ui/challenge-map";
import { ROAD_WAYPOINTS, catmullRomSpline, pointAlongCurve } from "@/components/mission-ui/challenge-map-paths";
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

/** The middle of a node's disc, which is what the path and the companion aim at. */
const centre = (node: { x: number; y: number }) => ({ x: node.x + NODE.width / 2, y: node.y + NODE.height / 2 });

/** Both sprite and node are placed by their top-left corner; keep them on the artwork. */
function place(x: number, y: number, face: "left" | "right") {
  return {
    x: clamp(x - TICO.width / 2, 8, SCENE.width - TICO.width - 8),
    y: clamp(y - TICO.height + 40, 8, SCENE.height - TICO.height - 8),
    face,
  };
}

/**
 * Stand TICO next to a mission rather than parked at the bottom of the map.
 *
 * The companion is how a student finds their place on a map of five identical-looking
 * stops. Once they have finished something it says more than "you are here": TICO walks
 * the road, standing between the stop they beat and the one that just opened, facing the
 * way they are going — so the map answers "what now?" before anything is read.
 */
function standBeside(
  node: { x: number; y: number },
  theme?: "bakery" | "traffic",
  isFirstNode?: boolean,
) {
  if (theme === "bakery" && isFirstNode) {
    return place(670, 180, "left");
  }
  if (theme === "traffic" && isFirstNode) {
    return place(580, 170, "right");
  }
  // Beside the stop, turned towards it.
  const toTheRight = node.x < SCENE.width / 2;
  const from = centre(node);
  return toTheRight
    ? place(from.x + NODE.width, from.y + NODE.height / 2, "left")
    : place(from.x - NODE.width, from.y + NODE.height / 2, "right");
}

/**
 * Walking the road between two stops.
 *
 * Follows the curved road spline rather than cutting across sidewalks, placing TICO
 * past halfway along the winding cobblestone path facing the direction of travel.
 */
function walkBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
  theme?: "bakery" | "traffic",
  segmentIndex?: number,
) {
  if (theme && segmentIndex !== undefined) {
    const waypoints = ROAD_WAYPOINTS[theme]?.[segmentIndex];
    if (waypoints && waypoints.length >= 2) {
      const a = centre(from);
      const b = centre(to);
      const customWaypoints = [a, ...waypoints.slice(1, -1), b];
      const curve = catmullRomSpline(customWaypoints, 24);
      const pt = pointAlongCurve(curve, 0.52);
      return place(pt.x, pt.y, pt.face);
    }
  }
  const a = centre(from);
  const b = centre(to);
  const at = 0.55;
  return place(a.x + (b.x - a.x) * at, a.y + (b.y - a.y) * at, b.x >= a.x ? "right" : "left");
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

    const authoredWorld = worlds.find((w) => w.slug === track.slug);
    const nodes: ChallengeNode[] = track.lessons.slice(0, positions.length).map((lesson, index) => {
      const [x, y] = positions[index];
      const status: ChallengeNode["status"] =
        completed.has(lesson.id) ? "completed"
        : index === currentIndex ? "current"
        : "locked";
      const arabicFromWorld = authoredWorld?.missions[index]?.["ar-EG"];
      const label = arabicFromWorld || lesson.title.replace(/\s*\([^)]*\)/g, "").trim();
      return { id: `${track.slug}-${lesson.slug}`, label, x, y, status };
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
      if (next && reachable) {
        const nextIndex = track.lessons.findIndex((l) => l.id === next.id);
        const nextLabel = authoredWorld?.missions[nextIndex]?.["ar-EG"] || next.title.replace(/\s*\([^)]*\)/g, "").trim();
        unlocked = { nodeId: `${track.slug}-${next.slug}`, label: nextLabel };
      }
    }

    // TICO is on the road to the mission they are about to play, or standing on the last
    // one they beat when the world is finished.
    const currentNode = nodes.findIndex((node) => node.status === "current");
    const here = currentNode >= 0 ? nodes[currentNode] : nodes[nodes.length - 1];
    const previous = currentNode > 0 ? nodes[currentNode - 1] : null;

    stages.push({
      id: track.slug,
      worldSlug: track.slug,
      title: track.title,
      stageLabel: ar ? `المرحلة ${stages.length + 1}` : `Stage 0${stages.length + 1}`,
      theme,
      nodes,
      slugs: Object.fromEntries(track.lessons.map((lesson) => [`${track.slug}-${lesson.slug}`, lesson.slug])),
      companion: previous
        ? walkBetween(previous, here, theme, currentNode - 1)
        : standBeside(here, theme, currentNode === 0),
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
