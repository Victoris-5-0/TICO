import type { CustomerId } from "./simulation";
export type Point = { x: number; y: number };
export type ActorAsset = { src: string; columns: number; rows: number; hands: Point[]; receiveHand: Point };
export type BakerySceneManifest = {
  version: 2; width: number; height: number;
  queue: { first: Point; spacing: number; actorSize: number };
  baker: Point; oven: Point; tray: Point;
  actors: Record<CustomerId | "hassan" | "salma", ActorAsset>;
};
export const asset = (name: string) => `/assets/bakery-v2/${name}.webp`;
// Hand sockets are in world units relative to the normalized foot pivot at size 310.
const customer = (name: string, receiveHand: Point = { x: -73, y: -151 }): ActorAsset => ({
  src: asset(name), columns: 3, rows: 2, receiveHand,
  hands: [{ x: 26, y: -107 }, { x: 51, y: -105 }, { x: 0, y: -119 }, { x: 47, y: -109 }, { x: -5, y: -116 }, receiveHand],
});
export const bakeryScene: BakerySceneManifest = {
  version: 2, width: 1600, height: 900,
  queue: { first: { x: 705, y: 752 }, spacing: 105, actorSize: 310 },
  baker: { x: 486, y: 719 }, oven: { x: 291, y: 546 }, tray: { x: 553, y: 590 },
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
export const fixtureNames = ["environment", "oven", "counter", "worktop", "awning", "olive", "aloe", "loaf", "dough", "tray", "peel", "bag", "oven-fire", "radio", "flour-sack"];
export function sceneAssetUrls() {
  return [...fixtureNames.map(asset), ...Object.values(bakeryScene.actors).map((actor) => actor.src)];
}
