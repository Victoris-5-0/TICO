"use client";

/**
 * Mission sound cues stay as a no-op so existing visual progression call sites remain
 * intact without creating an audio context or playing a sound.
 */

type Cue = "success" | "unlock";

export function playCue(cue: Cue) {
  // Mission interactions are intentionally silent. Keep the call sites so visual
  // feedback and progression remain unchanged while no audio context is created.
  void cue;
}
