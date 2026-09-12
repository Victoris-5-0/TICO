import { NextRequest, NextResponse } from "next/server";

import { getAuthToken, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { missionService } from "@/services/mission.service";

/**
 * Start a lesson: claim a mission for this student and send them to it.
 *
 * A redirect rather than a page, because there is nothing to render — the work is
 * deciding *which* mission is theirs, and the answer is a URL. It also means the mission
 * id ends up in the address bar, so a student who reloads, or comes back tomorrow,
 * returns to the same mission rather than being handed a new one.
 *
 * Claiming happens here and not in the player: opening the player must be idempotent, and
 * a student who bookmarks a mission should not claim another every time they visit.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string; worldSlug: string; lessonSlug: string }> },
) {
  const { locale, worldSlug, lessonSlug } = await params;
  const world = `/${locale}/worlds/${worldSlug}`;

  const user = await getCurrentUser();
  if (!user) {
    const login = new URL(`/${locale}/login`, req.url);
    login.searchParams.set("redirect", `${world}/play/${lessonSlug}`);
    return NextResponse.redirect(login);
  }

  const lesson = await db.lesson.findFirst({
    where: { slug: lessonSlug, track: { slug: worldSlug } },
    select: { id: true },
  });
  if (!lesson) {
    return NextResponse.redirect(new URL(`${world}?error=unknown-lesson`, req.url));
  }

  let token = "";
  try {
    token = await getAuthToken();
  } catch {
    // A missing token only costs the AI-service path; the pre-generated pool still works.
  }

  // The AI service decides what is behind this stop — its prepared mission, or one it
  // generates on the spot when live generation is on. `startForLesson` falls back to the
  // local pool when the service cannot answer.
  const missionId = await missionService.startForLesson({
    userId: user.id,
    worldSlug,
    lessonSlug,
    lessonId: lesson.id,
    token,
  });

  // No mission anywhere: the service is down and the pool is empty. Say so on the world
  // page rather than dropping them into a player with nothing in it.
  if (!missionId) {
    return NextResponse.redirect(new URL(`${world}?error=no-mission`, req.url));
  }

  // The lesson travels in the URL. A pinned mission is shared by every student, so it
  // cannot record which lesson it belongs to — and two bakery lessons teach `variables`,
  // so the concept does not identify one either. Without this the session would open
  // against the wrong lesson and credit the wrong one on completion.
  return NextResponse.redirect(new URL(`${world}/missions/${missionId}?lesson=${lessonSlug}`, req.url));
}
