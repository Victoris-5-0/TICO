"use client";

import { muteStore } from "@/lib/mission/mute-store";

/**
 * The two sounds TICO makes: finishing a mission, and a new one opening on the map.
 *
 * Synthesised with Web Audio rather than shipped as files. They are three notes each —
 * an mp3 of that is a download, a cache entry and an asset to keep in sync with nothing,
 * and these have to be *short*: a sound effect a child hears on every mission becomes an
 * irritation long before the tenth time. Tuned to a major triad so they read as "good"
 * without being a fanfare.
 *
 * Silent when the student has muted TICO — the same flag the narration button sets, so
 * turning the voice off does not leave chimes behind.
 */

type Cue = "success" | "unlock";

/** Frequency, start offset and length of each note, in Hz and seconds. */
const CUES: Record<Cue, ReadonlyArray<readonly [number, number, number]>> = {
  // C5 - E5 - G5 - C6, a rising major arpeggio that lands on the octave.
  success: [[523.25, 0, 0.16], [659.25, 0.09, 0.16], [783.99, 0.18, 0.18], [1046.5, 0.28, 0.42]],
  // Two notes, a fifth apart: a latch opening, not a fanfare.
  unlock: [[783.99, 0, 0.14], [1046.5, 0.1, 0.34]],
};

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    // Created on first use, not at import: constructing one before any gesture leaves a
    // suspended context around on every page that merely loads this module.
    context ??= new AudioContext();
    // A context created before the student has interacted starts suspended. Resuming is
    // allowed once anything has been clicked, and rejects harmlessly before that.
    if (context.state === "suspended") void context.resume().catch(() => {});
    return context;
  } catch {
    return null;
  }
}

/**
 * Play one cue. Never throws, never blocks: a browser that refuses audio simply makes no
 * sound, and the moment it belongs to carries on.
 */
export function playCue(cue: Cue) {
  if (muteStore.read()) return;
  const ctx = audio();
  if (!ctx) return;

  const now = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  // Quiet on purpose. This plays over narration and in a classroom.
  master.gain.value = 0.16;
  master.connect(ctx.destination);

  for (const [frequency, at, length] of CUES[cue]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    // Triangle, not sawtooth or square: a soft mallet rather than a games-console beep.
    osc.type = "triangle";
    osc.frequency.value = frequency;

    // A quick attack and an exponential tail. Ramping to zero is invalid for an
    // exponential ramp, so it lands just above it and is then cut.
    const start = now + at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(1, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }
}
