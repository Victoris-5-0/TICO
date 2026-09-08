"use client";

import { motion, useReducedMotion } from "motion/react";

type MotionBoxProps = {
  children: React.ReactNode;
  className?: string;
  hoverY?: number;
  hoverScale?: number;
  tapScale?: number;
};

export function Interactive({
  children,
  className,
  hoverY = -2,
  hoverScale = 1.02,
  tapScale = 0.98,
}: MotionBoxProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      whileHover={reducedMotion ? {} : { y: hoverY, scale: hoverScale }}
      whileTap={reducedMotion ? {} : { scale: tapScale }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
    >
      {children}
    </motion.div>
  );
}

export function CompassRotate({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      style={{ display: "inline-flex" }}
      whileHover={reducedMotion ? {} : { rotate: [0, -35, 25, -12, 0], transition: { duration: 0.65, ease: "easeInOut" } }}
    >
      {children}
    </motion.span>
  );
}

export function ArrowShift({
  children,
  isRtl = false,
}: {
  children: React.ReactNode;
  isRtl?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const forwardX = isRtl ? -6 : 6;

  return (
    <motion.span
      aria-hidden="true"
      style={{ display: "inline-block" }}
      whileHover={reducedMotion ? {} : { x: forwardX }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {children}
    </motion.span>
  );
}
