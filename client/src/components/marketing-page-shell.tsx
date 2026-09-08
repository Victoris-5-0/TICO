import { Inter } from "next/font/google";
import { MarketingFooter, MarketingHeader } from "@/components/marketing-chrome";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import shared from "./landing-page.module.css";
import styles from "./marketing-pages.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-landing", display: "swap" });

export function MarketingPageShell({ locale, page, children }: {
  locale: Locale; page: "about" | "pricing"; children: React.ReactNode;
}) {
  return <div data-landing-page className={`${shared.page} ${styles.page} ${inter.variable}`}>
    <a className="skip-link" href="#main-content">{getDictionary(locale).skip}</a>
    <MarketingHeader locale={locale} currentPage={page} />
    <main id="main-content" className={styles.main}>{children}</main>
    <MarketingFooter locale={locale} />
  </div>;
}
