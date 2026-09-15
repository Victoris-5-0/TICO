"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { Locale } from "@/i18n/config";

import styles from "./chapter-worlds-map.module.css";

/**
 * A chapter's worlds — Figma node 23:119, the map inside "Select your world".
 *
 * Floating Egyptian islands down a sky, one per world, joined by a dashed road. TICO
 * stands on the one to play and its Play button leads into that world's mission map;
 * the ones after it carry a lock. Presentation only — the caller owns which world is
 * open (`services/chapters-map.service.ts`).
 *
 * Measured in the 1440-wide artboard like `ChaptersMap`, with the same `--px` scaling
 * and the same stacked layout under 760px.
 */

export type WorldStatus = "completed" | "current" | "locked";

export type MapWorld = {
  /** 1-based position on the road. */
  slot: number;
  slug: string;
  title: string;
  status: WorldStatus;
  /** The world that has to be finished first, named on a shut one's label. */
  after: string | null;
  missionsDone: number;
  missionsTotal: number;
};

/** The artboard, drawn with three islands. More worlds carry the zigzag on below. */
const SCENE = { width: 1440, height: 2456 } as const;

/** Island art by world, in `public/assets/worlds-map/`, trimmed to the visible island. */
const ISLANDS: Record<string, { src: string; width: number; height: number }> = {
  "el-forn": { src: "/assets/worlds-map/island-el-forn.webp", width: 904, height: 800 },
  "el-mahatta": { src: "/assets/worlds-map/island-el-mahatta.webp", width: 928, height: 816 },
  "isharet-cairo": { src: "/assets/worlds-map/island-isharet-cairo.webp", width: 923, height: 854 },
};
/** A world without its own island borrows one, so it is still somewhere on the map. */
const SPARE = Object.values(ISLANDS);

type Slot = { x: number; y: number; w: number };

/** The three drawn islands, trimmed rects in the artboard. */
const SLOTS: readonly Slot[] = [
  { x: 122, y: 296, w: 709 },
  { x: 676, y: 991, w: 687 },
  { x: 147, y: 1627, w: 664 },
];

function slotFor(index: number): Slot {
  if (index < SLOTS.length) return SLOTS[index];
  const step = SLOTS[2].y - SLOTS[1].y;
  return { x: index % 2 === 0 ? 147 : 676, y: SLOTS[2].y + step * (index - 2), w: 680 };
}

const copy = {
  en: {
    play: "Play",
    replay: "Play again",
    locked: "Locked",
    completed: "Completed",
    current: "Up next",
    after: (world: string) => `Unlocks after ${world}`,
    missions: (done: number, total: number) => `${done} of ${total} missions`,
    empty: "No worlds here yet.",
  },
  "ar-EG": {
    play: "العب",
    replay: "العب تاني",
    locked: "مقفول",
    completed: "خلصت",
    current: "الجاي",
    after: (world: string) => `بيتفتح بعد ${world}`,
    missions: (done: number, total: number) => `${arabic(done)} من ${arabic(total)} مهمة`,
    empty: "مفيش عوالم هنا لسه.",
  },
} as const;

const arabic = (value: number) => String(value).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

const px = (value: number) => `calc(${value} * var(--px))`;

function road(points: { x: number; y: number }[], height: number) {
  if (!points.length) return "";
  const stops = [...points, { x: points[points.length - 1].x > SCENE.width / 2 ? 640 : 800, y: height + 60 }];
  let d = `M ${stops[0].x} ${stops[0].y}`;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const pull = (b.y - a.y) * 0.55;
    d += ` C ${a.x} ${a.y + pull}, ${b.x} ${b.y - pull}, ${b.x} ${b.y}`;
  }
  return d;
}

export function ChapterWorldsMap({
  locale,
  title,
  worlds,
  framed = false,
}: {
  locale: Locale;
  /** The chapter's name, for the map's accessible label. */
  title: string;
  worlds: readonly MapWorld[];
  /**
   * Embedded on another page rather than being one: the sky comes inside a rounded
   * frame, and the band the page's own header would sit in is trimmed off the top.
   */
  framed?: boolean;
}) {
  const reduced = useReducedMotion();
  const words = copy[locale];
  const mapId = useId();

  if (!worlds.length) return <p className={styles.empty}>{words.empty}</p>;

  const trim = framed ? 200 : 0;
  const slots = worlds.map((_, index) => slotFor(index)).map((slot) => ({ ...slot, y: slot.y - trim }));
  const arts = worlds.map((world, index) => ISLANDS[world.slug] ?? SPARE[index % SPARE.length]);
  const height = Math.max(SCENE.height - trim, slots[slots.length - 1].y + 830);
  const centres = slots.map((slot, index) => ({ x: slot.x + slot.w / 2, y: slot.y + (slot.w * arts[index].height) / arts[index].width / 2 }));

  return (
    <div className={styles.canvas}>
      <section className={styles.scene} style={{ "--scene-height": height } as React.CSSProperties} aria-label={title} data-framed={framed || undefined}>
        {framed && <div className={styles.frameSky} aria-hidden="true" />}
        <svg className={styles.road} viewBox={`0 0 ${SCENE.width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={road(centres, height)} />
        </svg>

        <ol className={styles.worlds}>
          {worlds.map((world, index) => {
            const slot = slots[index];
            const art = arts[index];
            const open = world.status !== "locked";
            const titleId = `${mapId}-world-${world.slug}`;

            return (
              <li
                key={world.slug}
                className={styles.world}
                data-status={world.status}
                style={{ "--x": px(slot.x), "--y": px(slot.y), "--w": px(slot.w) } as React.CSSProperties}
              >
                <Image
                  className={styles.art}
                  src={art.src}
                  alt=""
                  width={art.width}
                  height={art.height}
                  sizes="(max-width: 760px) 360px, (max-width: 1440px) 50vw, 710px"
                  /* Embedded, the map is below a hero that already has the preload budget. */
                  priority={index === 0 && !framed}
                />

                {/* TICO stands on the world to play, answering "where am I?" before anything is read. */}
                {world.status === "current" && (
                  <motion.div
                    className={styles.tico}
                    initial={reduced ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
                  >
                    <Image src="/assets/worlds-map/tico.png" alt="" width={650} height={701} sizes="(max-width: 760px) 70px, 10vw" />
                  </motion.div>
                )}

                {open ? (
                  <motion.div
                    className={styles.action}
                    transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.65 }}
                    whileHover={reduced ? undefined : { y: -2 }}
                    whileTap={reduced ? undefined : { scale: 0.98 }}
                  >
                    <Link
                      className={styles.play}
                      href={`/${locale}/worlds/${world.slug}`}
                      aria-describedby={titleId}
                      aria-current={world.status === "current" ? "step" : undefined}
                    >
                      {world.status === "completed" ? words.replay : words.play}
                    </Link>
                  </motion.div>
                ) : (
                  <Image className={styles.lock} src="/assets/worlds-map/lock.svg" alt="" width={113} height={139} />
                )}

                {/* The island is the world's name to the eye; this is its name and state to
                    everyone else, and the plaque the stacked layout shows. */}
                <p id={titleId} className={styles.plaque} data-status={world.status}>
                  <b>{world.title}</b>
                  <span>
                    {world.status === "completed" && `${words.completed} · ${words.missions(world.missionsDone, world.missionsTotal)}`}
                    {world.status === "current" && `${words.current} · ${words.missions(world.missionsDone, world.missionsTotal)}`}
                    {world.status === "locked" && `${words.locked} · ${words.after(world.after ?? "")}`}
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
