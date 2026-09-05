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
        <div className="briefing-progress" aria-label={isArabic ? "المهمة ١ من ٦" : "Mission 1 of 6"}><span /><i /><i /><i /><i /><i /></div>
        <Link className="briefing-close" href={`/${locale}/worlds/el-forn`} aria-label={isArabic ? "إغلاق المهمة" : "Close mission"}>×</Link>
      </header>

      <main className="briefing-main shell">
        <header className="briefing-title">
          <div><p className="eyebrow">{isArabic ? "العالم ٠١ · المهمة ٠١" : "WORLD 01 · MISSION 01"}</p><h1>{isArabic ? "طابور الفرن" : "The Bakery Queue"}</h1></div>
          <p>{isArabic ? "حرّك نور للمكان الصح، وبعدها ضيفه للطابور باستخدام أوامر بايثون." : "Move Nour to the right place, then add him to the queue with Python commands."}</p>
        </header>
        <BakeryWorldDemo locale={locale} />
      </main>
    </div>
  );
}
