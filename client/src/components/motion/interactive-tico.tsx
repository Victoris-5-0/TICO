"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import styles from "./interactive-tico.module.css";

const atlas = "/assets/landing/tico/layers.webp";
const clamp = (value: number) => Math.max(-1, Math.min(1, value));

// Viewports isolate the generated parts without duplicating the atlas download.
function Part({ crop, x = 0, y = 0, width, height }: {
  crop: string; x?: number; y?: number; width: number; height: number;
}) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox={crop} overflow="hidden">
      <image href={atlas} width="1536" height="1024" />
    </svg>
  );
}

export function InteractiveTico({ locale }: { locale: "en" | "ar-EG" }) {
  const root = useRef<HTMLDivElement>(null);
  const greet = useRef<() => void>(() => {});
  const reduced = useReducedMotion();
  const eyesX = useSpring(0, { stiffness: 260, damping: 26 });
  const eyesY = useSpring(0, { stiffness: 260, damping: 26 });
  const headX = useSpring(0, { stiffness: 125, damping: 22 });
  const headY = useSpring(0, { stiffness: 125, damping: 22 });
  const lean = useSpring(0, { stiffness: 75, damping: 20 });
  const wave = useSpring(0, { stiffness: 240, damping: 15 });
  const light = useSpring(1, { stiffness: 180, damping: 18 });
  const tilt = useTransform(headX, [-8, 8], [-5, 5]);
  const antennaY = useTransform(headY, [-5, 5], [-3, 3]);

  useEffect(() => {
    const element = root.current;
    const hero = element?.closest("section");
    if (!element || !hero) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    let visible = true;
    let greeting = false;
    let lastGreeting = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, delay: number) => {
      const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay);
      timers.add(timer);
    };
    const neutral = (immediate = false) => {
      for (const value of [eyesX, eyesY, headX, headY, lean, wave]) {
        if (immediate || reduced) value.jump(0);
        else value.set(0);
      }
      light.jump(1);
    };
    const stop = () => {
      timers.forEach(clearTimeout);
      timers.clear();
      greeting = false;
      neutral(true);
    };
    const look = (clientX: number, clientY: number) => {
      if (reduced || !visible || document.hidden) return;
      const bounds = element.getBoundingClientRect();
      const x = clamp((clientX - (bounds.left + bounds.width * 0.49)) / (bounds.width * 0.9));
      const y = clamp((clientY - (bounds.top + bounds.height * 0.33)) / (bounds.height * 0.65));
      eyesX.set(x * 17);
      eyesY.set(y * 14);
      headX.set(x * 8);
      headY.set(y * 5);
      lean.set(x * 1.5);
    };
    greet.current = () => {
      if (!visible || document.hidden || greeting || Date.now() - lastGreeting < 1400) return;
      lastGreeting = Date.now();
      greeting = true;
      // Reduced motion gets a brief color change, with no travel or rotation.
      if (reduced) {
        light.jump(0.65);
      } else {
        wave.set(-13);
        light.set(1.12);
        later(() => wave.set(9), 180);
        later(() => wave.set(-10), 360);
        later(() => wave.set(5), 540);
      }
      later(() => {
        wave.set(0);
        light.set(1);
        greeting = false;
      }, 760);
    };
    const move = (event: PointerEvent) => {
      if (fine.matches && event.pointerType !== "touch") look(event.clientX, event.clientY);
    };
    const leave = () => neutral();
    const focus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target.closest("[data-tico-greeting]");
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      look(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      greet.current();
    };
    const hover = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !fine.matches) return;
      const target = event.target.closest("[data-tico-greeting]");
      if (target && !(event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) greet.current();
    };
    const visibility = () => { if (document.hidden) stop(); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) stop();
    });
    observer.observe(element);
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", leave);
    hero.addEventListener("pointerover", hover);
    hero.addEventListener("focusin", focus);
    hero.addEventListener("focusout", leave);
    document.addEventListener("visibilitychange", visibility);
    fine.addEventListener("change", stop);
    return () => {
      stop();
      greet.current = () => {};
      observer.disconnect();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", leave);
      hero.removeEventListener("pointerover", hover);
      hero.removeEventListener("focusin", focus);
      hero.removeEventListener("focusout", leave);
      document.removeEventListener("visibilitychange", visibility);
      fine.removeEventListener("change", stop);
    };
  }, [reduced, eyesX, eyesY, headX, headY, lean, wave, light]);

  return (
    <div ref={root} className={styles.character} data-interactive-tico>
      <button
        type="button"
        className={styles.greeting}
        aria-label={locale === "en" ? "Say hello to TICO" : "سلّم على تيكو"}
        onClick={() => greet.current()}
      >
        <svg viewBox="0 0 620 800" className={styles.rig} aria-hidden="true" focusable="false">
          <ellipse cx="318" cy="747" rx="152" ry="18" fill="#72533C" opacity="0.18" />
          <motion.g style={{ rotate: lean, originX: "318px", originY: "747px" }}>
            <motion.g style={{ rotate: wave, originX: "400px", originY: "472px" }} data-tico-arm>
              <Part crop="70 555 410 425" x={361} y={286} width={217} height={225} />
            </motion.g>
            <Part crop="610 80 320 420" x={180} y={405} width={260} height={341} />
            <Part crop="1140 60 210 420" x={147} y={434} width={121} height={242} />
            <motion.g style={{ x: headX, y: headY, rotate: tilt, originX: "310px", originY: "418px" }} data-tico-head>
              <svg x="70" y="30" width="432" height="396" viewBox="0 0 480 440" overflow="visible">
                <Part crop="40 45 480 440" width={480} height={440} />
                <motion.g style={{ x: eyesX, y: eyesY }} data-tico-pupils>
                  <Part crop="675 660 185 190" x={170} y={230} width={74} height={76} />
                  <Part crop="675 660 185 190" x={333} y={225} width={74} height={76} />
                </motion.g>
                <motion.g style={{ y: antennaY, scale: reduced ? 1 : light, opacity: reduced ? light : 1, originX: "300px", originY: "15px" }}>
                  <Part crop="1190 675 165 160" x={270} y={-16} width={63} height={61} />
                </motion.g>
              </svg>
            </motion.g>
          </motion.g>
        </svg>
        <span className={styles.hint}>{locale === "en" ? "Say hello!" : "سلّم عليّا!"}</span>
      </button>
    </div>
  );
}
