import { notFound } from "next/navigation";

import { LandingPage } from "@/components/landing-page";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { buildChaptersMap } from "@/services/chapters-map.service";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await getCurrentUser();
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
