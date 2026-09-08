"use client";

import { motion, useReducedMotion } from "motion/react";
import styles from "@/components/landing-page.module.css";

export function HeroArtMotion({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={styles.heroArt}
      aria-hidden="true"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function HeroFloatingCardMotion({ locale }: { locale: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={styles.heroFloatingCard}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.92 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: [0, -8, 0], scale: 1 }}
      transition={reducedMotion ? { duration: 0.3 } : {
        opacity: { duration: 0.5, delay: 0.4 },
        scale: { duration: 0.5, delay: 0.4 },
        y: { duration: 4.6, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
      }}
    >
      <span aria-hidden="true">💡</span>
      <code>print(&quot;{locale === "ar-EG" ? "أهلاً يا مصر!" : "Hello, Egypt!"}&quot;)</code>
      <span className={styles.heroFloatingXp}>+100 XP</span>
    </motion.div>
  );
}

export function LiveBadgeMotion({ label }: { label: string }) {
  const reducedMotion = useReducedMotion();

  return (
    <div className={styles.previewBadge}>
      <motion.span
        className={styles.previewLiveDot}
        animate={reducedMotion ? {} : { scale: [1, 1.35, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <span>{label}</span>
    </div>
  );
}

export function CardMotion({
  children,
  hoverY = -8,
  className,
}: {
  children: React.ReactNode;
  hoverY?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileHover={reducedMotion ? {} : { y: hoverY, transition: { type: "spring", stiffness: 350, damping: 25 } }}
    >
      {children}
    </motion.div>
  );
}

export function StepNumberMotion({
  children,
  isRtl,
}: {
  children: React.ReactNode;
  isRtl: boolean;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      className={styles.stepNumber}
      whileHover={reducedMotion ? {} : { scale: 1.15, rotate: isRtl ? -4 : 4 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
    >
      {children}
    </motion.span>
  );
}
