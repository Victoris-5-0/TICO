import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MissionBriefing } from "@/components/mission-briefing";
import { isLocale } from "@/i18n/config";

export const metadata: Metadata = { title: "Bakery preview" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <MissionBriefing locale={locale} />;
}
