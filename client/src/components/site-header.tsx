import Link from "next/link";

import { SiteLogo } from "@/components/site-logo";
import { alternateLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export function SiteHeader({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const dict = getDictionary(locale);
  const alternate = alternateLocale(locale);

  return (
    <header className={`site-header${compact ? " site-header--compact" : ""}`}>
      <div className="site-header__inner shell">
        <SiteLogo href={`/${locale}`} />
        <nav className="site-nav" aria-label={locale === "ar-EG" ? "التنقل الرئيسي" : "Main navigation"}>
          <Link href={`/${locale}#worlds`}>{dict.nav.worlds}</Link>
          <Link href={`/${locale}#method`}>{dict.nav.method}</Link>
        </nav>
        <div className="site-header__actions">
          <Link className="language-switch" href={`/${alternate}`} lang={alternate} hrefLang={alternate}>
            {locale === "ar-EG" ? "EN" : "عربي"}
          </Link>
          <Link className="button button--small" href={`/${locale}/learn`}>
            {locale === "ar-EG" ? "ابدأ الآن" : "Start learning"}
          </Link>
        </div>
      </div>
    </header>
  );
}
