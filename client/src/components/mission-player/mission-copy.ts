/**
 * Small shared pieces of the player: who has a face, and how a blank is judged.
 */

/**
 * A speaker id from the world manifest to the portrait the player shows.
 *
 * The `characters` block in `el_forn.yaml` names eleven; these are the ones with a
 * portrait-shaped asset. Everyone else falls back to TICO, which is also what the
 * manifest expects for worlds with no NPC artwork.
 *
 * The queue customers use frame 0 of their sprite atlas, which is a 3x2 sheet — a
 * portrait crop of one is a separate asset nobody has drawn, so only the three
 * characters with standalone art appear here.
 */
export const SPEAKER_PORTRAITS: Record<string, string> = {
  tico: "/assets/characters/tico/tico-neutral.webp",
  hassan: "/assets/characters/bakery/hassan-v1.webp",
  mariam: "/assets/characters/bakery/mariam-v1.webp",
  salma: "/assets/characters/bakery/salma-v1.webp",
};

export const TICO_PORTRAIT = SPEAKER_PORTRAITS.tico;

/** Substitute each `___` with its answer, in order. */
export function fillBlanks(code: string, blanks: string[]): string {
  let index = 0;
  return code.replace(/___/g, () => blanks[index++] ?? "___");
}

/**
 * Does the student's code match the filled template?
 *
 * A structural comparison, not an execution. Until the Pyodide runner lands this is
 * what tells a child whether their blank was right, and it is honest about its limit:
 * it accepts the intended answer and rejects everything else, including a different
 * correct answer. Once the runner is in, the tests decide and this becomes a fast path
 * for the exact-match case only.
 *
 * Whitespace is normalized per line so indentation the editor inserted does not fail a
 * correct answer, but line structure still has to match.
 */
export function matchesFilled(code: string, target: string): boolean {
  const normalize = (source: string) =>
    source
      .split("\n")
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter((line) => line.length > 0)
      .join("\n");
  return normalize(code) === normalize(target);
}
