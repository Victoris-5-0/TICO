"use client";

import { useAnimationFrame, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { BakeryScene } from "@/components/bakery/scene";
import { missionSceneDuration, missionSceneState, type MissionProps } from "@/lib/bakery/mission-scene";
import { sceneAssetUrls } from "@/lib/bakery/scene-manifest";
import type { Locale } from "@/i18n/config";

import styles from "./mission-player.module.css";

const subscribeToHydration = () => () => {};

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
  label: string;
};

/**
 * The bakery, showing one mission beat.
 *
 * Playback is one-shot, unlike the demo's looping simulation: an animation runs once
 * when the phase arrives or Run is pressed, then holds on its last frame. The scene
 * never autoplays on page load, which `docs/design.md` section 11 requires.
 */
export function MissionScene({ locale, props, animate, playToken = 0, caption, highlight, extendLeft = 0, label }: MissionSceneProps) {
  const ar = locale === "ar-EG";
  const motionPreference = useReducedMotion();
  // Match the server markup first, then apply the browser preference before playback.
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const reduced = hydrated && Boolean(motionPreference);

  const [assets, setAssets] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(1);
  // The run currently playing. Kept in a ref and compared inside the frame callback, so
  // starting a new animation never needs a state write during render or in an effect.
  const run = useRef({ id: "", elapsed: 0, lastFrame: null as number | null });

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      sceneAssetUrls().map(
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

  const duration = missionSceneDuration(animate);

  const advance = useCallback(
    (time: number) => {
      const id = `${animate ?? "none"}:${playToken}`;
      const state = run.current;

      // A new animation, or Run pressed again, rewinds to the start. Under reduced
      // motion the scene jumps straight to the resolved state rather than travelling.
      if (state.id !== id) {
        state.id = id;
        state.elapsed = 0;
        state.lastFrame = null;
        setProgress(reduced || !duration ? 1 : 0);
        return;
      }

      if (!duration || reduced || assets !== "ready") return;

      const previous = state.lastFrame;
      state.lastFrame = time;
      if (previous === null || state.elapsed >= duration) return;

      // Clamped the same way the demo clamps: a backgrounded tab must not finish the
      // whole animation in one frame when it comes back.
      state.elapsed = Math.min(duration, state.elapsed + Math.min(time - previous, 1000));
      setProgress(state.elapsed / duration);
    },
    [animate, playToken, duration, reduced, assets],
  );

  useAnimationFrame(advance);

  const state = missionSceneState({ props, animate, progress });

  return (
    <figure className={styles.scene} data-ready={assets} data-animate={animate ?? "none"}>
      <div className={styles.sceneStage} dir="ltr">
        <BakeryScene state={state} reducedMotion={reduced} counterView={false} label={label} highlight={highlight} extendLeft={extendLeft} />
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
