import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarketingHeader } from "@/components/marketing-chrome";
import { WorldOverview, type WorldLesson } from "@/components/world-overview";
import { worlds } from "@/content/worlds";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/config";
import { buildChallengeMap } from "@/services/challenge-map.service";

type Params = Promise<{ locale: string; worldSlug: string }>;
type Search = Promise<{ error?: string; done?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, worldSlug } = await params;
  if (!isLocale(locale)) return {};
  const world = worlds.find((item) => item.slug === worldSlug);
  return world ? { title: world.title[locale], description: world.description[locale] } : {};
}

/**
 * A world, and the missions a student can actually start inside it.
 *
 * The art, copy and cast come from `content/worlds`.
 * Entering a world lands on its challenge path and mission checklist.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale, worldSlug } = await params;
  if (!isLocale(locale)) notFound();

  const world = worlds.find((item) => item.slug === worldSlug);
  if (!world) notFound();

  const { error, done } = await searchParams;
  const user = await getCurrentUser();

  const rows = await db.lesson.findMany({
    where: { track: { slug: worldSlug } },
    orderBy: { order: "asc" },
    select: { id: true, slug: true, title: true },
  });

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

  const { stages, unlocked } = await buildChallengeMap({
    userId: user?.id,
    ar: locale === "ar-EG",
    trackSlug: worldSlug,
    done,
  });

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
        map={stages[0] ?? null}
        unlocked={unlocked}
        error={error}
      />
    </div>
  );
}
