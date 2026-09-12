"use client";

import Image from "next/image";
import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Locale } from "@/i18n/config";
import styles from "./challenge-map.module.css";

export type ChallengeNode = {
  id: string;
  label: string;
  /** Coordinates in the 1440 × 1929 Figma scene, measured at the top-left of the node. */
  x: number;
  y: number;
  status: "available" | "current" | "completed" | "locked";
};
export type ChallengeStage = {
  id: string;
  title: string;
  stageLabel: string;
  theme: "bakery" | "traffic";
  nodes: readonly ChallengeNode[];
  companion?: { x: number; y: number; message?: string; /** Which way TICO is walking. The art faces right. */ face?: "left" | "right" };
};

const statusLabels = {
  en: { available: "Available", current: "Current mission", completed: "Completed", locked: "Locked" },
  "ar-EG": { available: "متاحة", current: "المهمة الحالية", completed: "مكتملة", locked: "مقفولة" },
};

/**
 * The road between two stops, as dots.
 *
 * A map of discs on painted ground does not say which order they come in; a line of
 * footsteps does. Spaced in scene units so the gaps stay even whatever the map is scaled
 * to, and stopping clear of both discs so the dots read as a path between them rather
 * than as decoration stuck to the edge.
 */
const NODE_RADIUS = 78;
const DOT_GAP = 46;

function roadDots(from: ChallengeNode, to: ChallengeNode) {
  const ax = from.x + 92, ay = from.y + 72;
  const bx = to.x + 92, by = to.y + 72;
  const span = Math.hypot(bx - ax, by - ay);
  const usable = span - NODE_RADIUS * 2;
  if (usable <= 0) return [];
  const count = Math.max(1, Math.round(usable / DOT_GAP));
  return Array.from({ length: count }, (_, i) => {
    const at = (NODE_RADIUS + (usable * (i + 0.5)) / count) / span;
    return { x: ax + (bx - ax) * at, y: ay + (by - ay) * at };
  });
}

/** Presentation only: the caller owns mission availability, progress, and navigation. */
export function ChallengeMap({ locale, stages, onSelect, emptyMessage, bannerTitle, unlockedId }: { locale: Locale; stages: readonly ChallengeStage[]; onSelect: (node: ChallengeNode, stage: ChallengeStage) => void; emptyMessage?: string; /** What the painted banner says, when the world's own name would only repeat the page. */ bannerTitle?: string; /** The node that opened a moment ago, marked out until it is played. */ unlockedId?: string | null }) {
  const reduced = useReducedMotion();
  const mapId = useId();
  if (!stages.length) return <p className={styles.empty}>{emptyMessage ?? (locale === "ar-EG" ? "مفيش مهام متاحة حاليًا." : "No missions available yet.")}</p>;
  return <div className={styles.map}>
    {stages.map((stage, stageIndex) => <section key={stage.id} className={styles.stage} aria-labelledby={`${mapId}-stage-${stage.id}`}>
      <header className={`${styles.banner} ${stage.theme === "traffic" ? styles.trafficBanner : ""}`}>
        <Image src={`/assets/challenge-map/${stage.theme}-banner.png`} alt="" fill sizes="(max-width: 1440px) 100vw, 1440px" />
        <div><p>{stage.stageLabel}</p><h2 id={`${mapId}-stage-${stage.id}`}>{bannerTitle ?? stage.title}</h2></div>
      </header>
      <div className={styles.scene}>
        <Image className={styles.sceneArt} src={`/assets/challenge-map/${stage.theme}.png`} alt="" fill sizes="(max-width: 1440px) 100vw, 1440px" preload={stageIndex === 0} />
        <svg className={styles.road} viewBox="0 0 1440 1929" preserveAspectRatio="none" aria-hidden="true">
          {stage.nodes.slice(1).map((node, index) => {
            const previous = stage.nodes[index];
            // The road is walked as far as the student has got: lit to the stop they are
            // on, faint beyond it.
            const walked = previous.status === "completed";
            return <g key={node.id} data-walked={walked || undefined} data-opens={node.id === unlockedId || undefined}>
              {roadDots(previous, node).map((dot, i) => <circle key={i} cx={dot.x} cy={dot.y} r={12} />)}
            </g>;
          })}
        </svg>
        <ol className={styles.nodes}>
          {stage.nodes.map((node, index) => <li key={node.id} className={styles.nodePosition} style={{ left: `${node.x / 14.4}%`, top: `${node.y / 19.29}%` }}>
            <motion.button type="button" className={styles.node} data-node={node.id} data-status={node.status} data-unlocked={node.id === unlockedId || undefined} aria-label={`${index + 1}. ${node.label} — ${statusLabels[locale][node.status]}`} aria-disabled={node.status === "locked"} aria-current={node.status === "current" ? "step" : undefined} onClick={() => { if (node.status !== "locked") onSelect(node, stage); }} whileHover={reduced || node.status === "locked" ? undefined : { y: -3 }} whileTap={reduced || node.status === "locked" ? undefined : { scale: 0.98 }}
              /* Two beats and done. docs/design.md section 11 rules out a looping pulse;
                 a finite one is how the eye is sent to the stop that just opened. */
              animate={node.id === unlockedId && !reduced ? { scale: [1, 1.09, 1, 1.09, 1] } : undefined}
              transition={{ duration: 1.5, delay: 0.35, ease: "easeInOut" }}>
              <Image src={`/assets/challenge-map/${stage.theme}-node.png`} alt="" width={184} height={144} sizes="(max-width: 700px) 64px, 13vw" />
              <span className={styles.nodeNumber} aria-hidden="true">{node.status === "locked" ? "⌑" : node.status === "completed" ? "✓" : index + 1}</span>
              <span className={styles.nodeLabel}>{node.label}{node.status === "locked" && ` · ${statusLabels[locale].locked}`}</span>
            </motion.button>
          </li>)}
        </ol>
        {stage.companion && <div className={styles.companion} data-face={stage.companion.face ?? "left"} style={{ left: `${stage.companion.x / 14.4}%`, top: `${stage.companion.y / 19.29}%` }}>
          {stage.companion.message && <p className={styles.speech}>{stage.companion.message}</p>}
          <Image src="/assets/challenge-map/tico.png" alt="" width={305} height={329} sizes="(max-width: 700px) 75px, 22vw" />
        </div>}
      </div>
    </section>)}
  </div>;
}
