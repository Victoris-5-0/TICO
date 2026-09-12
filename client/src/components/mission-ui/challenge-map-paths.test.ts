import test from "node:test";
import assert from "node:assert/strict";

import {
  ROAD_WAYPOINTS,
  catmullRomSpline,
  getRoadDots,
  pointAlongCurve,
  sampleDotsAlongCurve,
} from "./challenge-map-paths";

test("catmullRomSpline preserves endpoints and generates smooth intermediate samples", () => {
  const points = [
    { x: 100, y: 100 },
    { x: 200, y: 300 },
    { x: 400, y: 500 },
  ];
  const curve = catmullRomSpline(points, 10);
  assert.ok(curve.length >= 20, "curve should contain interpolated samples");
  assert.equal(curve[0].x, 100);
  assert.equal(curve[0].y, 100);
  assert.equal(curve[curve.length - 1].x, 400);
  assert.equal(curve[curve.length - 1].y, 500);
});

test("sampleDotsAlongCurve respects node radius margin and creates evenly spaced points", () => {
  const straight = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
  ];
  const dots = sampleDotsAlongCurve(straight, 50, 80);
  assert.ok(dots.length > 5, "dots should be generated along 1000px line");
  // All dots must stay beyond 80px margin and before 920px
  for (const dot of dots) {
    assert.ok(dot.x >= 80, `dot x (${dot.x}) must be >= 80`);
    assert.ok(dot.x <= 920, `dot x (${dot.x}) must be <= 920`);
    assert.equal(dot.y, 0);
  }
});

test("getRoadDots follows the curvy bakery road rather than a straight line", () => {
  const node1 = { x: 521, y: 141 }; // center (613, 213)
  const node2 = { x: 720, y: 488 }; // center (812, 560)

  const dots = getRoadDots(node1, node2, "bakery", 0);
  assert.ok(dots.length > 0, "must produce dots for bakery segment 0");

  // In bakery segment 0, the road bends down-left around the oven (x drops down to ~536).
  // A straight line between 613 and 812 would have x strictly >= 613 everywhere!
  const hasLeftBend = dots.some((dot) => dot.x < 600);
  assert.ok(
    hasLeftBend,
    "curved road dots must bend left (x < 600) around the bakery oven, unlike a straight line",
  );
});

test("getRoadDots falls back to linear interpolation when theme or waypoints are absent", () => {
  const nodeA = { x: 100, y: 100 };
  const nodeB = { x: 500, y: 500 };

  const dots = getRoadDots(nodeA, nodeB);
  assert.ok(dots.length > 0);
  for (const dot of dots) {
    // On diagonal x === y (offset by node center +92, +72: x - 192 === y - 172)
    assert.ok(Math.abs((dot.x - 192) - (dot.y - 172)) < 1e-4);
  }
});

test("pointAlongCurve accurately determines facing direction along road curve", () => {
  // Segment curving right
  const curveRight = [
    { x: 100, y: 100 },
    { x: 200, y: 150 },
    { x: 300, y: 200 },
  ];
  const posRight = pointAlongCurve(curveRight, 0.5);
  assert.equal(posRight.face, "right");

  // Segment curving left
  const curveLeft = [
    { x: 500, y: 100 },
    { x: 400, y: 150 },
    { x: 300, y: 200 },
  ];
  const posLeft = pointAlongCurve(curveLeft, 0.5);
  assert.equal(posLeft.face, "left");
});
