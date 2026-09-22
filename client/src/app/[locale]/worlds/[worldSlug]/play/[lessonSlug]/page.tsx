import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MarketingHeader } from "@/components/marketing-chrome";
import { WorldOverview, type WorldLesson } from "@/components/world-overview";
import { worlds } from "@/content/worlds";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildChallengeMap } from "@/services/challenge-map.service";

type Params = Promise<{ locale: string; worldSlug: string; lessonSlug: string }>;
type Search = Promise<{ preview?: string; live?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, worldSlug } = await params;
  if (!isLocale(locale)) return {};

  const world = worlds.find((w) => w.slug === worldSlug);
  const worldName = world ? world.title[locale] : worldSlug;
  const isAr = locale === "ar-EG";

  return {
    title: isAr
      ? `جاري توليد الدرس بالذكاء الاصطناعي... · ${worldName} | تيكو`
      : `Generating Lesson by AI... · ${worldName} | TICO`,
    robots: { index: false, follow: false },
  };
}

/**
 * Simple, clean loading overlay with blurred background.
 *
 * Appears while the model generates the lesson (5-8s waiting time).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { locale, worldSlug, lessonSlug } = await params;
  const { preview, live } = await searchParams;

  if (!isLocale(locale)) notFound();

  const isPreview = preview === "1" || preview === "true";
  const isLivePreview = worldSlug === "isharet-cairo" && (live === "1" || live === "true");
  const world = worlds.find((w) => w.slug === worldSlug);
  if (!world) notFound();

  const returnUrl = `/${locale}/worlds/${worldSlug}`;

  const user = await getCurrentUser();
  if (!user && !isPreview) {
    redirect(`/${locale}/login?redirect=${returnUrl}/play/${lessonSlug}${isLivePreview ? "%3Flive%3D1" : ""}`);
  }

  let rows: Array<{ id: string; slug: string; title: string }> = [];
  try {
    rows = await db.lesson.findMany({
      where: { track: { slug: worldSlug } },
      orderBy: { order: "asc" },
      select: { id: true, slug: true, title: true },
    });
  } catch {
    // Database fallback
  }

  const completed = user
    ? new Set(
        (
          await db.userProgress.findMany({
            where: { userId: user.id, completed: true, lessonId: { in: rows.map((r) => r.id) } },
            select: { lessonId: true },
          })
        ).map((p) => p.lessonId),
      )
    : new Set<string>();

  const lessons: WorldLesson[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    completed: completed.has(row.id),
  }));

  const { stages } = await buildChallengeMap({
    userId: user?.id,
    ar: locale === "ar-EG",
    trackSlug: worldSlug,
  });
  const map = stages.find((stage) => stage.worldSlug === worldSlug) ?? null;

  const currentLesson = lessons.find((l) => l.slug === lessonSlug);

  const fallbackLesson: WorldLesson = {
    id: lessonSlug,
    slug: lessonSlug,
    title: lessonSlug,
    completed: false,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fbf8f3" }}>
      <MarketingHeader
        locale={locale}
        currentPage="learn"
        user={
          user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
                xp: user.xp,
                streak: user.streak,
              }
            : null
        }
      />
      <WorldOverview
        locale={locale}
        world={world}
        lessons={lessons}
        map={map}
        initialLoadingLesson={currentLesson || fallbackLesson}
        initialLivePreview={isLivePreview}
      />
    </div>
  );
}
