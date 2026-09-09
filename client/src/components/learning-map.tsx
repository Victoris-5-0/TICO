import Image from "next/image";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { TicoFloat } from "@/components/motion/tico-float";
import { MarketingHeader } from "@/components/marketing-chrome";
import type { HeaderUser } from "@/components/user-profile-menu";
import { worlds } from "@/content/worlds";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export function LearningMap({
  locale,
  user,
}: {
  locale: Locale;
  user?: HeaderUser | null;
}) {
  const dict = getDictionary(locale);
  const isArabic = locale === "ar-EG";

  return (
    <div className="map-page">
      <MarketingHeader locale={locale} currentPage="learn" user={user} />
      <main className="shell map-main">
        <header className="map-hero">
          <div>
            <Link className="back-link" href={`/${locale}`}>{isArabic ? "→" : "←"} {dict.roadmap.back}</Link>
            <p className="eyebrow">{dict.roadmap.eyebrow}</p>
            <h1>{dict.roadmap.title}</h1>
            <p>{dict.roadmap.body}</p>
          </div>
          <div className="progress-chip"><span>{dict.roadmap.progress}</span><i><b /></i></div>
        </header>

        <section className="journey" aria-label={dict.roadmap.title}>
          <div className="journey__line" aria-hidden="true" />
          {worlds.map((world, index) => {
            const isOpen = index === 0;
            return (
              <Reveal className={`journey-stop${isOpen ? " journey-stop--open" : ""}`} key={world.slug}>
                <span className="journey-stop__pin" aria-hidden="true">{isOpen ? "▶" : "◇"}</span>
                <div className="journey-stop__scene">
                  <Image src={world.image.replace(".webp", "-card.webp")} alt={world.imageAlt[locale]} fill sizes="(max-width: 760px) 100vw, 45vw" />
                </div>
                <div className="journey-stop__content">
                  <div className="journey-stop__top"><span>{world.number}</span><b>{isOpen ? dict.roadmap.current : dict.roadmap.locked}</b></div>
                  <p>{world.kicker[locale]}</p><h2>{world.title[locale]}</h2><p>{world.description[locale]}</p>
                  <ol className="mission-preview">
                    {world.missions.slice(0, 3).map((mission, missionIndex) => <li key={mission.en}><span>{missionIndex + 1}</span>{mission[locale]}</li>)}
                  </ol>
                  {isOpen ? <Link className="button button--primary" href={`/${locale}/worlds/${world.slug}`}>{dict.worlds.enter}</Link> : <span className="locked-label">{isArabic ? "مغلق حاليًا" : "Locked for now"}</span>}
                </div>
              </Reveal>
            );
          })}
          <TicoFloat className="journey__tico" pose="thinking" alt="" />
        </section>
      </main>
    </div>
  );
}
