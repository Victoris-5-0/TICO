import type { Metadata } from "next";
import { Inter, Caveat } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChallengeMapView } from "@/components/mission-ui/challenge-map-view";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { isLocale } from "@/i18n/config";
import { buildChallengeMap } from "@/services/challenge-map.service";
import styles from "@/components/mission-ui/challenge-map.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-mission", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-map-title", display: "swap" });

export const metadata: Metadata = { title: "Challenge map", robots: { index: false, follow: false } };

type Search = Promise<{ done?: string }>;

/**
 * Every world's challenge map, end to end.
 *
 * Was a design preview fed from the static `content/worlds` list, with every node marked
 * available and a dialog that said so. It now reads the real tracks, lessons and the
 * signed-in student's progress through `buildChallengeMap`, and a node launches its
 * lesson. A single world's map is the same data, filtered — see the world page.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Search }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === "ar-EG";
  const { done } = await searchParams;

  const user = await getCurrentUser();
  const { stages, pending, unlocked } = await buildChallengeMap({ userId: user?.id, ar, done });

  return (
    <div className={`${styles.page} ${inter.variable} ${caveat.variable}`}>
      <a className="skip-link" href="#challenge-map">{ar ? "انتقل للخريطة" : "Skip to map"}</a>
      {/* The site's own header, not a second one. This page used to paint its own dark
          bar with its own nav, so walking onto the map changed the furniture. */}
      <SiteHeader locale={locale} compact />
      <main id="challenge-map">
        <div className={styles.mapIntro}>
          <h1>{ar ? "خريطة التحديات" : "Challenge map"}</h1>
          <p>{ar ? "اختار مهمة وابدأ" : "Pick a mission and begin"}</p>
          <Link href={`/${locale}/learn`}>{ar ? "خريطة التعلّم" : "Learning map"}</Link>
        </div>
        <ChallengeMapView locale={locale} stages={stages} unlocked={unlocked} pending={pending} />
      </main>
    </div>
  );
}
