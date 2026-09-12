/**
 * Authentic road paths and splines authored to the painted artwork.
 *
 * In both the Egyptian Bakery and Cairo Traffic maps, the pedestrian road does not
 * travel in direct straight lines between stops — it winds smoothly around ovens, bread
 * display racks, palm trees, buildings, and crosswalks.
 *
 * This module provides Catmull-Rom spline interpolation and arc-length dot sampling so
 * that both the footstep dots and TICO walk naturally along the painted cobblestones
 * rather than cutting through sidewalks or scenery.
 */

export type Point = { x: number; y: number };

export type MapTheme = "bakery" | "traffic";

export const ROAD_WAYPOINTS: Record<MapTheme, readonly (readonly Point[])[]> = {
  bakery: [
    // Segment 0: Node 1 (613, 213) to Node 2 (812, 560) — curves down-left around the oven chimney
    [
      { x: 613, y: 213 },
      { x: 560, y: 275 },
      { x: 536, y: 335 },
      { x: 555, y: 395 },
      { x: 630, y: 445 },
      { x: 715, y: 495 },
      { x: 812, y: 560 },
    ],
    // Segment 1: Node 2 (812, 560) to Node 3 (800, 914) — loops out right around the bread display
    [
      { x: 812, y: 560 },
      { x: 880, y: 610 },
      { x: 940, y: 665 },
      { x: 980, y: 735 },
      { x: 960, y: 800 },
      { x: 880, y: 865 },
      { x: 800, y: 914 },
    ],
    // Segment 2: Node 3 (800, 914) to Node 4 (551, 1240) — curves down-left around the yellow house
    [
      { x: 800, y: 914 },
      { x: 710, y: 970 },
      { x: 600, y: 1025 },
      { x: 510, y: 1085 },
      { x: 472, y: 1145 },
      { x: 495, y: 1200 },
      { x: 551, y: 1240 },
    ],
    // Segment 3: Node 4 (551, 1240) to Node 5 (931, 1620) — swings right along the road to the finish
    [
      { x: 551, y: 1240 },
      { x: 630, y: 1285 },
      { x: 740, y: 1345 },
      { x: 845, y: 1410 },
      { x: 910, y: 1480 },
      { x: 965, y: 1545 },
      { x: 940, y: 1590 },
      { x: 931, y: 1620 },
    ],
  ],
  traffic: [
    // Segment 0: Node 1 (590, 220) to Node 2 (886, 634) — curves down-right around the corner
    [
      { x: 590, y: 220 },
      { x: 620, y: 260 },
      { x: 680, y: 310 },
      { x: 770, y: 370 },
      { x: 870, y: 430 },
      { x: 940, y: 520 },
      { x: 886, y: 634 },
    ],
    // Segment 1: Node 2 (886, 634) to Node 3 (484, 918) — curves down-left towards the crossing
    [
      { x: 886, y: 634 },
      { x: 820, y: 680 },
      { x: 740, y: 740 },
      { x: 630, y: 810 },
      { x: 530, y: 870 },
      { x: 484, y: 918 },
    ],
    // Segment 2: Node 3 (484, 918) to Node 4 (1011, 1402) — crosses street and swings right
    [
      { x: 484, y: 918 },
      { x: 465, y: 980 },
      { x: 510, y: 1050 },
      { x: 600, y: 1120 },
      { x: 760, y: 1200 },
      { x: 870, y: 1280 },
      { x: 960, y: 1350 },
      { x: 1011, y: 1402 },
    ],
    // Segment 3: Node 4 (1011, 1402) to Node 5 (745, 1725) — loops right and turns down-left
    [
      { x: 1011, y: 1402 },
      { x: 1030, y: 1460 },
      { x: 1020, y: 1520 },
      { x: 970, y: 1580 },
      { x: 890, y: 1640 },
      { x: 745, y: 1725 },
    ],
  ],
};

/**
 * Computes a smooth Catmull-Rom spline through a sequence of waypoints.
 */
export function catmullRomSpline(points: readonly Point[], samplesPerSegment = 24): Point[] {
  if (points.length < 2) return [...points];
  // Pad the ends so tangents at terminal points point naturally along the path
  const pts: Point[] = [points[0], ...points, points[points.length - 1]];
  const curve: Point[] = [];

  for (let i = 0; i < pts.length - 3; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const p2 = pts[i + 2];
    const p3 = pts[i + 3];

    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      curve.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }

  curve.push(pts[pts.length - 2]);
  return curve;
}

/**
 * Distributes footstep dots evenly along an arc-length parameterized curve,
 * maintaining proper margin around starting and ending node discs.
 */
export function sampleDotsAlongCurve(
  curve: readonly Point[],
  dotGap = 46,
  nodeRadius = 78,
): Point[] {
  if (curve.length < 2) return [];

  const dists: number[] = [0];
  for (let i = 0; i < curve.length - 1; i++) {
    const d = Math.hypot(curve[i + 1].x - curve[i].x, curve[i + 1].y - curve[i].y);
    dists.push(dists[dists.length - 1] + d);
  }

  const totalLength = dists[dists.length - 1];
  const usable = totalLength - nodeRadius * 2;
  if (usable <= 0) return [];

  const count = Math.max(1, Math.round(usable / dotGap));
  const dots: Point[] = [];

  for (let i = 0; i < count; i++) {
    const target = nodeRadius + (usable * (i + 0.5)) / count;
    let idx = 1;
    while (idx < dists.length && dists[idx] < target) idx++;

    const prevDist = dists[idx - 1];
    const nextDist = dists[idx] ?? prevDist;
    const span = nextDist - prevDist;
    const t = span > 1e-6 ? (target - prevDist) / span : 0;

    const p0 = curve[idx - 1];
    const p1 = curve[idx] ?? p0;

    dots.push({
      x: p0.x + (p1.x - p0.x) * t,
      y: p0.y + (p1.y - p0.y) * t,
    });
  }

  return dots;
}

/**
 * Returns a point along the curve at a specified progress ratio [0..1],
 * along with the facing direction determined by the curve's forward tangent.
 */
export function pointAlongCurve(
  curve: readonly Point[],
  ratio = 0.52,
): { x: number; y: number; face: "left" | "right" } {
  if (curve.length === 0) return { x: 0, y: 0, face: "right" };
  if (curve.length === 1) return { x: curve[0].x, y: curve[0].y, face: "right" };

  const dists: number[] = [0];
  for (let i = 0; i < curve.length - 1; i++) {
    dists.push(dists[dists.length - 1] + Math.hypot(curve[i + 1].x - curve[i].x, curve[i + 1].y - curve[i].y));
  }

  const totalLength = dists[dists.length - 1];
  const target = Math.max(0, Math.min(totalLength, totalLength * ratio));
  let idx = 1;
  while (idx < dists.length && dists[idx] < target) idx++;

  const prevDist = dists[idx - 1];
  const nextDist = dists[idx] ?? prevDist;
  const span = nextDist - prevDist;
  const t = span > 1e-6 ? (target - prevDist) / span : 0;

  const p0 = curve[idx - 1];
  const p1 = curve[idx] ?? p0;

  // Tangent vector to determine horizontal facing
  const lookBack = curve[Math.max(0, idx - 2)];
  const lookAhead = curve[Math.min(curve.length - 1, idx + 2)];
  const dx = lookAhead.x - lookBack.x;

  return {
    x: p0.x + (p1.x - p0.x) * t,
    y: p0.y + (p1.y - p0.y) * t,
    face: dx >= 0 ? "right" : "left",
  };
}

/**
 * Computes road dots between two challenge stops, following the painted road curve
 * when waypoints are authored for the theme, or falling back to a straight line.
 */
export function getRoadDots(
  from: { x: number; y: number },
  to: { x: number; y: number },
  theme?: MapTheme,
  segmentIndex?: number,
): Point[] {
  const ax = from.x + 92;
  const ay = from.y + 72;
  const bx = to.x + 92;
  const by = to.y + 72;

  if (theme && segmentIndex !== undefined) {
    const waypoints = ROAD_WAYPOINTS[theme]?.[segmentIndex];
    if (waypoints && waypoints.length >= 2) {
      // Anchor exact endpoints to current node centers
      const customWaypoints: Point[] = [
        { x: ax, y: ay },
        ...waypoints.slice(1, -1),
        { x: bx, y: by },
      ];
      const curve = catmullRomSpline(customWaypoints, 24);
      return sampleDotsAlongCurve(curve, 46, 78);
    }
  }

  // Linear fallback for unpainted / ad-hoc stages
  const span = Math.hypot(bx - ax, by - ay);
  const usable = span - 78 * 2;
  if (usable <= 0) return [];
  const count = Math.max(1, Math.round(usable / 46));
  return Array.from({ length: count }, (_, i) => {
    const at = (78 + (usable * (i + 0.5)) / count) / span;
    return { x: ax + (bx - ax) * at, y: ay + (by - ay) * at };
  });
}
