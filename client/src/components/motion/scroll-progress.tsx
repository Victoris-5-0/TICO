"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import styles from "@/components/landing-page.module.css";

export function ScrollProgress() {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 26,
    restDelta: 0.001,
  });

  if (reducedMotion) return null;

  return <motion.div className={styles.progressBar} style={{ scaleX }} />;
}
