import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { isLocale } from "@/i18n/config";

type Params = Promise<{ locale: string }>;

export const metadata: Metadata = {
  title: "تجربة مهمة الإشارات المولدة | TICO",
  robots: { index: false },
};

export default async function GeneratedLoopPreview({ params }: { params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  redirect(`/${locale}/worlds/isharet-cairo/play/pedestrian-crossing?live=1`);
}
