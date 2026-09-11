"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import type { MissionDebrief as Debrief } from "@/lib/mission/telemetry";
import type { Locale } from "@/i18n/config";

import styles from "./mission-player.module.css";

/**
 * What the student sees when the mission is done.
 *
 * `docs/design.md` section 9 fixes the order, and it is learning first, reward second:
 *
 *   1. what the code accomplished in the Egyptian world
 *   2. the concept that improved
 *   3. 100 XP, once
 *   4. a badge only when newly earned
 *   5. recap/replay and one Next action
 *
 * The whole sequence stays under 1.8s and is skippable at any point — the actions are
 * live from the first frame, so nobody is held behind an animation. The XP figure counts
 * from the previous value exactly once; a remount must not replay it, which is why the
 * count is keyed off the awarded value rather than a mount effect.
 */

const XP_AWARD = 100;

export function MissionDebrief({
  locale,
  titleAr,
  conceptNameAr,
  worldLine,
  debrief,
  onReplay,
  onNext,
}: {
  locale: Locale;
  titleAr: string;
  conceptNameAr: string;
  /** One line of what their code actually did in the bakery. */
  worldLine: string;
  debrief: Debrief | null;
  onReplay: () => void;
  onNext: () => void;
}) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const format = new Intl.NumberFormat(locale);

  const xp = debrief?.xpAwarded ?? XP_AWARD;
  const [counted, setCounted] = useState(0);

  // Under reduced motion the number simply *is* the award — derived during render rather
  // than written by an effect, so there is no cascading render and no frame where a
  // reduced-motion reader sees a zero. docs/design.md: never make learning feedback
  // depend on seeing movement.
  const shown = reduced ? xp : counted;

  // Otherwise it counts up once, from the previous value to the award.
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const steps = 22;
    const id = window.setInterval(() => {
      frame += 1;
      setCounted(Math.round((xp * frame) / steps));
      if (frame >= steps) window.clearInterval(id);
    }, 24);
    return () => window.clearInterval(id);
  }, [xp, reduced]);

  const stars = debrief?.starsEarned ?? 0;
  const rise = (delay: number) =>
    reduced
      ? {}
      : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.22 } };

  return (
    <section className={styles.debrief} dir={ar ? "rtl" : "ltr"}>
      <Image
        className={styles.debriefMascot}
        src="/assets/characters/tico/tico-celebrating.webp"
        alt=""
        width={421}
        height={734}
        sizes="120px"
      />

      {/* 1. What the code accomplished, in the world. */}
      <motion.p className={styles.debriefWorld} {...rise(0)}>{worldLine}</motion.p>

      {/* 2. The concept that improved. */}
      <motion.div className={styles.debriefConcept} {...rise(0.12)}>
        <span>{ar ? "المفهوم اللي اتحسن" : "Concept improved"}</span>
        <strong>{conceptNameAr}</strong>
      </motion.div>

      {/* 3. XP, counted once. */}
      <motion.div className={styles.debriefXp} {...rise(0.24)}>
        <span className={styles.debriefXpValue} aria-hidden="true">+{format.format(shown)}</span>
        <span className={styles.srOnlyText}>{ar ? `كسبت ${format.format(xp)} نقطة` : `You earned ${format.format(xp)} XP`}</span>
        <span className={styles.debriefXpLabel}>XP</span>
      </motion.div>

      {/* 4. Stars, only when the run earned them. */}
      {stars > 0 && (
        <motion.p className={styles.debriefStars} {...rise(0.34)}
          aria-label={ar ? `${stars} من ٣ نجوم` : `${stars} of 3 stars`}>
          {"★".repeat(stars)}<span className={styles.debriefStarsDim}>{"★".repeat(Math.max(0, 3 - stars))}</span>
        </motion.p>
      )}

      {debrief?.ticoFeedback && (
        <motion.p className={styles.debriefFeedback} {...rise(0.4)}>{debrief.ticoFeedback}</motion.p>
      )}

      {debrief && (
        <dl className={styles.debriefStats}>
          <div><dt>{ar ? "محاولات" : "Attempts"}</dt><dd>{format.format(debrief.totalAttempts)}</dd></div>
          <div><dt>{ar ? "تلميحات" : "Hints"}</dt><dd>{format.format(debrief.hintsUsed)}</dd></div>
          <div><dt>{ar ? "الوقت" : "Time"}</dt><dd>{format.format(Math.round(debrief.timeSpentMs / 1000))}s</dd></div>
        </dl>
      )}

      {/* 5. Recap, then one Next. Live immediately — never gated on the animation. */}
      <div className={styles.debriefActions}>
        <button type="button" className={styles.ghostAction} onClick={onReplay}>
          {ar ? "العب تاني" : "Play again"}
        </button>
        <button type="button" className={styles.primaryAction} onClick={onNext}>
          {ar ? "شوف الخريطة" : "See the map"}
        </button>
      </div>

      <p className={styles.debriefTitle}>{titleAr}</p>
    </section>
  );
}
