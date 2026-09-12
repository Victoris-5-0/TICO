"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import type { Locale } from "@/i18n/config";

import styles from "./worlds-map.module.css";

/**
 * The world map: an illustrated sky-and-sea Egyptian adventure canvas with floating world islands.
 *
 * Presentation only — the caller owns which world is open and how far through it the
 * student is (see `services/worlds-map.service.ts`). Everything is measured in the 1104 x
 * 1425 coordinate system of the background art and expressed as percentages, ensuring
 * crisp, responsive scaling on all display widths.
 */

export type WorldStatus =
  /** Every mission done. */
  | "completed"
  /** Open, and the one to play next. */
  | "current"
  /** A real world, waiting on the one before it. */
  | "locked"
  /** A clearing with no world built on it yet. */
  | "soon";

export type MapWorld = {
  /** 1-3: which floating island clearing this world stands on. */
  slot: number;
  /** `null` for a clearing with nothing built on it. */
  slug: string | null;
  title: string;
  status: WorldStatus;
  /** The world that has to be finished first, named on a shut world's plaque. */
  after: string | null;
  missionsDone: number;
  missionsTotal: number;
};

/** The scene the whole map is measured in: native background dimensions. */
const SCENE = { width: 1104, height: 1425 } as const;
/** The lock glyph size on shut clearings. */
const LOCK = { width: 64, height: 80 } as const;
/** Stepping stone and TICO dimensions. */
const STEP = { width: 68, height: 53 } as const;
const TICO = { width: 125, height: 135 } as const;

type Clearing = {
  /** The exported island asset in `public/assets/worlds-map/`. */
  art: string;
  /** Painted size and top-left corner in scene units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where a lock sits when the world is shut. */
  lock: { x: number; y: number };
  /** Where TICO stands when this is the world to play next. */
  tico: { x: number; y: number };
  /** Staggered animation delay for floating motion. */
  floatDelay: number;
  /** The stepping stones on the road in from the clearing before. */
  steps: ReadonlyArray<readonly [number, number]>;
};

/**
 * The 3 core chapter clearings positioned along the aerial sea journey.
 */
const CLEARINGS: readonly Clearing[] = [
  {
    art: "world1",
    x: 50,
    y: 70,
    width: 510,
    height: 395,
    lock: { x: 250, y: 220 },
    tico: { x: 440, y: 210 },
    floatDelay: 0,
    steps: [],
  },
  {
    art: "world2",
    x: 530,
    y: 470,
    width: 520,
    height: 397,
    lock: { x: 740, y: 630 },
    tico: { x: 410, y: 580 },
    floatDelay: 1.2,
    steps: [
      [470, 380],
      [530, 435],
      [580, 485],
    ],
  },
  {
    art: "world3",
    x: 130,
    y: 870,
    width: 520,
    height: 351,
    lock: { x: 340, y: 1000 },
    tico: { x: 540, y: 920 },
    floatDelay: 2.4,
    steps: [
      [640, 825],
      [550, 880],
      [465, 930],
    ],
  },
];

/** Stepping stones leading from World 3 towards future horizons. */
const TRAIL_STEPS: ReadonlyArray<readonly [number, number]> = [
  [530, 1180],
  [630, 1230],
  [730, 1270],
];

/** Intrinsic pixel dimensions of each export for next/image aspect ratios. */
const ART: Record<string, { width: number; height: number }> = {
  world1: { width: 694, height: 538 },
  world2: { width: 701, height: 535 },
  world3: { width: 654, height: 442 },
  "world-1": { width: 694, height: 538 },
  "world-2": { width: 701, height: 535 },
  "world-3": { width: 654, height: 442 },
};

/** Arabic-Indic digits for Arabic locale rendering. */
const arabic = (value: number) => String(value).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

const copy = {
  en: {
    map: "World map",
    completed: "Completed",
    current: "Play now",
    soon: "Coming soon",
    after: (world: string) => `Unlocks after ${world}`,
    missions: (done: number, total: number) => `${done} of ${total} missions`,
    here: "You are here",
    badgeNumber: (slot: number) => `0${slot}`,
  },
  "ar-EG": {
    map: "خريطة العوالم",
    completed: "خلصت",
    current: "العب دلوقتي",
    soon: "قريبًا",
    after: (world: string) => `بيتفتح بعد ${world}`,
    missions: (done: number, total: number) => `${arabic(done)} من ${arabic(total)} مهمة`,
    here: "إنت هنا",
    badgeNumber: (slot: number) => arabic(slot),
  },
} as const;

const percent = (value: number, of: number) => `${(value / of) * 100}%`;

export function WorldsMap({ locale, worlds }: { locale: Locale; worlds: readonly MapWorld[] }) {
  const reduced = useReducedMotion();
  const words = copy[locale];
  /** TICO stands on the world to play, answering "what do I do next?" immediately. */
  const here = worlds.find((world) => world.status === "current");
  const standing = here ? CLEARINGS[here.slot - 1] : null;

  return (
    <div className={styles.scene} aria-label={words.map}>
      {/* Background aerial illustration */}
      <Image
        className={styles.mapBackground}
        src="/assets/worlds-map/new_bg.png"
        alt=""
        fill
        priority
        sizes="(max-width: 1200px) 100vw, 1200px"
      />

      {/* Stepping stone paths between clearings */}
      {worlds.map((world) => {
        const clearing = CLEARINGS[world.slot - 1];
        const reachable = world.status === "completed" || world.status === "current";
        return clearing?.steps.map(([x, y], index) => (
          <Image
            key={`step-${world.slot}-${index}`}
            className={styles.step}
            style={{
              left: percent(x, SCENE.width),
              top: percent(y, SCENE.height),
              width: percent(STEP.width, SCENE.width),
            }}
            src={`/assets/worlds-map/step-${reachable ? "open" : "locked"}.png`}
            alt=""
            width={STEP.width * 2}
            height={STEP.height * 2}
            sizes="8vw"
          />
        ));
      })}

      {/* Trailing stones towards future adventures */}
      {TRAIL_STEPS.map(([x, y], index) => {
        const allDone = worlds.every((w) => w.status === "completed");
        return (
          <Image
            key={`trail-${index}`}
            className={styles.step}
            style={{
              left: percent(x, SCENE.width),
              top: percent(y, SCENE.height),
              width: percent(STEP.width, SCENE.width),
            }}
            src={`/assets/worlds-map/step-${allDone ? "open" : "locked"}.png`}
            alt=""
            width={STEP.width * 2}
            height={STEP.height * 2}
            sizes="8vw"
          />
        );
      })}

      {/* Floating World Islands */}
      <ol className={styles.clearings}>
        {worlds.map((world, index) => {
          const clearing = CLEARINGS[world.slot - 1];
          if (!clearing) return null;
          const art = ART[clearing.art] ?? ART.world1;
          const open = world.status === "completed" || world.status === "current";
          const position = {
            left: percent(clearing.x, SCENE.width),
            top: percent(clearing.y, SCENE.height),
            width: percent(clearing.width, SCENE.width),
          };

          const island = (
            <>
              <div className={styles.artFrame} data-status={world.status}>
                {world.status === "current" && <span className={styles.activePulse} aria-hidden="true" />}
                <Image
                  className={styles.art}
                  src={`/assets/worlds-map/${clearing.art}.png`}
                  alt=""
                  width={art.width}
                  height={art.height}
                  sizes="(max-width: 1104px) 50vw, 550px"
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                />
                {!open && (
                  <Image
                    className={styles.lock}
                    style={{
                      left: percent(clearing.lock.x - clearing.x, clearing.width),
                      top: percent(clearing.lock.y - clearing.y, clearing.height),
                      width: percent(LOCK.width, clearing.width),
                    }}
                    src="/assets/worlds-map/lock.svg"
                    alt=""
                    width={LOCK.width}
                    height={LOCK.height}
                  />
                )}
              </div>

              {/* Informative, accessible world plaque */}
              <span className={styles.plaque} data-status={world.status} aria-hidden="true">
                <span className={styles.plaqueHeader}>
                  <span className={styles.plaqueNumber}>{words.badgeNumber(world.slot)}</span>
                  <b className={styles.plaqueTitle}>{world.title}</b>
                </span>
                <span className={styles.plaqueMeta}>
                  {world.status === "current" && (
                    <span className={styles.statusBadgeCurrent}>
                      <span className={styles.dot} />
                      {words.current}
                    </span>
                  )}
                  {world.status === "completed" && (
                    <span className={styles.statusBadgeCompleted}>
                      <svg
                        className={styles.checkIcon}
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                      </svg>
                      {words.completed}
                    </span>
                  )}
                  {world.status === "locked" && (
                    <span className={styles.statusBadgeLocked}>
                      <svg className={styles.lockMiniIcon} viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 6V4a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h1zm2 0h4V4a2 2 0 1 0-4 0v2z" />
                      </svg>
                      {words.after(world.after ?? "")}
                    </span>
                  )}
                  {world.status === "soon" && (
                    <span className={styles.statusBadgeSoon}>{words.soon}</span>
                  )}
                  {world.missionsTotal > 0 && world.status !== "locked" && (
                    <i className={styles.missionCount}>
                      {words.missions(world.missionsDone, world.missionsTotal)}
                    </i>
                  )}
                </span>
              </span>
            </>
          );

          return (
            <li key={world.slot} className={styles.clearing} style={position} data-status={world.status}>
              <motion.div
                className={styles.floatWrapper}
                animate={reduced ? undefined : { y: [0, -6, 0] }}
                transition={
                  reduced
                    ? undefined
                    : {
                        duration: 4.8,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: clearing.floatDelay,
                      }
                }
              >
                <motion.div
                  className={styles.lift}
                  transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
                  whileHover={reduced || !open ? undefined : { y: -8, scale: 1.02 }}
                  whileTap={reduced || !open ? undefined : { scale: 0.98 }}
                >
                  {open && world.slug ? (
                    <Link
                      className={styles.island}
                      href={`/${locale}/worlds/${world.slug}`}
                      aria-current={world.status === "current" ? "step" : undefined}
                    >
                      <span className="sr-only">
                        {world.title} — {world.status === "completed" ? words.completed : words.current}.{" "}
                        {words.missions(world.missionsDone, world.missionsTotal)}
                      </span>
                      {island}
                    </Link>
                  ) : (
                    <div className={styles.island} aria-disabled="true">
                      <span className="sr-only">
                        {world.title} — {world.status === "soon" ? words.soon : words.after(world.after ?? "")}
                      </span>
                      {island}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </li>
          );
        })}
      </ol>

      {/* TICO mascot standing next to active world */}
      {standing && (
        <motion.div
          className={styles.tico}
          style={{
            left: percent(standing.tico.x, SCENE.width),
            top: percent(standing.tico.y, SCENE.height),
            width: percent(TICO.width, SCENE.width),
          }}
          data-face={standing.x + standing.width / 2 < standing.tico.x + TICO.width / 2 ? "left" : "right"}
          animate={reduced ? { opacity: 1 } : { y: [0, -8, 0] }}
          transition={reduced ? { duration: 0.24 } : { duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image
            src="/assets/worlds-map/tico.png"
            alt=""
            width={650}
            height={701}
            sizes="(max-width: 700px) 18vw, 130px"
          />
          <p className={styles.speech}>{words.here}</p>
        </motion.div>
      )}
    </div>
  );
}
