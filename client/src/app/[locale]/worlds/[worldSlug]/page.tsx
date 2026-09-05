import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorldOverview } from "@/components/world-overview";
import { worlds } from "@/content/worlds";
import { isLocale, locales } from "@/i18n/config";

export function generateStaticParams() {
  return locales.flatMap((locale) => worlds.map((world) => ({ locale, worldSlug: world.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; worldSlug: string }> }): Promise<Metadata> {
  const { locale, worldSlug } = await params;
  if (!isLocale(locale)) return {};
  const world = worlds.find((item) => item.slug === worldSlug);
  return world ? { title: world.title[locale], description: world.description[locale] } : {};
}

export default async function Page({ params }: { params: Promise<{ locale: string; worldSlug: string }> }) {
  const { locale, worldSlug } = await params;
  if (!isLocale(locale)) notFound();
  const world = worlds.find((item) => item.slug === worldSlug);
  if (!world) notFound();
  return <WorldOverview locale={locale} world={world} />;
}
