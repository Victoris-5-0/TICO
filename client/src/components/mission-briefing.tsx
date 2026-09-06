import Link from "next/link";

import { BakeryWorldDemo } from "@/components/bakery-world-demo";
import { SiteLogo } from "@/components/site-logo";
import type { Locale } from "@/i18n/config";

export function MissionBriefing({ locale }: { locale: Locale }) {
  const isArabic = locale === "ar-EG";

  return (
    <div className="briefing-page">
      <header className="briefing-header shell">
        <SiteLogo href={`/${locale}`} />
        <span className="briefing-preview-label">{isArabic ? "معاينة الفرن" : "Bakery preview"}</span>
        <Link className="briefing-close" href={`/${locale}/worlds/el-forn`} aria-label={isArabic ? "إغلاق المهمة" : "Close mission"}>×</Link>
      </header>

      <main className="briefing-main shell">
        <header className="briefing-title">
          <div><p className="eyebrow">{isArabic ? "العالم ٠١ · الفرن" : "WORLD 01 · EL FORN"}</p><h1>{isArabic ? "صباح في الفرن" : "A morning at the bakery"}</h1></div>
          <p>{isArabic ? "اخبز العيش، قدّم للي عليه الدور، وشوف الطابور بيتحرّك." : "Bake the bread, serve your neighbours, and watch the queue come to life."}</p>
        </header>
        <BakeryWorldDemo locale={locale} />
      </main>
    </div>
  );
}
