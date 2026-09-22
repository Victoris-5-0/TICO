import Image from "next/image";

import { trafficPedestrianWalkCycles } from "@/lib/traffic/pedestrian-walk-cycles";
import { arrivalOffset, trafficQueue, TRAFFIC_ROAD_SLOPE } from "@/lib/traffic/vehicle-motion";

import styles from "./traffic-scene.module.css";

type TrafficProps = Record<string, number | string>;
type Layer = { id: string; src: string; className: string; width: number; height: number };

const pavementPedestrians: readonly Layer[] = [
  { id: "ali-north", src: "/assets/traffic-v2/characters/ali.png", className: "aliNorth", width: 512, height: 1536 },
  { id: "nadia-north", src: "/assets/traffic-v2/characters/nadia.png", className: "nadiaNorth", width: 512, height: 1536 },
  { id: "naser-north", src: "/assets/traffic-v2/characters/naser.png", className: "naserNorth", width: 512, height: 1536 },
  { id: "naser-west", src: "/assets/traffic-v2/characters/naser.png", className: "naserWest", width: 512, height: 1536 },
  { id: "nadia-west", src: "/assets/traffic-v2/characters/nadia.png", className: "nadiaWest", width: 512, height: 1536 },
] as const;

const crossingPedestrians = [
  { id: "young-man", src: "/assets/traffic-v2/characters/road-facing/young-man.webp", sheet: trafficPedestrianWalkCycles["young-man"], width: 131, height: 408, size: 2.25, start: [63.5, 38], end: [39, 73] },
  { id: "elderly-woman", src: "/assets/traffic-v2/characters/road-facing/elderly-woman.webp", sheet: trafficPedestrianWalkCycles["elderly-woman"], width: 120, height: 401, size: 2.35, start: [67.2, 42], end: [41.5, 77] },
  { id: "hijabi-woman", src: "/assets/traffic-v2/characters/road-facing/hijabi-woman.webp", sheet: trafficPedestrianWalkCycles["hijabi-woman"], width: 111, height: 395, size: 2.15, start: [71, 46], end: [44, 80] },
  { id: "cap-man", src: "/assets/traffic-v2/characters/road-facing/cap-man.webp", sheet: trafficPedestrianWalkCycles["cap-man"], width: 143, height: 428, size: 2.3, start: [74.6, 50], end: [46.5, 82] },
] as const;

const signalFrame = (state: string) =>
  `/assets/traffic-v2/frames/signal-${state === "green" ? "green" : state === "amber" ? "amber" : state === "red" ? "red" : "off"}.webp`;

export function trafficSceneDuration(animate?: string | null): number {
  if (animate === "car_arrive") return 1_650;
  if (animate === "cars_move") return 2_400;
  if (animate === "cars_arrive") return 5_000;
  if (animate === "signal_countdown") return 5_000;
  if (animate === "pedestrians_cross") return 6_500;
  if (animate === "pedestrians_arrive") return 0;
  if (animate === "signal_switch") return 700;
  if (animate === "officer_point") return 750;
  if (animate === "celebrate") return 900;
  return 0;
}

export function TrafficScene({
  props,
  animate,
  progress,
  highlight = [],
  pickable,
  onPick,
  pickLabel,
}: {
  props: TrafficProps;
  animate?: string | null;
  progress: number;
  highlight?: readonly string[];
  pickable?: string;
  onPick?: (name: string) => void;
  pickLabel?: (name: string) => string;
}) {
  const waiting = Math.max(0, Number(props.waiting_cars ?? 3));
  const crossing = animate === "pedestrians_cross";
  const pedestriansCrossed = Math.max(0, Math.min(4, Number(props.pedestrians_crossed ?? 0)));
  const pedestrianCount = Math.max(0, Math.min(4, Number(props.waiting_pedestrians ?? 0) + pedestriansCrossed));
  const activePedestrians = crossingPedestrians.slice(0, pedestrianCount);
  const pedestrianProgress = activePedestrians.map((_, index) => {
    const delay = index * 0.1;
    return Math.max(0, Math.min(1, (progress - delay) / 0.7));
  });
  const waitingPedestrians = crossing
    ? pedestrianProgress.filter((value) => value < 1).length
    : Math.max(0, Number(props.waiting_pedestrians ?? (pedestriansCrossed ? 0 : 4)));
  const timerSeconds = Math.max(0, Number(props.timer_seconds ?? 0));
  const timerRemaining = animate === "signal_countdown"
    ? Math.max(0, Math.ceil(timerSeconds * (1 - progress)))
    : timerSeconds;
  const visible = Math.max(0, Math.min(trafficQueue.length, Number(props.cars_visible ?? waiting)));
  const passed = Math.max(0, Math.min(visible, Number(props.cars_passed ?? 0)));
  const moveFrom = Math.max(0, Math.min(passed, Number(props.car_move_from ?? 0)));
  const signal = String(props.signal ?? "off");
  const officerSrc = animate === "officer_point" || animate === "cars_move"
    ? "/assets/traffic-v2/frames/officer-go.webp"
    : animate === "signal_switch" || animate === "cars_arrive"
      ? "/assets/traffic-v2/frames/officer-stop.webp"
    : animate === "celebrate"
      ? "/assets/traffic-v2/frames/officer-celebrate.webp"
      : "/assets/traffic-v2/frames/officer-idle.webp";
  const arriving = animate === "car_arrive" || animate === "cars_arrive";
  const leaving = animate === "cars_move";
  // A code run can release more than one car. Let each released vehicle drive out
  // in turn; otherwise all but the final one disappear without moving.
  const shownCars = trafficQueue.slice(leaving ? moveFrom : passed, visible).filter((_, index) =>
    !leaving || index >= passed - moveFrom || progress * (passed - moveFrom) - index < 1,
  );

  return (
    <div className={styles.stage}>
      <div className={styles.plate}>
        <Image className={styles.backdrop} src="/assets/traffic-v2/background/full.png" alt="" fill sizes="100vw" priority />
        <div className={styles.walkPreload} aria-hidden="true">
          {crossingPedestrians.map((person) => (
            <span key={person.id} style={{ backgroundImage: `url(${person.sheet})` }} />
          ))}
        </div>

        {pavementPedestrians.map((layer) => (
          <Image key={layer.id} className={`${styles.layer} ${styles[layer.className]}`} src={layer.src} alt="" width={layer.width} height={layer.height} />
        ))}

        {activePedestrians.map((person, index) => {
          const local = crossing ? pedestrianProgress[index] : pedestriansCrossed >= 4 ? 1 : 0;
          const left = person.start[0] + (person.end[0] - person.start[0]) * local;
          const top = person.start[1] + (person.end[1] - person.start[1]) * local;
          const standingAspect = person.width / person.height;
          const walkingAspect = 412 / 643;
          const walkingSize = person.size * (walkingAspect / standingAspect);
          const frame = Math.floor(local * 12) % 6;
          const column = frame % 3;
          const row = Math.floor(frame / 3);
          return crossing ? (
            <div
              key={person.id}
              className={styles.walker}
              style={{
                left: `${left - (walkingSize - person.size) / 2}%`,
                top: `${top}%`,
                width: `${walkingSize}%`,
                aspectRatio: walkingAspect,
              }}
            >
              <span
                className={styles.walkerSprite}
                style={{
                  backgroundImage: `url(${person.sheet})`,
                  backgroundPosition: `${column * 50}% ${row * 100}%`,
                }}
              />
            </div>
          ) : (
            <Image
              key={person.id}
              className={styles.layer}
              style={{ left: `${left}%`, top: `${top}%`, width: `${person.size}%` }}
              src={person.src}
              alt=""
              width={person.width}
              height={person.height}
            />
          );
        })}

        {shownCars.map((car) => {
          const originalIndex = trafficQueue.indexOf(car);
          const isArriving = arriving && originalIndex === visible - 1;
          const queueArrival = animate === "cars_arrive";
          const arrivingNow = isArriving || queueArrival;
          const arrivalProgress = queueArrival
            ? Math.max(0, Math.min(1, progress * visible - originalIndex))
            : progress;
          const arrivalEase = 1 - Math.pow(1 - arrivalProgress, 3);
          const isLeaving = leaving && originalIndex >= moveFrom && originalIndex < passed;
          const carProgress = isLeaving
            ? Math.max(0, Math.min(1, progress * (passed - moveFrom) - (originalIndex - moveFrom)))
            : 0;
          // Start beyond the right edge, then follow the road's diagonal into the
          // junction. A fixed 145% of the sprite width started most cars on screen.
          const { x: arrivalX, y: arrivalY } = arrivalOffset(car);
          const departureX = ((car.left + car.width + 4) / car.width) * 100;
          const departureY = departureX * car.aspectRatio * TRAFFIC_ROAD_SLOPE;
          const travel = arrivingNow
            ? `translate(${(1 - arrivalEase) * arrivalX}%, ${(1 - arrivalEase) * arrivalY}%)`
            : isLeaving
              ? `translate(${-carProgress * departureX}%, ${-carProgress * departureY}%)`
              : "translate(0, 0)";
          return (
            <div
              key={car.id}
              className={`${styles.vehicle} ${styles[car.id]}`}
              style={{ left: `${car.left}%`, top: `${car.top}%`, width: `${car.width}%`, aspectRatio: car.aspectRatio, transform: travel }}
            >
              <Image className={styles.vehicleSprite} src={car.src} alt="" fill sizes="18vw" />
            </div>
          );
        })}

        <div className={`${styles.signal} ${styles.signalWest}`}>
          <Image className={styles.signalSprite} src={signalFrame(signal)} alt="" fill sizes="3vw" />
        </div>
        <div className={`${styles.signal} ${styles.signalEast}`}>
          <Image className={styles.signalSprite} src={signalFrame(signal)} alt="" fill sizes="3vw" />
        </div>
        <div className={styles.officer}>
          <Image className={styles.officerSprite} src={officerSrc} alt="" fill sizes="5vw" />
        </div>

        {highlight.includes("signal") && <span className={`${styles.highlight} ${styles.signalTarget}`} aria-hidden="true" />}
        {highlight.includes("officer") && <span className={`${styles.highlight} ${styles.officerTarget}`} aria-hidden="true" />}

        {pickable === "signal" && (
          <button type="button" className={`${styles.pick} ${styles.signalTarget}`} data-traffic-pick="signal" onClick={() => onPick?.("signal")} aria-label={pickLabel?.("signal")} />
        )}
        {pickable === "officer" && (
          <button type="button" className={`${styles.pick} ${styles.officerTarget}`} data-traffic-pick="officer" onClick={() => onPick?.("officer")} aria-label={pickLabel?.("officer")} />
        )}
      </div>

      <div className={styles.hud} aria-live="polite">
        <div className={styles.counter}>
          <span>العربيات المستنية</span><strong>{waiting}</strong>
          <span>المشاة المستنيين</span><strong>{waitingPedestrians}</strong>
        </div>
        {(animate === "signal_countdown" || timerRemaining > 0) && (
          <div className={styles.timer} role="timer">
            <span>
              {props.timer_for === "pedestrians"
                ? "المشاة مستنيين"
                : props.timer_for === "cars"
                  ? "العربيات مستنية"
                  : "تغيير الإشارة"}
            </span>
            <strong>{timerRemaining}</strong>
            <small>ثواني</small>
          </div>
        )}
      </div>
    </div>
  );
}
