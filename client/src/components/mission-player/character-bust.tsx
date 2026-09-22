import { bakeryScene } from "@/lib/bakery/scene-manifest";

import styles from "./mission-player.module.css";

/**
 * The character speaking, standing at the top of the overlay.
 *
 * ## Where the art comes from
 *
 * Only Hassan, Mariam and Salma were ever drawn as standalone portraits, but missions
 * are spoken by any of the eight queue customers — pre-generation rotates the speaker so
 * every mission does not open with Hassan. Falling back to TICO for the other five would
 * put the wrong face next to the line.
 *
 * So this crops frame 0 — the relaxed standing idle — out of the speaker's sprite atlas.
 * Every character already has one, every cell is a 384px square with the figure's feet
 * normalised to the bottom, and the chroma key was removed when the atlas was built, so
 * they are transparent already. No new artwork, and nobody speaks with a stranger's face.
 *
 * The crop is a plain `background-position`: the atlas is laid out in a grid, so showing
 * one cell is a matter of sizing the background to the whole sheet and offsetting it.
 */

/** Characters with a drawn portrait. Anything else comes from its sprite atlas. */
const PORTRAITS: Record<string, { src: string; width: number; height: number }> = {
  tico: { src: "/assets/characters/tico/tico-neutral.webp", width: 421, height: 734 },
  hassan: { src: "/assets/characters/bakery/hassan-v1.webp", width: 685, height: 1330 },
  mariam: { src: "/assets/characters/bakery/mariam-v1.webp", width: 547, height: 1285 },
  salma: { src: "/assets/characters/bakery/salma-v1.webp", width: 516, height: 1336 },
  officer: { src: "/assets/traffic-v2/frames/officer-idle.webp", width: 313, height: 859 },
};

export function CharacterBust({ speaker, alt }: { speaker: string; alt: string }) {
  const portrait = PORTRAITS[speaker];

  if (portrait) {
    return (
      <div className={styles.bust}>
        {/* Not `next/image`: this overflows its container and is sized by aspect ratio,
            which the fill/intrinsic modes both fight. It is one small WebP already. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={portrait.src} alt={alt} width={portrait.width} height={portrait.height} />
      </div>
    );
  }

  const atlas = bakeryScene.actors[speaker as keyof typeof bakeryScene.actors];
  if (!atlas) {
    const tico = PORTRAITS.tico;
    return (
      <div className={styles.bust}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tico.src} alt={alt} width={tico.width} height={tico.height} />
      </div>
    );
  }

  // One cell of the sheet, scaled so the sheet is `columns x rows` times the frame box.
  return (
    <div
      className={`${styles.bust} ${styles.bustAtlas}`}
      role="img"
      aria-label={alt}
      style={{
        backgroundImage: `url(${atlas.src})`,
        backgroundSize: `${atlas.columns * 100}% ${atlas.rows * 100}%`,
        backgroundPosition: "0% 0%",
      }}
    />
  );
}
