"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { muteStore } from "@/lib/mission/mute-store";
import { narrationDir } from "@/lib/mission/narration";
import type { Locale } from "@/i18n/config";

import styles from "./mission-player.module.css";

/**
 * Playback for the pre-recorded mission lines.
 *
 * Each phase declares the lines it narrates, and they play in order as the phase appears.
 * A mission is a sequence of moments rather than a page of text, and the student has
 * already pressed something to get to each one — so the line reads itself, and the only
 * controls are the two that matter: silence it, or hear it again.
 *
 * ## Autoplay and the first line
 *
 * Browsers only allow audio after a user gesture. Every phase from the second onward is
 * reached by pressing a button, so playback is permitted. The *first* line — the
 * encounter, on a freshly loaded page — has had no gesture and will usually be blocked.
 * That is not treated as an error: the rejection is swallowed and the repeat control is
 * sitting right there, which is also what a student who missed the line wants anyway.
 *
 * One `Audio` element for the whole player, so a phase change cuts the previous line off
 * rather than talking over it.
 */

/** Server and first client render agree on "not muted"; the stored value applies after. */
const useMuted = () =>
  useSyncExternalStore(muteStore.subscribe, () => muteStore.read(), () => false);

type NarrationValue = {
  muted: boolean;
  toggleMute: () => void;
  replay: () => void;
  /** False when this mission has no recordings at all, so the controls can hide. */
  hasAudio: boolean;
};

const NarrationContext = createContext<NarrationValue | null>(null);

export function NarrationProvider({
  missionId,
  keys,
  sequence,
  children,
}: {
  missionId: string;
  /** Line keys that have a recording, from the manifest. */
  keys: readonly string[];
  /** What the phase now on screen narrates, in order. */
  sequence: readonly string[];
  children: ReactNode;
}) {
  const muted = useMuted();

  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);

  const available = useMemo(() => new Set(keys), [keys]);
  const playable = useMemo(
    () => sequence.filter((key) => available.has(key)),
    [sequence, available],
  );
  // A stable identity for "this phase's narration", so the effect below restarts when the
  // phase changes but not when the array is merely rebuilt.
  const sequenceId = playable.join("|");

  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    queue.current = [];
  }, []);

  const playQueue = useCallback(() => {
    // `step` recurses on itself rather than on the memoised `playQueue`, so the chain
    // cannot end up calling a stale copy after a re-render.
    const step = () => {
      const next = queue.current.shift();
      if (next === undefined) {
        audio.current = null;
        return;
      }

      const element = new Audio(`${narrationDir(missionId)}/${next}.mp3`);
      element.onended = step;
      // A missing or unplayable file should not strand the rest of the sequence.
      element.onerror = step;
      audio.current = element;

      // Rejected when the browser has had no gesture yet — expected on the first line.
      void element.play().catch(() => {});
    };
    step();
  }, [missionId]);

  // The phase changed — or the student unmuted — so cut whatever was speaking and read
  // the line now on screen.
  useEffect(() => {
    stop();
    if (muted || !sequenceId) return;
    queue.current = sequenceId.split("|");
    playQueue();
    return stop;
  }, [sequenceId, muted, missionId, playQueue, stop]);

  const toggleMute = useCallback(() => {
    const nowMuted = !muteStore.read();
    if (nowMuted) stop();
    muteStore.set(nowMuted);
  }, [stop]);

  const replay = useCallback(() => {
    // Deliberately plays even while muted: pressing repeat is an unambiguous request to
    // hear it, and silently doing nothing would read as a broken button.
    stop();
    if (!playable.length) return;
    queue.current = [...playable];
    playQueue();
  }, [playable, playQueue, stop]);

  const value = useMemo(
    () => ({ muted, toggleMute, replay, hasAudio: available.size > 0 }),
    [muted, toggleMute, replay, available.size],
  );

  return <NarrationContext.Provider value={value}>{children}</NarrationContext.Provider>;
}

/** Mute and repeat. Hidden entirely when the mission has no recordings. */
export function NarrationControls({ locale }: { locale: Locale }) {
  const narration = useContext(NarrationContext);
  const ar = locale === "ar-EG";

  if (!narration?.hasAudio) return null;

  return (
    <div className={styles.narrationControls}>
      <button
        type="button"
        className={`${styles.narrationButton} ${narration.muted ? styles.narrationMuted : ""}`}
        onClick={narration.toggleMute}
        aria-pressed={narration.muted}
        aria-label={ar ? (narration.muted ? "شغّل الصوت" : "اكتم الصوت") : narration.muted ? "Unmute narration" : "Mute narration"}
      >
        <span aria-hidden="true">{narration.muted ? "🔇" : "🔊"}</span>
      </button>
      <button
        type="button"
        className={styles.narrationButton}
        onClick={narration.replay}
        aria-label={ar ? "اسمع تاني" : "Play again"}
      >
        <span aria-hidden="true">↻</span>
      </button>
    </div>
  );
}
