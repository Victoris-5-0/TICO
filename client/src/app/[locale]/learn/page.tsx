import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LearningMap } from "@/components/learning-map";
import { isLocale } from "@/i18n/config";

export const metadata: Metadata = { title: "Learning map" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LearningMap locale={locale} />;
}
