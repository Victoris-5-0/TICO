import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound, redirect } from "next/navigation";

import { MarketingHeader } from "@/components/marketing-chrome";
import { ChaptersMap } from "@/components/mission-ui/chapters-map";
import styles from "@/components/mission-ui/chapters-map.module.css";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getCurrentUser } from "@/lib/auth";
import { buildChaptersMap } from "@/services/chapters-map.service";

const inter = Inter({ subsets: ["latin"], variable: "--font-landing", display: "swap" });

export const metadata: Metadata = { title: "Select your world" };

/**
 * "Select your world" — Figma node 23:52.
 *
 * Four chapter islands down one painted sky. Which is open comes from the student's own
 * progress, and joining one walks into that chapter's worlds map.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const chapters = await buildChaptersMap({ userId: user.id, locale });

  return (
    <div className={`${styles.page} ${inter.variable}`}>
      <a className="skip-link" href="#world-map">{getDictionary(locale).skip}</a>
      <div className={styles.sky} aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>
      <MarketingHeader
        locale={locale}
        currentPage="learn"
        user={{ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, xp: user.xp, streak: user.streak }}
      />
      <main id="world-map" className={styles.main}>
        <ChaptersMap locale={locale} chapters={chapters} />
      </main>
    </div>
  );
}
