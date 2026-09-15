import { notFound } from "next/navigation";

import { LandingPage } from "@/components/landing-page";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildChaptersMap } from "@/services/chapters-map.service";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await getCurrentUser();
  const chatSession = user ? await db.practiceSession.findFirst({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  }).catch(() => null) : null;
  let mapChapters;
  try {
    mapChapters = await buildChaptersMap({ userId: user?.id, locale });
  } catch {
    mapChapters = undefined;
  }

  return (
    <LandingPage
      locale={locale}
      mapChapters={mapChapters}
      chatSessionId={chatSession?.id ?? null}
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
  );
}
