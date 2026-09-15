import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { MarketingHeader } from "@/components/marketing-chrome";
import { ChapterWorldsMap } from "@/components/mission-ui/chapter-worlds-map";
import styles from "@/components/mission-ui/chapter-worlds-map.module.css";
import { chapters, isChapterSlug } from "@/content/chapters";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getCurrentUser } from "@/lib/auth";
import { buildChapterWorlds } from "@/services/chapters-map.service";

const inter = Inter({ subsets: ["latin"], variable: "--font-landing", display: "swap" });

type Params = Promise<{ locale: string; chapterSlug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, chapterSlug } = await params;
  if (!isLocale(locale) || !isChapterSlug(chapterSlug)) return {};
  const chapter = chapters.find((item) => item.slug === chapterSlug)!;
  return { title: chapter.title[locale] };
}

/**
 * A chapter's worlds — Figma node 23:119.
 *
 * The map inside "Select your world": one island per world in the chapter, TICO on the
 * one to play. Play walks into that world's own mission map at `/worlds/[worldSlug]`.
 */
export default async function Page({ params }: { params: Params }) {
  const { locale, chapterSlug } = await params;
  if (!isLocale(locale) || !isChapterSlug(chapterSlug)) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  const chapter = chapters.find((item) => item.slug === chapterSlug)!;
  const { status, worlds } = await buildChapterWorlds({ userId: user.id, locale, chapterSlug });

  // A shut chapter is shut from its URL too, not only from its island: the map decided
  // this once, and typing the address does not get a second opinion.
  if (status === "locked" || status === "soon") {
    redirect(`/${locale}/learn`);
  }

  const ar = locale === "ar-EG";
  const dict = getDictionary(locale);

  return (
    <div className={`${styles.page} ${inter.variable}`}>
      <a className="skip-link" href="#chapter-map">{dict.skip}</a>
      <div className={styles.sky} aria-hidden="true" />
      {/* The same navigation as the chapters map, so walking into a chapter changes the
          map and nothing else. */}
      <MarketingHeader
        locale={locale}
        currentPage="learn"
        user={{ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, xp: user.xp, streak: user.streak }}
      />
      <main id="chapter-map" className={styles.main}>
        {/* The islands carry the worlds' names; the page still needs a heading for anyone
            not looking at it. */}
        <h1 className="sr-only">{chapter.title[locale]}</h1>
        <div className={styles.backBar}>
          <Link className={styles.back} href={`/${locale}/learn`}>
            <span aria-hidden="true">{ar ? "→" : "←"}</span>
            {ar ? "ارجع للخريطة" : "Back To Map"}
          </Link>
        </div>
        <ChapterWorldsMap locale={locale} title={chapter.title[locale]} worlds={worlds} />
      </main>
    </div>
  );
}
