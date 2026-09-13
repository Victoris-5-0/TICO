import type { CustomerId } from "./simulation";

/**
 * Where everything in the bakery is, in one 1600×900 coordinate system.
 *
 * ## The background changed, so this file exists
 *
 * `environment.webp` was re-drawn on 2026-09-13: the old painting had a shallow shopfront
 * with the oven and counter baked into a narrow alcove, and the new one is a single wide
 * empty arch — a room to furnish rather than a facade to stand in front of. Every fixture
 * therefore moved, and the animation used to carry the old positions as bare numbers
 * scattered through `scene.tsx` and `neighborhood-details.tsx`.
 *
 * They are all here now, as rectangles. The peel's travel, the oven's fire, where loaves
 * land on the tray and where the baker stands to load are derived from these, so the next
 * time the art changes the numbers move once instead of eleven times.
 *
 * ## Scale
 *
 * Roughly 143 units to the metre: the baker is 250 tall for about 1.75 m, the counter top
 * sits 111 above his feet, and the props were cut down to match. The shop floor runs from
 * y≈648 at the back wall to y≈690 at the threshold, and the pavement outside from y≈690 to
 * the kerb at y≈855.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type ActorAsset = { src: string; columns: number; rows: number; hands: Point[]; receiveHand: Point };

export type BakerySceneManifest = {
  version: 3; width: number; height: number;
  queue: { first: Point; spacing: number; actorSize: number };
  /** The baker's feet, and how tall he is drawn. Hand sockets scale with `bakerSize`. */
  baker: Point; bakerSize: number;
  /** The coordinator's feet, outside on the pavement. */
  salma: Point; salmaSize: number;
  /** The mouth of the oven — where dough goes in and the fire shows. */
  oven: Point;
  /** The middle of the bread tray's top surface. */
  tray: Point;
  actors: Record<CustomerId | "hassan" | "salma", ActorAsset>;
};

export const asset = (name: string) => `/assets/bakery-v2/${name}.webp`;

/**
 * The painted furniture, as rectangles rather than numbers inside JSX.
 *
 * Only these six are drawn from `bakery-v2/*.webp` directly; everything else in the shop
 * is a cut frame from `worldProps` below.
 */
export const fixtures = {
  oven: { x: 240, y: 316, width: 180, height: 332 },
  counter: { x: 470, y: 554, width: 360, height: 124 },
  worktop: { x: 462, y: 540, width: 376, height: 30 },
  tray: { x: 500, y: 532, width: 105, height: 22 },
  olive: { x: 1498, y: 596, width: 72, height: 200 },
  aloe: { x: 1404, y: 712, width: 72, height: 91 },
} as const satisfies Record<string, Rect>;

// Hand sockets are in world units relative to the normalized foot pivot at size 310.
const customer = (name: string, receiveHand: Point = { x: -73, y: -151 }): ActorAsset => ({
  src: asset(name), columns: 3, rows: 2, receiveHand,
  hands: [{ x: 26, y: -107 }, { x: 51, y: -105 }, { x: 0, y: -119 }, { x: 47, y: -109 }, { x: -5, y: -116 }, receiveHand],
});

export const bakeryScene: BakerySceneManifest = {
  version: 3, width: 1600, height: 900,
  // The queue forms on the pavement outside, left to right across the front of the shop.
  queue: { first: { x: 520, y: 815 }, spacing: 126, actorSize: 280 },
  baker: { x: 600, y: 665 }, bakerSize: 250,
  salma: { x: 300, y: 850 }, salmaSize: 230,
  oven: { x: 328, y: 481 }, tray: { x: 552, y: 543 },
  actors: {
    hassan: { src: asset("hassan"), columns: 4, rows: 4,
      receiveHand: { x: 84, y: -141 },
      hands: [{ x: -15, y: -132 }, { x: 61, y: -160 }, { x: 108, y: -191 }, { x: 68, y: -164 }, { x: 108, y: -182 }, { x: 103, y: -178 }, { x: 36, y: -150 }, { x: 27, y: -130 }, { x: -15, y: -132 }, { x: 39, y: -181 }, { x: 75, y: -109 }, { x: 27, y: -130 }, { x: -15, y: -132 }, { x: 69, y: -122 }, { x: 84, y: -141 }, { x: -15, y: -132 }],
    },
    mariam: customer("mariam", { x: -73, y: -162 }),
    nour: customer("nour", { x: -66, y: -153 }), amina: customer("amina"), omar: customer("omar"),
    dina: customer("dina", { x: -64, y: -153 }), youssef: customer("youssef"),
    hoda: customer("hoda"), farid: customer("farid-saidi", { x: -78, y: -150 }),
    salma: { ...customer("salma"), columns: 2, rows: 1 },
  },
};

/** The frame the hand sockets were measured against. Any other size scales them. */
export const HAND_REFERENCE_SIZE = 310;
export const handAt = (actor: ActorAsset, frame: number, size: number): Point => {
  const hand = actor.hands[frame] ?? actor.hands[0];
  const k = size / HAND_REFERENCE_SIZE;
  return { x: hand.x * k, y: hand.y * k };
};

export const fixtureNames = ["environment", "oven", "counter", "worktop", "olive", "aloe", "loaf", "dough", "tray", "peel", "bag", "oven-fire", "radio"];

export function sceneAssetUrls() {
  return [...fixtureNames.map(asset), ...Object.values(bakeryScene.actors).map((actor) => actor.src)];
}

// ---------------------------------------------------------------- loose props
/**
 * The props cut from the 2026-09-13 sheets, and where each one stands.
 *
 * All of it is inside the shop, and all of it is small. The new arch is a real room and
 * the old sizes read as doll furniture in it, so everything was cut down against the
 * baker: a sack of flour comes to his knee, the scale is a thing he can lift. The one
 * exception is the delivery scooter, which is parked out on the pavement at the far left
 * where it belongs, because it is the only prop that is not bakery equipment.
 *
 * Everything on the counter has its bottom edge at y=554, which is the worktop's painted
 * surface. Everything standing on the shop floor sits between y=640 and y=648, which is
 * where the back wall meets it.
 *
 * They are all drawn at once, for the whole tour. There is no camera and no close-up: the
 * scene is a stage a child looks at, and pointing at something is done by outlining it.
 * That is also why nothing here may overlap — `world-tour.test.ts` enforces it, because
 * two props in one rectangle is a click target underneath a click target.
 */
export type PropPlacement = { x: number; y: number; width: number; height: number; src?: string };

export const frame = (name: string) => `/assets/bakery-v2/frames/${name}.webp`;

export const worldProps = {
  // --- bolted to the oven's face
  "oven-gauge": { x: 282, y: 350, width: 42, height: 37 },
  // --- along the counter, left to right
  "ticket-discs": { x: 470, y: 540, width: 24, height: 14 },
  "ticket-stand": { x: 615, y: 506, width: 22, height: 48 },
  till: { x: 650, y: 518, width: 44, height: 36 },
  scale: { x: 705, y: 520, width: 40, height: 34 },
  "bread-board": { x: 755, y: 520, width: 82, height: 34 },
  // --- the production floor, right of the counter and against the back wall
  "dough-table": { x: 880, y: 568, width: 145, height: 78 },
  "flour-sacks": { x: 1045, y: 558, width: 104, height: 82 },
  "bread-crate": { x: 1165, y: 600, width: 74, height: 43 },
  "order-clipboard": { x: 1180, y: 420, width: 40, height: 51 },
  "tray-stack": { x: 1255, y: 598, width: 76, height: 46 },
  "paper-bag-stack": { x: 1336, y: 612, width: 54, height: 29 },
  // --- outside, parked at the very left of the street
  "scooter-crate": { x: 10, y: 700, width: 230, height: 121 },
} as const satisfies Record<string, PropPlacement>;

export type WorldPropName = keyof typeof worldProps;

export const isWorldProp = (name: string): name is WorldPropName => name in worldProps;

// `as const satisfies` keeps the literal coordinates, which is what makes the overlap test
// readable — but it also narrows each entry to its own shape, so the optional `src` is only
// on the entries that declare one. Widening here is cheaper than loosening the whole table.
export const propSrc = (name: WorldPropName): string => (worldProps[name] as PropPlacement).src ?? frame(name);

/** Every prop name, in the order they should be drawn. */
export const worldPropNames = Object.keys(worldProps) as WorldPropName[];

/**
 * Which props draw behind the baker and the counter.
 *
 * The gauge is on the oven at the back of the shop and the clipboard hangs on the back
 * wall, so both are further in than Hassan is. Everything else is on the counter or on the
 * floor in front of it. Two layers is enough — the artwork has no depth between those.
 */
export const backProps: ReadonlySet<string> = new Set(["oven-gauge", "order-clipboard"]);

/** The extra images the tour loads on top of the scene's own preload. */
export const propAssetUrls = (names: readonly string[]) =>
  [...new Set(names.filter(isWorldProp).map(propSrc))];
