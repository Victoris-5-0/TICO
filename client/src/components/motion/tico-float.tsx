"use client";

import Image from "next/image";
import { motion } from "motion/react";

type TicoFloatProps = {
  alt: string;
  pose?: "neutral" | "thinking" | "determined" | "celebrating";
  className?: string;
  priority?: boolean;
};

const sizes = {
  neutral: { width: 421, height: 734 },
  thinking: { width: 423, height: 735 },
  determined: { width: 422, height: 735 },
  celebrating: { width: 891, height: 1080 },
} as const;

export function TicoFloat({ alt, pose = "neutral", className, priority = false }: TicoFloatProps) {
  const dimensions = sizes[pose];

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: [0, -8, 0], rotate: [0, 0.8, 0] }}
      transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.5 }, y: { duration: 4.8, repeat: Infinity }, rotate: { duration: 4.8, repeat: Infinity } }}
    >
      <Image
        src={`/assets/characters/tico/tico-${pose}.webp`}
        alt={alt}
        width={dimensions.width}
        height={dimensions.height}
        priority={priority}
      />
    </motion.div>
  );
}
