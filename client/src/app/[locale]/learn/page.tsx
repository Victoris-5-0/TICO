import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LearningMap } from "@/components/learning-map";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Learning map" };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <LearningMap
      locale={locale}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        xp: user.xp,
        streak: user.streak,
      }}
    />
  );
}
