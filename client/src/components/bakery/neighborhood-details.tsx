"use client";

import { memo, useId } from "react";
import { asset, fixtures } from "@/lib/bakery/scene-manifest";

// Arabic belongs to the physical shop in both locales; the accessible scene label
// explains it in the learner's language. Keep lettering out of the raster masters.
export const NeighborhoodDetails = memo(function NeighborhoodDetails() {
  return <g data-layer="neighborhood-details" aria-hidden="true">
    <g lang="ar" direction="rtl" textAnchor="middle" style={{ fontFamily: "var(--font-arabic), Tahoma, sans-serif" }}>
      {/* On the painted plaque above the arch. */}
      <text x={455} y={60} fontSize={28} fontWeight={700} fill="#FFF0CB" stroke="#514E36" strokeWidth={.6} paintOrder="stroke" data-sign="bakery">فرن الحارة</text>
      <text x={455} y={84} fontSize={13} fontWeight={500} fill="#F6D899">عيش بلدي</text>
      {/* Hung on the back wall, off to the right where nobody stands and no bubble lands. */}
      <g transform="translate(1291 332) rotate(-4) scale(.78)">
        <path d="M-57 0 L-4 -28 L57 0" fill="none" stroke="#8B6C44" strokeWidth={2} />
        <rect x={-68} y={-2} width={136} height={60} rx={3} fill="#BEA579" opacity={.25} transform="translate(3 4)" />
        <path d="M-68 0 L67 -2 L70 57 L-67 59 Z" fill="#EFE0B7" stroke="#AF8956" strokeWidth={2} />
        <text x={0} y={37} fontSize={22} fontWeight={600} fill="#526A5F">صباح الخير</text>
      </g>
    </g>
    {/* The radio on its bracket, on the back wall between the counter and the crates. */}
    <g data-prop="radio" transform="translate(520 30) scale(.82)">
      <path d="M550 450 L557 464 M632 450 L625 464" stroke="#493720" strokeWidth={4} />
      <rect x={542} y={444} width={98} height={7} rx={1} fill="#61472D" />
      <path d="M542 444 H640" stroke="#B58B55" strokeWidth={3} />
      <image href={asset("radio")} x={548} y={363} width={90} height={81} preserveAspectRatio="xMidYMax meet" />
    </g>
  </g>;
});

/**
 * The fire in the oven's mouth, positioned from the oven's rectangle.
 *
 * The mouth, the glow and the animated flame sheet were all measured against the 2026-09-07
 * painting as bare numbers. They are fractions of the oven's rectangle now, taken from those
 * same measurements, so moving or resizing the oven in `fixtures` carries the fire with it —
 * which is what the 2026-09-13 background change needed and what the old literals could not
 * survive.
 */
const MOUTH = { left: .2308, right: .7487, mid: .4872, floor: .6272, shoulder: .4827, spring: .3815, crown: .3382, haunch: .3844 };
const GLOW = { y: .4971, rx: .3692, ry: .1908 };
const SHEET = { x: .1795, y: .2746, size: .6154 };

export function OvenFire({ elapsed, baking, reducedMotion }: { elapsed: number; baking: boolean; reducedMotion: boolean }) {
  const id = useId();
  const o = fixtures.oven;
  const fx = (f: number) => o.x + f * o.width;
  const fy = (f: number) => o.y + f * o.height;
  const fireFrame = reducedMotion || !baking ? 0 : Math.floor(elapsed / 170) % 4;
  const shimmer = reducedMotion || !baking ? 0 : Math.sin(elapsed / 210) * .035 + Math.sin(elapsed / 93) * .02;
  const sheet = SHEET.size * o.width;
  return <g data-layer="oven-fire" data-fire-frame={fireFrame} aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-light`}>
        <stop stopColor="#FFC265" stopOpacity={.7} />
        <stop offset=".55" stopColor="#EF761D" stopOpacity={.3} />
        <stop offset="1" stopColor="#D85A12" stopOpacity={0} />
      </radialGradient>
      <clipPath id={`${id}-mouth`}>
        <path d={`M${fx(MOUTH.left)} ${fy(MOUTH.floor)} V${fy(MOUTH.shoulder)} Q${fx(MOUTH.left)} ${fy(MOUTH.spring)} ${fx(MOUTH.mid)} ${fy(MOUTH.crown)} Q${fx(MOUTH.right)} ${fy(MOUTH.haunch)} ${fx(MOUTH.right)} ${fy(MOUTH.shoulder)} V${fy(MOUTH.floor)} Z`} />
      </clipPath>
    </defs>
    <ellipse cx={fx(MOUTH.mid)} cy={fy(GLOW.y)} rx={GLOW.rx * o.width} ry={GLOW.ry * o.height} fill={`url(#${id}-light)`} opacity={(baking ? .8 : .4) + shimmer} />
    <g clipPath={`url(#${id}-mouth)`}>
      <svg x={fx(SHEET.x)} y={fy(SHEET.y)} width={sheet} height={sheet} viewBox={`${fireFrame % 2 * 256} ${Math.floor(fireFrame / 2) * 256} 256 256`} overflow="hidden" opacity={baking ? .96 : .68}>
        <image href={asset("oven-fire")} width={512} height={512} />
      </svg>
    </g>
  </g>;
}
