import Image from "next/image";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { TicoFloat } from "@/components/motion/tico-float";
import { SiteHeader } from "@/components/site-header";
import type { World } from "@/content/worlds";
import type { Locale } from "@/i18n/config";

const bakeryCast = [
  { id: "hassan", name: { "ar-EG": "عم حسن", en: "Hassan" }, role: { "ar-EG": "صاحب الفرن", en: "Bakery owner" }, size: [685, 1330] },
  { id: "salma", name: { "ar-EG": "سلمى", en: "Salma" }, role: { "ar-EG": "منظّمة الطابور", en: "Queue coordinator" }, size: [516, 1336] },
  { id: "mariam", name: { "ar-EG": "مريم", en: "Mariam" }, role: { "ar-EG": "زبونة الفرن", en: "Bakery customer" }, size: [547, 1285] },
] as const;

export function WorldOverview({ locale, world }: { locale: Locale; world: World }) {
  const isArabic = locale === "ar-EG";
  const isBakery = world.slug === "el-forn";

  return (
    <div className={`world-page world-page--${world.accent}`}>
      <SiteHeader locale={locale} compact />
      <main>
        <section className="world-hero">
          <Image src={world.image} alt={world.imageAlt[locale]} fill priority sizes="100vw" />
          <div className="world-hero__veil" />
          <div className="world-hero__content shell">
            <Link className="back-link back-link--light" href={`/${locale}/learn`}>{isArabic ? "→" : "←"} {isArabic ? "خريطة التعلّم" : "Learning map"}</Link>
            <p className="eyebrow">{world.number} · {world.kicker[locale]}</p>
            <h1>{world.title[locale]}</h1>
            <p>{world.description[locale]}</p>
            <div className="world-hero__facts"><span>{world.missions.length} {isArabic ? "مهمات" : "missions"}</span><span>{world.concepts[locale]}</span></div>
          </div>
          <TicoFloat className="world-hero__tico" pose={isBakery ? "determined" : "thinking"} alt="" priority />
        </section>

        <section className="world-details shell">
          <div className="mission-list-block">
            <p className="eyebrow">{isArabic ? "المسار" : "THE PATH"}</p>
            <h2>{isArabic ? "مهمات العالم" : "World missions"}</h2>
            <ol className="mission-list">
              {world.missions.map((mission, index) => (
                <li key={mission.en} className={index === 0 ? "mission-list__active" : ""}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><b>{mission[locale]}</b><small>{index === 0 ? (isArabic ? "جاهزة للبدء" : "Ready to begin") : (isArabic ? "بتتفتح بالترتيب" : "Unlocks in order")}</small></div>
                  <i aria-hidden="true">{index === 0 ? "▶" : "◇"}</i>
                </li>
              ))}
            </ol>
            {isBakery ? (
              <Link className="button button--primary button--large" href={`/${locale}/worlds/${world.slug}/missions/opening-message`}>
                {isArabic ? "ابدأ المهمة الأولى" : "Start mission one"}
              </Link>
            ) : (
              <button className="button button--primary button--large" type="button" disabled>{isArabic ? "قريبًا" : "Coming soon"}</button>
            )}
          </div>

          <aside className="world-note">
            <p className="eyebrow">{isArabic ? "هتتعلّم" : "YOU’LL LEARN"}</p>
            <h2>{isArabic ? "بايثون بيحل مشكلة حقيقية" : "Python solves a real problem"}</h2>
            <p>{isArabic ? "كل مهمة بتوصّل الكود بنتيجة واضحة جوّه المكان. جرّب براحتك؛ المحاولات والتلميحات من غير عقاب." : "Every mission connects code to a visible result in the world. Try freely—attempts and hints never carry a penalty."}</p>
            <code dir="ltr">print(&quot;Yalla, Python!&quot;)</code>
          </aside>
        </section>

        {isBakery && (
          <section className="cast-section" id="cast">
            <div className="shell">
              <Reveal className="section-heading section-heading--center"><p className="eyebrow">{isArabic ? "أهل الفرن" : "MEET THE BAKERY"}</p><h2>{isArabic ? "شخصيات هتقابلها" : "Characters you’ll meet"}</h2></Reveal>
              <div className="cast-grid">
                {bakeryCast.map((character, index) => <Reveal className="cast-card" key={character.id} delay={index * 0.08}><div><Image src={`/assets/characters/bakery/${character.id}-v1.webp`} alt={character.name[locale]} width={character.size[0]} height={character.size[1]} /></div><h3>{character.name[locale]}</h3><p>{character.role[locale]}</p></Reveal>)}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
