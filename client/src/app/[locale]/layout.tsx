import type { Metadata } from "next";
import { Alexandria, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";

import { MotionProvider } from "@/components/motion/motion-provider";
import { direction, isLocale, locales } from "@/i18n/config";
import "../globals.css";

const alexandria = Alexandria({ subsets: ["arabic", "latin"], variable: "--font-arabic", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code", display: "swap" });

export const metadata: Metadata = {
  title: { default: "TICO — Learn Python through Egypt", template: "%s · TICO" },
  description: "Learn real Python by solving familiar, meaningful problems across contemporary Egypt.",
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html lang={locale} dir={direction(locale)} className={`${alexandria.variable} ${jakarta.variable} ${jetbrains.variable}`}>
      <body><MotionProvider>{children}</MotionProvider></body>
    </html>
  );
}
