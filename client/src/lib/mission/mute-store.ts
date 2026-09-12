"use client";

/**
 * One "sound off" switch for the whole product.
 *
 * The narration mute button was the first thing to need it, but a student who turns the
 * voice off does not expect a chime on the challenge map a moment later — so the cue
 * player reads the same flag, and one press silences everything TICO makes noise with.
 *
 * It lives outside React because it is read during playback (from audio callbacks, not
 * renders) and written from a button, and because it has to survive both server
 * rendering and a reload. `useSyncExternalStore` gives the server `false` and the client
 * the remembered value without a state write in an effect, which React 19 rejects.
 */

const MUTE_KEY = "tico.narration.muted";

export const muteStore = {
  listeners: new Set<() => void>(),
  value: false,
  loaded: false,

  read(): boolean {
    if (!this.loaded) {
      this.loaded = true;
      try {
        this.value = window.localStorage.getItem(MUTE_KEY) === "1";
      } catch {
        // Private windows and blocked site data both throw. Unmuted is the right default.
      }
    }
    return this.value;
  },

  set(next: boolean) {
    this.value = next;
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      // Not remembering the choice is survivable; ignoring the choice is not.
    }
    this.listeners.forEach((listener) => listener());
  },

  subscribe(listener: () => void) {
    muteStore.listeners.add(listener);
    return () => { muteStore.listeners.delete(listener); };
  },
};
