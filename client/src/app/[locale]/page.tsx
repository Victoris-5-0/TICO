import { notFound } from "next/navigation";

import { LandingPage } from "@/components/landing-page";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildWorldsMap } from "@/services/worlds-map.service";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await getCurrentUser();
  const chatSession = user ? await db.practiceSession.findFirst({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  }).catch(() => null) : null;
  let mapWorlds;
  try {
    mapWorlds = await buildWorldsMap({ userId: user?.id, locale });
  } catch {
    mapWorlds = undefined;
  }

  return (
    <LandingPage
      locale={locale}
      mapWorlds={mapWorlds}
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
