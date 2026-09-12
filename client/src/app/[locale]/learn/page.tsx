import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MarketingHeader } from "@/components/marketing-chrome";
import { WorldsMap } from "@/components/mission-ui/worlds-map";
import styles from "@/components/mission-ui/worlds-map.module.css";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getCurrentUser } from "@/lib/auth";
import { buildWorldsMap } from "@/services/worlds-map.service";

export const metadata: Metadata = { title: "World map" };

/**
 * The world map — Figma node 10:50.
 *
 * Six painted clearings on one long scroll, three of them worlds with missions in them
 * and three waiting to be drawn. Which are open comes from the student's own progress,
 * and an open island walks into that world's challenge map.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const dict = getDictionary(locale);
  const worlds = await buildWorldsMap({ userId: user.id, locale });

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#world-map">{locale === "ar-EG" ? "انتقل للخريطة" : "Skip to the map"}</a>
      <MarketingHeader
        locale={locale}
        currentPage="learn"
        user={{ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, xp: user.xp, streak: user.streak }}
      />
      <main id="world-map" className={styles.canvas}>
        {/* Figma puts nothing between the header and the map, and the islands carry their
            own names. The page still needs a heading for anyone not looking at it. */}
        <h1 className="sr-only">{dict.roadmap.title}</h1>
        <WorldsMap locale={locale} worlds={worlds} />
      </main>
    </div>
  );
}
