import { trafficVehicleSprites } from "./vehicle-sprites";

export const trafficQueue = [
  { id: "taxi", src: trafficVehicleSprites.taxi.nw, lane: 0, left: 59, top: 61, width: 10, aspectRatio: 200 / 146 },
  { id: "minibus", src: trafficVehicleSprites.minibus.nw, lane: 1, left: 60, top: 74, width: 10.5, aspectRatio: 198 / 182 },
  { id: "tuktuk", src: trafficVehicleSprites.tuktuk.nw, lane: 0, left: 70.5, top: 69, width: 8, aspectRatio: 163 / 184 },
  { id: "taxi-2", src: trafficVehicleSprites.taxi.nw, lane: 1, left: 72, top: 82, width: 9.5, aspectRatio: 200 / 146 },
  { id: "minibus-2", src: trafficVehicleSprites.minibus.nw, lane: 0, left: 83, top: 78, width: 9.5, aspectRatio: 198 / 182 },
] as const;

/** Painted lane markings rise roughly 31px for every 100px towards the lower-right. */
export const TRAFFIC_ROAD_SLOPE = 0.31;

/** CSS translate percentages are relative to the car, not the scene. */
export function arrivalOffset(car: Pick<(typeof trafficQueue)[number], "left" | "width" | "aspectRatio">) {
  const x = ((100 - car.left + car.width + 2) / car.width) * 100;
  return { x, y: x * car.aspectRatio * TRAFFIC_ROAD_SLOPE };
}
