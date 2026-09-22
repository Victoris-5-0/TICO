"use client";

import { useAnimationFrame, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BakeryScene } from "@/components/bakery/scene";
import { TrafficScene, trafficSceneDuration } from "@/components/traffic/traffic-scene";
import { flourSacks, missionSceneDuration, missionSceneState, queueLength, shopOpen, type MissionProps, type WorldBeat } from "@/lib/bakery/mission-scene";
import { bakeryScene, frame, propAssetUrls, sceneAssetUrls, worldPropNames } from "@/lib/bakery/scene-manifest";
import { CUSTOMER_IDS } from "@/lib/bakery/simulation";
import type { Locale } from "@/i18n/config";

import styles from "./mission-player.module.css";

const subscribeToHydration = () => () => {};

/** How long a beat with no animation holds, so its line can be read. */
const STILL_BEAT_MS = 2200;

export type MissionSceneProps = {
  locale: Locale;
  worldSlug: string;
  props?: MissionProps;
  /** Name of the animation to play. Changing this restarts playback. */
  animate?: string | null;
  /** Bumping this replays the current animation — Run pressed twice. */
  playToken?: number;
  caption?: string | null;
  /** Sprite names a phase-2 question is pointing at. */
  highlight?: readonly string[];
  /**
   * Extra wall painted to the left of the artwork, for the mission panel to sit on.
   *
   * Only wanted when the panel overlays the scene. On a narrow screen the panel is below
   * it, so the extension would just make the frame wider than the band it is drawn in and
   * letterbox the bakery into a strip.
   */
  extendLeft?: number;
  /**
   * The one prop a phase is waiting to be clicked, and what to do about it.
   *
   * Missions point at things with `highlight`; this makes the pointed-at thing pressable,
   * so a phase can say "press the sign" and mean it. Only the named prop is clickable —
   * the ring is the whole affordance.
   */
  /**
   * A sequence to play instead of a single animation: bake, then she walks in, then she
   * asks. Each beat speaks its own line over the character while it runs.
   */
  beats?: readonly WorldBeat[];
  /** Who is speaking when no beat is. The opening line, usually. */
  speech?: { name: string; line: string } | null;
  /** Where speech sits, in the scene's own coordinates converted by the caller. */
  speechAt?: { left: string; bottom: string };
  /**
   * The customer is waiting and the code is not right yet. She shows it, and says so,
   * for as long as that is true.
   */
  upset?: { line: string; name: string } | null;
  pickable?: string;
  onPick?: (name: string) => void;
  pickLabel?: (name: string) => string;
  label: string;
  onSettled?: () => void;
};

/**
 * The bakery, showing one mission beat.
 *
 * Playback is one-shot, unlike the demo's looping simulation: an animation runs once
 * when the phase arrives or Run is pressed, then holds on its last frame. The scene
 * never autoplays on page load, which `docs/design.md` section 11 requires.
 */
export function MissionScene({ locale, worldSlug, props, animate, playToken = 0, caption, highlight, extendLeft = 0, beats, speech = null, speechAt, upset = null, pickable, onPick, pickLabel, label, onSettled }: MissionSceneProps) {
  const ar = locale === "ar-EG";
  const motionPreference = useReducedMotion();
  // Match the server markup first, then apply the browser preference before playback.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const reduced = hydrated && Boolean(motionPreference);

  const [assets, setAssets] = useState<"loading" | "ready" | "error">(
    worldSlug === "isharet-cairo" ? "ready" : "loading",
  );
  const [progress, setProgress] = useState(1);
  // The run currently playing. Kept in a ref and compared inside the frame callback, so
  // starting a new animation never needs a state write during render or in an effect.
  const run = useRef({ id: "", beat: 0, elapsed: 0, finished: false, lastFrame: null as number | null });

  useEffect(() => {
    if (worldSlug === "isharet-cairo") {
      return;
    }
    let cancelled = false;
    Promise.all(
      [...sceneAssetUrls(), ...propAssetUrls(worldPropNames), frame("delivery-load"), ...CUSTOMER_IDS.map((c) => frame(`angry-${c}`))].map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const img = new window.Image();
            img.onload = () => img.decode().then(resolve, reject);
            img.onerror = reject;
            img.src = src;
          }),
      ),
    ).then(
      () => { if (!cancelled) setAssets("ready"); },
      () => { if (!cancelled) setAssets("error"); },
    );
    return () => { cancelled = true; };
  }, [worldSlug]);

  // A sequence of beats, or the single animation a phase has always been able to name.
  // Memoised so the frame callback is not rebuilt every render, which would restart the
  // sequence on each one.
  const timeline: readonly WorldBeat[] = useMemo(
    () => (beats?.length ? beats : [{ animate, props }]),
    [beats, animate, props],
  );
  const [beat, setBeat] = useState(0);
  const current = timeline[Math.min(beat, timeline.length - 1)];

  const advance = useCallback(
    (time: number) => {
      const id = `${timeline.map((b) => b.animate ?? "none").join(">")}:${playToken}`;
      const state = run.current;

      // A new sequence, or Run pressed again, rewinds to the start. Under reduced motion
      // the scene jumps to the resolved end rather than travelling through it.
      if (state.id !== id) {
        state.id = id;
        // The beat counter has to rewind with the clock. Leaving it behind meant the
        // second sequence of a phase started past its own end: the six-beat twist left
        // it at 5, the three-beat handover clamped to its last frame, and the bread was
        // never handed over, paid for or carried out of the shop.
        state.beat = reduced ? timeline.length - 1 : 0;
        state.elapsed = 0;
        state.finished = false;
        state.lastFrame = null;
        setBeat(state.beat);
        setProgress(reduced ? 1 : 0);
        if (reduced) { state.finished = true; onSettled?.(); }
        return;
      }

      if (reduced || state.finished || assets !== "ready") return;
      if (document.hidden) { state.lastFrame = null; return; }

      const step = timeline[Math.min(state.beat, timeline.length - 1)];
      const span = worldSlug === "isharet-cairo"
        ? trafficSceneDuration(step.animate)
        : missionSceneDuration(step.animate);
      const previous = state.lastFrame;
      state.lastFrame = time;
      if (previous === null) return;

      // A still beat still holds the screen, so a line has time to be read before the
      // next one replaces it.
      const hold = span || STILL_BEAT_MS;
      if (state.elapsed >= hold) {
        if (state.beat >= timeline.length - 1) { state.finished = true; onSettled?.(); return; }
        state.beat += 1;
        state.elapsed = 0;
        setBeat(state.beat);
        setProgress(0);
        return;
      }

      // Clamped the same way the demo clamps: a backgrounded tab must not finish the
      // whole animation in one frame when it comes back.
      state.elapsed = Math.min(hold, state.elapsed + Math.min(time - previous, 1000));
      setProgress(span ? state.elapsed / span : 1);
    },
    [timeline, playToken, reduced, assets, onSettled, worldSlug],
  );

  useAnimationFrame(advance);

  const shown = { ...props, ...current.props };
  const state = missionSceneState({ props: shown, animate: current.animate, progress });
  const open = shopOpen(shown);
  // Only when she is actually standing there. Nobody is impatient in an empty shop.
  const waiting = Boolean(upset) && (worldSlug === "isharet-cairo"
    ? Number(shown.waiting_cars ?? 0) > 0
    : queueLength(shown) > 0);
  const atWorld = (x: number, y: number) => ({
    left: `${((x + extendLeft) / (1600 + extendLeft)) * 100}%`,
    bottom: `${((900 - y) / 900) * 100}%`,
  });
  const saying = current.lineAr ? { name: current.speakerNameAr ?? "", line: current.lineAr } : speech;

  return (
    <figure className={styles.scene} data-ready={assets} data-animate={animate ?? "none"}>
      <div className={styles.sceneStage} dir="ltr">
        {/* `loose` furnishes the shop the way the opening tour does — the till, the scale,
            the bags, the order sheet. A mission drawn without them is the same bare counter
            every time, which is what made every scene look identical. */}
        {worldSlug === "isharet-cairo" ? (
          <TrafficScene
            props={shown}
            animate={current.animate}
            progress={progress}
            highlight={highlight}
            pickable={pickable}
            onPick={onPick}
            pickLabel={pickLabel}
          />
        ) : (
          <BakeryScene
            state={state}
            reducedMotion={reduced}
            counterView={false}
            label={label}
            highlight={highlight}
            extendLeft={extendLeft}
            loose={worldPropNames}
            sacks={flourSacks(shown)}
            delivery={shown.delivery === "loaded" || shown.delivery === "sent" || shown.delivery === "parked" ? shown.delivery : undefined}
            sign={open === undefined ? undefined : { open, label: open ? (ar ? "مفتوح" : "OPEN") : (ar ? "مقفول" : "CLOSED") }}
            upset={waiting}
            pickable={pickable}
            onPick={onPick}
            pickLabel={pickLabel}
          />
        )}
        {waiting && upset ? (
          <div
            className={`${styles.sceneSpeech} ${styles.sceneSpeechUrgent}`}
            style={worldSlug === "isharet-cairo" ? { left: "46%", bottom: "42%" } : atWorld(bakeryScene.queue.first.x, 548)}
            dir={ar ? "rtl" : "ltr"}
          >
            <span>{upset.name}</span>
            <p aria-live="assertive">{upset.line}</p>
          </div>
        ) : saying?.line ? (
          <div
            className={`${styles.sceneSpeech} ${worldSlug === "isharet-cairo" ? styles.sceneSpeechTraffic : ""}`}
            style={speechAt}
            dir={ar ? "rtl" : "ltr"}
          >
            {saying.name && <span>{saying.name}</span>}
            <p aria-live="polite">{saying.line}</p>
          </div>
        ) : null}
        {assets !== "ready" && (
          <div className={styles.sceneLoading}>
            {assets === "loading"
              ? ar ? "بنجهّز العالم…" : "Getting the world ready…"
              : ar ? "بعض الصور متحمّلتش." : "Some scene assets could not load."}
          </div>
        )}
      </div>
      {caption && (
        <figcaption className={styles.sceneCaption} role="status" aria-live="polite">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
