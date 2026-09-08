"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
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

export function HeroTextMotion({
  title,
  subtitle,
  body,
}: {
  title: readonly [string, string, string];
  subtitle: string;
  body: string;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <>
      <motion.h1
        id="hero-title"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
      >
        <motion.span
          style={{ display: "block" }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 450, damping: 26, delay: 0.06 }}
        >
          {title[0]}
        </motion.span>
        <motion.span
          style={{ display: "block" }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 450, damping: 26, delay: 0.14 }}
        >
          {title[1]}
        </motion.span>
        <motion.span
          style={{ display: "block" }}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 450, damping: 26, delay: 0.22 }}
        >
          {title[2]}{" "}
          <motion.span
            style={{ display: "inline-block", color: "var(--coral)" }}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 20, delay: 0.3 }}
          >
            TICO
          </motion.span>
        </motion.span>
      </motion.h1>
      <motion.p
        className={styles.subtitle}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: reducedMotion ? 0 : 0.028,
              delayChildren: reducedMotion ? 0 : 0.28,
            },
          },
        }}
      >
        {subtitle.split(/\s+/).map((word, i) => (
          <motion.span
            key={i}
            variants={{
              hidden: { opacity: 0, y: reducedMotion ? 0 : 16 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: "spring" as const, stiffness: 460, damping: 24 },
              },
            }}
            style={{ display: "inline-block", marginInlineEnd: "0.26em" }}
          >
            {word}
          </motion.span>
        ))}
      </motion.p>
      <motion.p
        className={styles.heroBody}
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: reducedMotion ? 0 : 0.016,
              delayChildren: reducedMotion ? 0 : 0.36,
            },
          },
        }}
      >
        {body.split(/\s+/).map((word, i) => (
          <motion.span
            key={i}
            variants={{
              hidden: { opacity: 0, y: reducedMotion ? 0 : 14 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: "spring" as const, stiffness: 460, damping: 24 },
              },
            }}
            style={{ display: "inline-block", marginInlineEnd: "0.26em" }}
          >
            {word}
          </motion.span>
        ))}
      </motion.p>
    </>
  );
}

export function KineticButton({
  children,
  className,
  delay = 0,
  hoverY = -3,
  hoverScale = 1.03,
  tapScale = 0.96,
  inView = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  hoverY?: number;
  hoverScale?: number;
  tapScale?: number;
  inView?: boolean;
}) {
  const reducedMotion = useReducedMotion();

  const variants: Variants = {
    hidden: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.92 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: reducedMotion
        ? { duration: 0.15 }
        : {
            opacity: { duration: 0.22, delay },
            y: { type: "spring" as const, stiffness: 500, damping: 22, delay },
            scale: { type: "spring" as const, stiffness: 540, damping: 20, delay },
          },
    },
    hover: reducedMotion
      ? {}
      : {
          y: hoverY,
          scale: hoverScale,
          transition: { type: "spring" as const, stiffness: 520, damping: 20 },
        },
    tap: reducedMotion
      ? {}
      : {
          scale: tapScale,
          y: 0,
          transition: { type: "spring" as const, stiffness: 600, damping: 25 },
        },
  };

  const animationProps = inView
    ? {
        whileInView: "visible",
        viewport: { once: true, amount: 0.2 },
      }
    : {
        animate: "visible",
      };

  return (
    <motion.div
      className={className}
      initial="hidden"
      {...animationProps}
      whileHover="hover"
      whileTap="tap"
      variants={variants}
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

export function KineticHeading({
  children,
  id,
  className,
  delay = 0,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
  delay?: number;
  as?: "h1" | "h2" | "h3" | "h4";
}) {
  const reducedMotion = useReducedMotion();
  const MotionComponent = motion[Tag];

  return (
    <MotionComponent
      id={id}
      className={className}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={
        reducedMotion
          ? { duration: 0.18, delay }
          : { type: "spring" as const, stiffness: 450, damping: 26, delay }
      }
    >
      {children}
    </MotionComponent>
  );
}

export function KineticText({
  children,
  className,
  delay = 0,
  as: Tag = "p",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "p" | "span" | "div" | "h3" | "h4";
  id?: string;
}) {
  const reducedMotion = useReducedMotion();
  const MotionComponent = motion[Tag];

  return (
    <MotionComponent
      id={id}
      className={className}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={
        reducedMotion
          ? { duration: 0.18, delay }
          : { type: "spring" as const, stiffness: 450, damping: 26, delay }
      }
    >
      {children}
    </MotionComponent>
  );
}

export function KineticAccent({
  children,
  className,
  delay = 0.12,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      className={className}
      style={{ display: "inline-block" }}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 6 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={
        reducedMotion
          ? { duration: 0.18, delay }
          : { type: "spring" as const, stiffness: 520, damping: 20, delay }
      }
    >
      {children}
    </motion.span>
  );
}

export function KineticBadge({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.p
      className={className}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 10 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={
        reducedMotion
          ? { duration: 0.18, delay }
          : { type: "spring" as const, stiffness: 480, damping: 22, delay }
      }
    >
      {children}
    </motion.p>
  );
}

export function KineticWords({
  text,
  as: Tag = "span",
  id,
  className,
  delay = 0,
  stagger = 0.035,
  accentWord,
  accentClass,
  prefix,
  suffix,
}: {
  text: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";
  id?: string;
  className?: string;
  delay?: number;
  stagger?: number;
  accentWord?: string;
  accentClass?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const MotionComponent = motion[Tag];
  const words = text.split(/\s+/).filter(Boolean);

  if (reducedMotion) {
    return (
      <Tag id={id} className={className}>
        {prefix}
        {words.map((word, i) => {
          const isAccent = Boolean(accentWord && word.toLowerCase().includes(accentWord.toLowerCase()));
          return (
            <span key={i} className={isAccent ? accentClass : undefined}>
              {word}{i < words.length - 1 ? " " : ""}
            </span>
          );
        })}
        {suffix}
      </Tag>
    );
  }

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  const wordVariants: Variants = {
    hidden: { opacity: 0, y: 18, scale: 0.92 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 480,
        damping: 24,
      },
    },
  };

  const accentVariants: Variants = {
    hidden: { opacity: 0, y: 12, scale: 0.78 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 540,
        damping: 18,
      },
    },
  };

  return (
    <MotionComponent
      id={id}
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={containerVariants}
    >
      {prefix && (
        <motion.span variants={wordVariants} style={{ display: "inline-block", marginInlineEnd: "0.26em" }}>
          {prefix}
        </motion.span>
      )}
      {words.map((word, i) => {
        const isAccent = Boolean(accentWord && word.toLowerCase().includes(accentWord.toLowerCase()));
        return (
          <motion.span
            key={i}
            variants={isAccent ? accentVariants : wordVariants}
            style={{
              display: "inline-block",
              marginInlineEnd: "0.26em",
              color: isAccent ? "var(--coral)" : undefined,
            }}
            className={isAccent ? accentClass : undefined}
          >
            {word}
          </motion.span>
        );
      })}
      {suffix && (
        <motion.span variants={wordVariants} style={{ display: "inline-block", marginInlineStart: "0.26em" }}>
          {suffix}
        </motion.span>
      )}
    </MotionComponent>
  );
}

export function KineticParagraph({
  text,
  className,
  delay = 0.08,
  stagger = 0.016,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reducedMotion = useReducedMotion();
  const words = text.split(/\s+/).filter(Boolean);

  if (reducedMotion) {
    return <p className={className}>{text}</p>;
  }

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: stagger,
        delayChildren: delay,
      },
    },
  };

  const wordVariants: Variants = {
    hidden: { opacity: 0, y: 14 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 460,
        damping: 24,
      },
    },
  };

  return (
    <motion.p
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      variants={containerVariants}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          variants={wordVariants}
          style={{
            display: "inline-block",
            marginInlineEnd: "0.26em",
          }}
        >
          {word}
        </motion.span>
      ))}
    </motion.p>
  );
}
