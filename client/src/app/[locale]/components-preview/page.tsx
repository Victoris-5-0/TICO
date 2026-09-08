import type { Metadata } from "next";
import { Inter, Caveat } from "next/font/google";
import { notFound } from "next/navigation";
import { ComponentPreview } from "@/components/mission-ui/component-preview";
import { isLocale } from "@/i18n/config";
const inter = Inter({ subsets: ["latin"], variable: "--font-mission", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-map-title", display: "swap" });
export const metadata: Metadata = { title: "Mission component preview", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <div className={`${inter.variable} ${caveat.variable}`}><ComponentPreview locale={locale} /></div>;
}
