import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BakeryWorldTour } from "@/components/bakery/world-tour";
import { MissionBriefing } from "@/components/mission-briefing";
import { isLocale } from "@/i18n/config";

export const metadata: Metadata = { title: "Bakery tour" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <MissionBriefing
      locale={locale}
      label={{ ar: "جولة في الفرن", en: "Bakery tour" }}
      eyebrow={{ ar: "العالم ٠١ · الفرن", en: "WORLD 01 · EL FORN" }}
      title={{ ar: "اتعرّف على فرن عم حسن", en: "Meet Am Hassan's bakery" }}
      blurb={{
        ar: "من غير أي كود. عم حسن هيوريك كل حاجة بتحصل جوّه الفرن، وإنت بس لف معاه.",
        en: "No code at all. Am Hassan shows you everything that happens inside his bakery — you just walk round with him.",
      }}
    >
      <BakeryWorldTour locale={locale} />
    </MissionBriefing>
  );
}
