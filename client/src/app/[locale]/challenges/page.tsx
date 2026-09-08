import type { Metadata } from "next";
import { Inter, Caveat } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengeMapPreview } from "@/components/mission-ui/challenge-map-preview";
import { isLocale } from "@/i18n/config";
import styles from "@/components/mission-ui/challenge-map.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-mission", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-map-title", display: "swap" });
export const metadata: Metadata = { title: "Challenge map", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === "ar-EG";
  return <div className={`${styles.page} ${inter.variable} ${caveat.variable}`}>
    <a className="skip-link" href="#challenge-map">{ar ? "انتقل للخريطة" : "Skip to map"}</a>
    <header className={styles.header}>
      <Link href={`/${locale}`} aria-label={ar ? "تيكو — الرئيسية" : "TICO — Home"}><Image className={styles.logo} src="/assets/landing/logo-light.svg" alt="TICO" width={147} height={52} /></Link>
      <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}><Link href={`/${locale}`}>{ar ? "الرئيسية" : "Home"}</Link><Link href={`/${locale}/challenges`} aria-current="page">{ar ? "التحديات" : "Challenges"}</Link><Link href={`/${locale}/about`}>{ar ? "عن تيكو" : "About"}</Link></nav>
      <Link href={`/${ar ? "en" : "ar-EG"}/challenges`} lang={ar ? "en" : "ar"}>{ar ? "English" : "العربية"}</Link>
      <Link href={`/${locale}/login`}>{ar ? "دخول" : "Log in"}</Link>
    </header>
    <main id="challenge-map"><div className={styles.previewNotice}><h1>{ar ? "خريطة التحديات" : "Challenge map"}</h1><p>{ar ? "معاينة التصميم · اختار مهمة لاستكشافها" : "Design preview · Select a mission to explore"}</p><Link href={`/${locale}/components-preview`}>{ar ? "مكونات المهمة" : "Mission components"}</Link></div><ChallengeMapPreview locale={locale} /></main>
  </div>;
}
