"use client";

import { memo, useId } from "react";
import { asset } from "@/lib/bakery/scene-manifest";

// Arabic belongs to the physical shop in both locales; the accessible scene label
// explains it in the learner's language. Keep lettering out of the raster masters.
export const NeighborhoodDetails = memo(function NeighborhoodDetails() {
  return <g data-layer="neighborhood-details" aria-hidden="true">
    <g lang="ar" direction="rtl" textAnchor="middle" style={{ fontFamily: "var(--font-arabic), Tahoma, sans-serif" }}>
      <text x={455} y={70} fontSize={30} fontWeight={700} fill="#FFF0CB" stroke="#514E36" strokeWidth={.6} paintOrder="stroke" data-sign="bakery">فرن الحارة</text>
      <text x={455} y={94} fontSize={14} fontWeight={500} fill="#F6D899">عيش بلدي</text>
      <g transform="translate(776 378) rotate(-4)">
        <path d="M-57 0 L-4 -28 L57 0" fill="none" stroke="#8B6C44" strokeWidth={2} />
        <rect x={-68} y={-2} width={136} height={60} rx={3} fill="#BEA579" opacity={.25} transform="translate(3 4)" />
        <path d="M-68 0 L67 -2 L70 57 L-67 59 Z" fill="#EFE0B7" stroke="#AF8956" strokeWidth={2} />
        <text x={0} y={37} fontSize={22} fontWeight={600} fill="#526A5F">صباح الخير</text>
      </g>
    </g>
    <g data-prop="radio">
      <path d="M550 450 L557 464 M632 450 L625 464" stroke="#493720" strokeWidth={4} />
      <rect x={542} y={444} width={98} height={7} rx={1} fill="#61472D" />
      <path d="M542 444 H640" stroke="#B58B55" strokeWidth={3} />
      <image href={asset("radio")} x={548} y={363} width={90} height={81} preserveAspectRatio="xMidYMax meet" />
    </g>
    <image href={asset("flour-sack")} x={385} y={604} width={67} height={86} preserveAspectRatio="xMidYMax meet" />
  </g>;
});

export function OvenFire({ elapsed, baking, reducedMotion }: { elapsed: number; baking: boolean; reducedMotion: boolean }) {
  const id = useId();
  const fireFrame = reducedMotion || !baking ? 0 : Math.floor(elapsed / 170) % 4;
  const shimmer = reducedMotion || !baking ? 0 : Math.sin(elapsed / 210) * .035 + Math.sin(elapsed / 93) * .02;
  return <g data-layer="oven-fire" data-fire-frame={fireFrame} aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-light`}>
        <stop stopColor="#FFC265" stopOpacity={.7} />
        <stop offset=".55" stopColor="#EF761D" stopOpacity={.3} />
        <stop offset="1" stopColor="#D85A12" stopOpacity={0} />
      </radialGradient>
      <clipPath id={`${id}-mouth`}>
        <path d="M247 566 V516 Q247 481 297 466 Q348 482 348 516 V566 Z" />
      </clipPath>
    </defs>
    <ellipse cx={297} cy={521} rx={72} ry={66} fill={`url(#${id}-light)`} opacity={(baking ? .8 : .4) + shimmer} />
    <g clipPath={`url(#${id}-mouth)`}>
      <svg x={237} y={444} width={120} height={120} viewBox={`${fireFrame % 2 * 256} ${Math.floor(fireFrame / 2) * 256} 256 256`} overflow="hidden" opacity={baking ? .96 : .68}>
        <image href={asset("oven-fire")} width={512} height={512} />
      </svg>
    </g>
  </g>;
}
