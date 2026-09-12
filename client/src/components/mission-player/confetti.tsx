"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

import styles from "./mission-player.module.css";

/**
 * A burst of paper for finishing a mission.
 *
 * One canvas, no library and no images: a few dozen rotating rectangles under gravity is
 * the whole effect, and shipping a dependency for it would cost more bytes than the
 * mission itself. It runs once, for a couple of seconds, and takes itself off the screen
 * — this is punctuation, not decoration.
 *
 * Nothing renders under reduced motion. `docs/design.md` is firm that no feedback a
 * student needs may depend on seeing movement, and none does here: the debrief beside it
 * says what they earned.
 */

const COLOURS = ["#DB5B31", "#E9992F", "#3DABA9", "#F6F1EA", "#8FD8D6"];

type Piece = { x: number; y: number; vx: number; vy: number; angle: number; spin: number; w: number; h: number; colour: string };

export function Confetti({ count = 90, duration = 2400 }: { count?: number; duration?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = element.clientWidth;
    const height = element.clientHeight;
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);
    context.scale(dpr, dpr);

    // Thrown upward and outward from just below the middle, the way a party popper goes
    // off — rather than rained down from the top, which reads as weather.
    const pieces: Piece[] = Array.from({ length: count }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const speed = 6 + Math.random() * 9;
      return {
        x: width / 2 + (Math.random() - 0.5) * width * 0.3,
        y: height * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.34,
        w: 6 + Math.random() * 7,
        h: 9 + Math.random() * 9,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      };
    });

    let frame = 0;
    const started = performance.now();

    const draw = (now: number) => {
      const elapsed = now - started;
      context.clearRect(0, 0, width, height);
      // Fades out over the last third rather than vanishing mid-air.
      context.globalAlpha = Math.max(0, Math.min(1, (duration - elapsed) / (duration * 0.35)));

      for (const piece of pieces) {
        piece.vy += 0.42;      // gravity
        piece.vx *= 0.992;     // a little drag, so they drift rather than fly straight
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.angle += piece.spin;

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        context.fillStyle = piece.colour;
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        context.restore();
      }

      if (elapsed < duration) frame = requestAnimationFrame(draw);
      else context.clearRect(0, 0, width, height);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [count, duration, reduced]);

  if (reduced) return null;
  return <canvas ref={canvas} className={styles.confetti} aria-hidden="true" />;
}
