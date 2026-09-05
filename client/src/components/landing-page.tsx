import Image from "next/image";
import Link from "next/link";

import { Reveal } from "@/components/motion/reveal";
import { TicoFloat } from "@/components/motion/tico-float";
import { SiteHeader } from "@/components/site-header";
import { SiteLogo } from "@/components/site-logo";
import { worlds } from "@/content/worlds";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export function LandingPage({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const isArabic = locale === "ar-EG";

  return (
    <div className="landing-page">
      <a className="skip-link" href="#main-content">{dict.skip}</a>
      <SiteHeader locale={locale} />

      <main id="main-content">
        <section className="hero shell" aria-labelledby="hero-title">
          <div className="hero__copy">
            <p className="eyebrow"><span aria-hidden="true">●</span>{dict.hero.eyebrow}</p>
            <h1 id="hero-title">
              {dict.hero.titleStart}<br />
              <span>{dict.hero.titleAccent}</span>
            </h1>
            <p className="hero__body">{dict.hero.body}</p>
            <div className="hero__actions">
              <Link className="button button--primary button--large" href={`/${locale}/learn`}>
                {dict.hero.primary}<span aria-hidden="true">{isArabic ? "←" : "→"}</span>
              </Link>
              <Link className="button button--ghost button--large" href="#worlds">{dict.hero.secondary}</Link>
            </div>
            <ul className="proof-list" aria-label={isArabic ? "مميزات TICO" : "TICO highlights"}>
              {dict.proof.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}
            </ul>
          </div>

          <div className="hero-stage" aria-label={isArabic ? "TICO في فرن العيش" : "TICO at the bakery"}>
            <Image
              className="hero-stage__scene"
              src="/assets/worlds/bakery/establishing-v1.webp"
              alt=""
              width={1599}
              height={900}
              priority
            />
            <div className="hero-stage__wash" />
            <TicoFloat
              className="hero-stage__tico"
              pose="neutral"
              alt={isArabic ? "تيكو، روبوت البرمجة الودود" : "Tico, the friendly coding robot"}
              priority
            />
            <div className="code-card" dir="ltr">
              <div className="code-card__top"><span /><span /><span /><b>{dict.hero.codeLabel}</b></div>
              <pre><code><span>loaves</span> = 8<br /><span>trays</span> = 5<br /><em>print</em>(loaves * trays)</code></pre>
              <div className="code-card__result"><b>{dict.hero.output}</b><strong>40</strong></div>
            </div>
            <div className="hero-stage__success"><span aria-hidden="true">✓</span>{dict.hero.success}</div>
          </div>
        </section>

        <section className="worlds-section" id="worlds" aria-labelledby="worlds-title">
          <div className="shell">
            <Reveal className="section-heading">
              <p className="eyebrow">{dict.worlds.eyebrow}</p>
              <h2 id="worlds-title">{dict.worlds.title}</h2>
              <p>{dict.worlds.body}</p>
            </Reveal>
            <div className="world-grid">
              {worlds.map((world, index) => (
                <Reveal key={world.slug} delay={index * 0.08}>
                  <article className={`world-card world-card--${world.accent}`}>
                    <div className="world-card__image">
                      <Image src={world.image.replace(".webp", "-card.webp")} alt={world.imageAlt[locale]} fill sizes="(max-width: 760px) 100vw, 33vw" />
                      <span className="world-card__number">{world.number}</span>
                    </div>
                    <div className="world-card__body">
                      <p>{world.kicker[locale]}</p>
                      <h3>{world.title[locale]}</h3>
                      <p>{world.description[locale]}</p>
                      <div className="world-card__meta"><span>{world.missions.length} {dict.worlds.missions}</span><span>{world.concepts[locale]}</span></div>
                      <Link href={`/${locale}/worlds/${world.slug}`}>{dict.worlds.enter}<span aria-hidden="true">{isArabic ? "←" : "→"}</span></Link>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="method-section shell" id="method" aria-labelledby="method-title">
          <Reveal className="section-heading section-heading--center">
            <p className="eyebrow">{dict.method.eyebrow}</p>
            <h2 id="method-title">{dict.method.title}</h2>
          </Reveal>
          <div className="method-grid">
            {dict.method.steps.map((step, index) => (
              <Reveal className="method-card" key={step.number} delay={index * 0.08}>
                <span>{step.number}</span><h3>{step.title}</h3><p>{step.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="final-cta shell">
          <div>
            <p className="eyebrow">TICO × PYTHON</p>
            <h2>{dict.finalCta.title}</h2>
            <p>{dict.finalCta.body}</p>
            <Link className="button button--ink button--large" href={`/${locale}/learn`}>{dict.finalCta.button}</Link>
          </div>
          <TicoFloat className="final-cta__tico" pose="celebrating" alt="" />
        </section>
      </main>

      <footer className="site-footer"><div className="shell"><SiteLogo href={`/${locale}`} /><p>{dict.footer}</p><span>© 2026 TICO</span></div></footer>
    </div>
  );
}
