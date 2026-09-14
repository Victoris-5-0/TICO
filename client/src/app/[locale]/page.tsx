import { notFound } from "next/navigation";

import { LandingPage } from "@/components/landing-page";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { buildChapterWorlds } from "@/services/chapters-map.service";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await getCurrentUser();
  let mapWorlds;
  try {
    // The landing previews the first chapter's worlds, the ones a new student starts in.
    mapWorlds = (await buildChapterWorlds({ userId: user?.id, locale, chapterSlug: "programming-basics" })).worlds;
  } catch {
    mapWorlds = undefined;
  }

  return (
    <LandingPage
      locale={locale}
      mapWorlds={mapWorlds}
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
