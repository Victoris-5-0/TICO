"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { Locale } from "@/i18n/config";

import styles from "./chapters-map.module.css";

/**
 * "Select your world" — Figma node 23:52.
 *
 * Four chapter islands down one long sky, a dashed road weaving between them, each with
 * a plaque and one action: join it, or a lock. Presentation only — the caller owns which
 * chapter is open (`services/chapters-map.service.ts`).
 *
 * Everything is measured in the 1440-wide Figma artboard and scaled with `--px`, one
 * artboard pixel expressed as a container-query unit, so the composition holds from a
 * laptop up to a wide desktop. Under 760px the scene gives way to a stacked list: the
 * artboard scaled to a phone is not a layout, it is a thumbnail.
 */

export type ChapterStatus =
  /** Every world in it finished. */
  | "completed"
  /** Open, and the one to play. */
  | "current"
  /** Built, waiting on the chapter before it. */
  | "locked"
  /** Drawn on the map, nothing built on it yet. */
  | "soon";

export type MapChapter = {
  slug: string;
  title: string;
  kicker: string;
  island: { src: string; width: number; height: number };
  status: ChapterStatus;
  /** The chapter that has to be finished first, for a shut one's accessible label. */
  after: string | null;
  worldsDone: number;
  worldsTotal: number;
};

/** The artboard the whole map is measured in. */
const SCENE = { width: 1440, height: 3510 } as const;

type Row = {
  /** The visible island, trimmed of its transparent padding. */
  island: { x: number; y: number; w: number };
  /** The plaque beside it. */
  card: { x: number; y: number; w: number; h: number };
  /** Where the plaque's text starts, past the island overlapping its edge. */
  text: { x: number; y: number };
  /** The action's centre, as a fraction of the island's width and height. */
  action: { x: number; y: number };
};

/** Authored to the artwork: islands alternate sides and the plaque tucks under each. */
const ROWS: readonly Row[] = [
  { island: { x: 129, y: 459, w: 727 }, card: { x: 749, y: 651, w: 591, h: 201 }, text: { x: 156, y: 24 }, action: { x: 0.5, y: 0.64 } },
  { island: { x: 636, y: 1221, w: 692 }, card: { x: 100, y: 1439, w: 681, h: 201 }, text: { x: 50, y: 24 }, action: { x: 0.49, y: 0.65 } },
  { island: { x: 127, y: 1902, w: 679 }, card: { x: 668, y: 2143, w: 671, h: 171 }, text: { x: 229, y: 38 }, action: { x: 0.49, y: 0.67 } },
  { island: { x: 590, y: 2678, w: 731 }, card: { x: 103, y: 2859, w: 671, h: 201 }, text: { x: 61, y: 24 }, action: { x: 0.5, y: 0.57 } },
];

/** Past the four drawn rows, keep the zigzag going at the same rhythm. */
function rowFor(index: number): Row {
  if (index < ROWS.length) return ROWS[index];
  const step = ROWS[ROWS.length - 1].island.y - ROWS[ROWS.length - 2].island.y;
  const y = ROWS[ROWS.length - 1].island.y + step * (index - ROWS.length + 1);
  const start = index % 2 === 0;
  return {
    island: { x: start ? 129 : 620, y, w: 700 },
    card: start ? { x: 749, y: y + 200, w: 591, h: 201 } : { x: 100, y: y + 200, w: 681, h: 201 },
    text: start ? { x: 156, y: 24 } : { x: 50, y: 24 },
    action: { x: 0.5, y: 0.64 },
  };
}

const copy = {
  en: {
    map: "Select your world",
    lead: "Step by step into learning programming through real problems",
    join: "Join World",
    locked: "Locked",
    completed: "Completed",
    soon: "Coming soon",
    after: (chapter: string) => `Unlocks after ${chapter}`,
    worlds: (done: number, total: number) => `${done} of ${total} worlds`,
  },
  "ar-EG": {
    map: "اختار عالمك",
    lead: "خطوة بخطوة هتتعلم البرمجة من خلال مشاكل حقيقية",
    join: "ادخل العالم",
    locked: "مقفول",
    completed: "خلصت",
    soon: "قريبًا",
    after: (chapter: string) => `بيتفتح بعد ${chapter}`,
    worlds: (done: number, total: number) => `${arabic(done)} من ${arabic(total)} عوالم`,
  },
} as const;

/** Arabic-Indic digits for Arabic prose; code and tests stay Western. */
const arabic = (value: number) => String(value).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

const px = (value: number) => `calc(${value} * var(--px))`;

/**
 * The road: one smooth curve through every island, vertical at each so it reads as
 * leaving the island below and arriving from above, then on past the last one and off
 * the bottom of the map — the journey does not end at the last drawn chapter.
 */
function road(points: { x: number; y: number }[], height: number) {
  if (!points.length) return "";
  const stops = [...points, { x: points[points.length - 1].x > SCENE.width / 2 ? 700 : 760, y: height + 60 }];
  let d = `M ${stops[0].x} ${stops[0].y}`;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    const pull = (b.y - a.y) * 0.55;
    d += ` C ${a.x} ${a.y + pull}, ${b.x} ${b.y - pull}, ${b.x} ${b.y}`;
  }
  return d;
}

export function ChaptersMap({ locale, chapters }: { locale: Locale; chapters: readonly MapChapter[] }) {
  const reduced = useReducedMotion();
  const words = copy[locale];
  const mapId = useId();

  const rows = chapters.map((_, index) => rowFor(index));
  const height = Math.max(SCENE.height, (rows[rows.length - 1]?.island.y ?? 0) + 830);
  const centres = rows.map((row, index) => {
    const art = chapters[index].island;
    return { x: row.island.x + row.island.w / 2, y: row.island.y + (row.island.w * art.height) / art.width / 2 };
  });

  return (
    <div className={styles.canvas}>
      <section className={styles.scene} style={{ "--scene-height": height } as React.CSSProperties} aria-labelledby={`${mapId}-title`}>
        <div className={styles.intro}>
          <h1 id={`${mapId}-title`} className={styles.title}>{words.map}</h1>
          <p className={styles.lead}>{words.lead}</p>
        </div>

        <svg className={styles.road} viewBox={`0 0 ${SCENE.width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={road(centres, height)} />
        </svg>

        <ol className={styles.chapters}>
          {chapters.map((chapter, index) => {
            const row = rows[index];
            const open = chapter.status === "current" || chapter.status === "completed";
            const titleId = `${mapId}-chapter-${chapter.slug}`;
            const statusId = `${titleId}-status`;

            return (
              <li key={chapter.slug} className={styles.chapter} data-status={chapter.status} data-side={index % 2 === 0 ? "start" : "end"}>
                <div
                  className={styles.island}
                  style={{ "--x": px(row.island.x), "--y": px(row.island.y), "--w": px(row.island.w) } as React.CSSProperties}
                >
                  <Image
                    className={styles.art}
                    src={chapter.island.src}
                    alt=""
                    width={chapter.island.width}
                    height={chapter.island.height}
                    sizes="(max-width: 760px) 360px, (max-width: 1440px) 50vw, 730px"
                    priority={index === 0}
                  />

                  <div className={styles.action} style={{ "--ax": `${row.action.x * 100}%`, "--ay": `${row.action.y * 100}%` } as React.CSSProperties}>
                    {open ? (
                      <motion.div
                        transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.65 }}
                        whileHover={reduced ? undefined : { y: -2 }}
                        whileTap={reduced ? undefined : { scale: 0.98 }}
                      >
                        <Link
                          className={styles.join}
                          href={`/${locale}/learn/${chapter.slug}`}
                          aria-describedby={`${titleId} ${statusId}`}
                          aria-current={chapter.status === "current" ? "step" : undefined}
                        >
                          {words.join}
                        </Link>
                      </motion.div>
                    ) : (
                      <span className={styles.locked} aria-hidden="true">
                        <Image className={styles.lock} src="/assets/chapters-map/lock.svg" alt="" width={94} height={94} />
                        {words.locked}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={styles.card}
                  style={{ "--x": px(row.card.x), "--y": px(row.card.y), "--w": px(row.card.w), "--h": px(row.card.h), "--tx": px(row.text.x), "--ty": px(row.text.y) } as React.CSSProperties}
                >
                  <h2 id={titleId} className={styles.chapterTitle}>{chapter.title}</h2>
                  <p className={styles.kicker}>{chapter.kicker}</p>
                  {/* The plaque carries the status in words: the lock and the orange are for
                      the eye, this is for everyone. */}
                  <p id={statusId} className={styles.status} data-status={chapter.status}>
                    {chapter.status === "completed" && words.completed}
                    {chapter.status === "current" && words.worlds(chapter.worldsDone, chapter.worldsTotal)}
                    {chapter.status === "locked" && `${words.locked} — ${words.after(chapter.after ?? "")}`}
                    {chapter.status === "soon" && `${words.locked} — ${words.soon}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
