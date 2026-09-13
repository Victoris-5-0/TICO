"use client";

import { useAnimationFrame, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BakeryScene } from "@/components/bakery/scene";
import { flourSacks, missionSceneDuration, missionSceneState, shopOpen, type MissionProps, type WorldBeat } from "@/lib/bakery/mission-scene";
import { propAssetUrls, sceneAssetUrls, worldPropNames } from "@/lib/bakery/scene-manifest";
import type { Locale } from "@/i18n/config";

import styles from "./mission-player.module.css";

const subscribeToHydration = () => () => {};

/** How long a beat with no animation holds, so its line can be read. */
const STILL_BEAT_MS = 2200;

export type MissionSceneProps = {
  locale: Locale;
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
  pickable?: string;
  onPick?: (name: string) => void;
  pickLabel?: (name: string) => string;
  label: string;
};

/**
 * The bakery, showing one mission beat.
 *
 * Playback is one-shot, unlike the demo's looping simulation: an animation runs once
 * when the phase arrives or Run is pressed, then holds on its last frame. The scene
 * never autoplays on page load, which `docs/design.md` section 11 requires.
 */
export function MissionScene({ locale, props, animate, playToken = 0, caption, highlight, extendLeft = 0, beats, speech = null, speechAt, pickable, onPick, pickLabel, label }: MissionSceneProps) {
  const ar = locale === "ar-EG";
  const motionPreference = useReducedMotion();
  // Match the server markup first, then apply the browser preference before playback.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const reduced = hydrated && Boolean(motionPreference);

  const [assets, setAssets] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(1);
  // The run currently playing. Kept in a ref and compared inside the frame callback, so
  // starting a new animation never needs a state write during render or in an effect.
  const run = useRef({ id: "", beat: 0, elapsed: 0, lastFrame: null as number | null });

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      [...sceneAssetUrls(), ...propAssetUrls(worldPropNames)].map(
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
  }, []);

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
        state.elapsed = 0;
        state.lastFrame = null;
        setBeat(reduced ? timeline.length - 1 : 0);
        setProgress(reduced ? 1 : 0);
        return;
      }

      if (reduced || assets !== "ready") return;

      const step = timeline[Math.min(state.beat, timeline.length - 1)];
      const span = missionSceneDuration(step.animate);
      const previous = state.lastFrame;
      state.lastFrame = time;
      if (previous === null) return;

      // A still beat still holds the screen, so a line has time to be read before the
      // next one replaces it.
      const hold = span || STILL_BEAT_MS;
      if (state.elapsed >= hold) {
        if (state.beat >= timeline.length - 1) return;
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
    [timeline, playToken, reduced, assets],
  );

  useAnimationFrame(advance);

  const shown = { ...props, ...current.props };
  const state = missionSceneState({ props: shown, animate: current.animate, progress });
  const open = shopOpen(shown);
  const saying = current.lineAr ? { name: current.speakerNameAr ?? "", line: current.lineAr } : speech;

  return (
    <figure className={styles.scene} data-ready={assets} data-animate={animate ?? "none"}>
      <div className={styles.sceneStage} dir="ltr">
        {/* `loose` furnishes the shop the way the opening tour does — the till, the scale,
            the bags, the order sheet. A mission drawn without them is the same bare counter
            every time, which is what made every scene look identical. */}
        <BakeryScene
          state={state}
          reducedMotion={reduced}
          counterView={false}
          label={label}
          highlight={highlight}
          extendLeft={extendLeft}
          loose={worldPropNames}
          sacks={flourSacks(shown)}
          sign={open === undefined ? undefined : { open, label: open ? (ar ? "مفتوح" : "OPEN") : (ar ? "مقفول" : "CLOSED") }}
          pickable={pickable}
          onPick={onPick}
          pickLabel={pickLabel}
        />
        {saying?.line && (
          <div className={styles.sceneSpeech} style={speechAt} dir={ar ? "rtl" : "ltr"}>
            {saying.name && <span>{saying.name}</span>}
            <p aria-live="polite">{saying.line}</p>
          </div>
        )}
        {assets !== "ready" && (
          <div className={styles.sceneLoading}>
            {assets === "loading"
              ? ar ? "بنجهّز الفرن…" : "Getting the bakery ready…"
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
