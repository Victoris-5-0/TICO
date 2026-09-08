"use client";

import { useState } from "react";
import Link from "next/link";
import { worlds } from "@/content/worlds";
import type { Locale } from "@/i18n/config";
import { ChallengeMap, type ChallengeNode, type ChallengeStage } from "./challenge-map";
import { MissionDialog } from "./mission-panels";
import styles from "./preview.module.css";

const positions = {
  bakery: [[521,141],[720,488],[708,842],[459,1168],[839,1548]],
  traffic: [[498,148],[794,562],[392,846],[919,1330],[653,1653]],
};

export function ChallengeMapPreview({ locale }: { locale: Locale }) {
  const ar = locale === "ar-EG";
  const [selected, setSelected] = useState<{ node: ChallengeNode; stage: ChallengeStage } | null>(null);
  const stages: ChallengeStage[] = (["bakery", "traffic"] as const).map((theme, index) => {
    const world = worlds[index === 0 ? 0 : 2];
    return { id: world.slug, title: ar ? (index === 0 ? "الفرن المصري" : "تحديات مرور القاهرة") : (index === 0 ? "Egyptian Bakery" : "Cairo Traffic Problems"), stageLabel: ar ? `المرحلة ${index + 1}` : `Stage 0${index + 1}`, theme,
      nodes: positions[theme].map(([x,y], missionIndex) => ({ id: `${world.slug}-${missionIndex + 1}`, label: world.missions[missionIndex][locale], x, y, status: "available" as const })),
      companion: index === 0 ? { x: 491, y: 1528 } : { x: 734, y: 346, message: ar ? "جاهز للمهمة التالية؟" : "Ready for the next mission?" },
    };
  });
  return <>
    <ChallengeMap locale={locale} stages={stages} onSelect={(node, stage) => setSelected({ node, stage })} />
    <MissionDialog open={selected !== null} onClose={() => setSelected(null)} label={selected?.node.label ?? (ar ? "المهمة" : "Mission")}>
      {selected && <section className={styles.missionDetails}>
        <p>{selected.stage.title}</p><h2>{selected.node.label}</h2>
        <p>{ar ? "دي معاينة لشكل الخريطة. تقدر تفتح صفحة العالم علشان تعرف مهامه المتاحة." : "This is a map preview. Open the world overview to see its available missions."}</p>
        <div className={styles.toolbar}><Link href={`/${locale}/worlds/${selected.stage.id}`}>{ar ? "استكشف العالم" : "Explore world"}</Link><button onClick={() => setSelected(null)}>{ar ? "ارجع للخريطة" : "Back to map"}</button></div>
      </section>}
    </MissionDialog>
  </>;
}
