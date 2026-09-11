import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorldOverview, type WorldLesson } from "@/components/world-overview";
import { worlds } from "@/content/worlds";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/config";

type Params = Promise<{ locale: string; worldSlug: string }>;
type Search = Promise<{ error?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, worldSlug } = await params;
  if (!isLocale(locale)) return {};
  const world = worlds.find((item) => item.slug === worldSlug);
  return world ? { title: world.title[locale], description: world.description[locale] } : {};
}

/**
 * A world, and the lessons a student can actually start inside it.
 *
 * The art, copy and cast still come from `content/worlds`; the path does not. It used to,
 * and it listed six missions for a world with two, above a button that went to the demo
 * route — so nothing on this page could put a student into a real mission.
 *
 * No longer statically generated: the list now depends on who is reading it.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { locale, worldSlug } = await params;
  if (!isLocale(locale)) notFound();

  const world = worlds.find((item) => item.slug === worldSlug);
  if (!world) notFound();

  const { error } = await searchParams;
  const user = await getCurrentUser();

  const rows = await db.lesson.findMany({
    where: { track: { slug: worldSlug } },
    orderBy: { order: "asc" },
    select: { id: true, slug: true, title: true },
  });

  // One query for the whole list rather than one per lesson.
  const done = user
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
    completed: done.has(row.id),
  }));

  return <WorldOverview locale={locale} world={world} lessons={lessons} error={error} />;
}
