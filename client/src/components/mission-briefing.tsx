import Image from "next/image";
import Link from "next/link";

import type { Locale } from "@/i18n/config";

/**
 * The page around a bakery script — the logo, the close button, the title.
 *
 * Shared by the opening tour and by mission one so they are visibly the same place. The
 * script itself is passed in as children; this only owns the chrome.
 */
export function MissionBriefing({
  locale,
  label,
  eyebrow,
  title,
  blurb,
  children,
}: {
  locale: Locale;
  label: { ar: string; en: string };
  eyebrow: { ar: string; en: string };
  title: { ar: string; en: string };
  blurb: { ar: string; en: string };
  children: React.ReactNode;
}) {
  const ar = locale === "ar-EG";
  const pick = (copy: { ar: string; en: string }) => (ar ? copy.ar : copy.en);

  return (
    <div className="briefing-page">
      <header className="briefing-header shell">
        <Link className="site-logo" href={`/${locale}`} aria-label="TICO home">
          <Image src="/assets/landing/logo.svg" alt="TICO" width={200} height={70} priority />
        </Link>
        <span className="briefing-preview-label">{pick(label)}</span>
        <Link className="briefing-close" href={`/${locale}/worlds/el-forn`} aria-label={ar ? "إغلاق المهمة" : "Close mission"}>×</Link>
      </header>

      <main className="briefing-main shell">
        <header className="briefing-title">
          <div><p className="eyebrow">{pick(eyebrow)}</p><h1>{pick(title)}</h1></div>
          <p>{pick(blurb)}</p>
        </header>
        {children}
      </main>
    </div>
  );
}
