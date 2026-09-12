import { notFound } from "next/navigation";

import { LandingPage } from "@/components/landing-page";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { buildWorldsMap } from "@/services/worlds-map.service";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const user = await getCurrentUser();
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
