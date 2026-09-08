import Image from "next/image";
import Link from "next/link";
import { Inter, Outfit } from "next/font/google";
import { LandingHeader } from "@/components/landing-header";
import { Reveal } from "@/components/motion/reveal";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { FaqAccordion } from "@/components/motion/faq-accordion";
import { Interactive, CompassRotate, ArrowShift } from "@/components/motion/interactive";
import {
  HeroArtMotion,
  HeroFloatingCardMotion,
  LiveBadgeMotion,
  CardMotion,
  StepNumberMotion,
} from "@/components/motion/hero-motion";
import { worlds } from "@/content/worlds";
import { alternateLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { landingCopy } from "@/i18n/landing";
import styles from "./landing-page.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-landing", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-world-title", display: "swap" });

const stepImages = ["step-start", "step-solve", "step-help", "step-progress"];

export function LandingPage({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const copy = landingCopy[locale];
  const alternate = alternateLocale(locale);
  const learnHref = `/${locale}/learn`;
  const arrow = locale === "en" ? "→" : "←";
  const isRtl = locale === "ar-EG";

  return (
    <div data-landing-page className={`${styles.page} ${inter.variable} ${outfit.variable}`}>
      <ScrollProgress />
      <a className="skip-link" href="#main-content">{dict.skip}</a>
      <LandingHeader>
        <div className={styles.headerInner}>
          <Link href={`/${locale}`} aria-label={copy.home} className={styles.logo}>
            <Interactive hoverScale={1.04} tapScale={0.96} hoverY={0}>
              <Image src="/assets/landing/logo.svg" width={200} height={70} alt="TICO" preload />
            </Interactive>
          </Link>
          <nav className={styles.nav} aria-label={copy.navigation}>
            <Interactive hoverY={-1} hoverScale={1}>
              <Link href={learnHref}>{copy.play}</Link>
            </Interactive>
            <Interactive hoverY={-1} hoverScale={1}>
              <a href="#worlds">{copy.challenges}</a>
            </Interactive>
            <Interactive hoverY={-1} hoverScale={1}>
              <a href="#method">{copy.about}</a>
            </Interactive>
          </nav>
          <div className={styles.headerActions}>
            <Interactive hoverScale={1.06} tapScale={0.95} hoverY={0}>
              <Link className={styles.language} href={`/${alternate}`} lang={alternate} hrefLang={alternate}>{locale === "en" ? "عربي" : "EN"}</Link>
            </Interactive>
            <Interactive hoverY={-2} hoverScale={1.02} tapScale={0.98}>
              <Link className={styles.primary} href={`/${locale}/signup`}>{copy.signUp}</Link>
            </Interactive>
            <Interactive hoverY={-2} hoverScale={1.02} tapScale={0.98}>
              <Link className={styles.login} href={`/${locale}/login`}>{copy.login}</Link>
            </Interactive>
          </div>
        </div>
      </LandingHeader>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <HeroArtMotion>
            <Image src="/assets/landing/hero.png" alt="" fill sizes="100vw" preload />
          </HeroArtMotion>
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title">
                {copy.title[0]}<br />
                {copy.title[1]}<br />
                {copy.title[2]}{" "}
                <span>TICO</span>
              </h1>
              <p className={styles.subtitle}>{copy.subtitle}</p>
              <p className={styles.heroBody}>{copy.body}</p>
              <div className={styles.actions}>
                <Interactive hoverY={-3} hoverScale={1.02} tapScale={0.98}>
                  <Link className={styles.primary} href={learnHref}>{copy.start}</Link>
                </Interactive>
                <Interactive hoverY={-2} hoverScale={1.01} tapScale={0.98}>
                  <a className={styles.secondary} href="#method">{copy.how}</a>
                </Interactive>
              </div>
            </div>
          </div>
          <HeroFloatingCardMotion locale={locale} />
        </section>

        <section id="method" className={`${styles.section} ${styles.method}`} aria-labelledby="method-title">
          <Reveal>
            <h2 id="method-title" className={styles.sectionTitle}>
              <span aria-hidden="true">… </span>{copy.howBefore}{" "}<span>TICO</span>{" "}{copy.howAfter}<span aria-hidden="true"> …</span>
            </h2>
          </Reveal>
          <ol className={styles.steps}>
            {copy.steps.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 0.08}>
                  <CardMotion hoverY={-8}>
                    <div className={styles.step}>
                      <div className={styles.stepArt}>
                        <Image src={`/assets/landing/${stepImages[index]}.png`} alt="" fill sizes="(max-width: 550px) 80vw, (max-width: 1100px) 300px, 245px" />
                        <StepNumberMotion isRtl={isRtl}>
                          {new Intl.NumberFormat(locale).format(index + 1)}
                        </StepNumberMotion>
                      </div>
                      <h3>{step.title}</h3>
                      <p>{step.body}</p>
                    </div>
                  </CardMotion>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.preview}`} aria-labelledby="preview-title">
          <Reveal>
            <h2 id="preview-title" className={styles.sectionTitle}>{copy.previewTitle}</h2>
            <p className={styles.intro}>{copy.previewBody}</p>
          </Reveal>
          <Reveal delay={0.1}>
            <CardMotion hoverY={-6}>
              <Link className={styles.previewLink} href={`/${locale}/worlds/el-forn/missions/opening-message`}>
                <LiveBadgeMotion label={isRtl ? "معاينة المهمة الأولى" : "Live Mission Preview"} />
                <Image src="/assets/worlds/bakery/establishing-v1.webp" alt={worlds[0].imageAlt[locale]} fill sizes="(max-width: 1280px) 90vw, 1240px" />
                <span className={styles.previewCaption}>
                  {copy.previewAction}
                  <ArrowShift isRtl={isRtl}>{arrow}</ArrowShift>
                </span>
              </Link>
            </CardMotion>
          </Reveal>
          <p className={styles.deviceNote}>{copy.deviceNote}</p>
        </section>

        <section id="worlds" className={`${styles.section} ${styles.worlds}`} aria-labelledby="worlds-title">
          <Reveal>
            <h2 id="worlds-title" className={`${styles.sectionTitle} ${styles.accentTitle}`}>{copy.worldsTitle}</h2>
            <p className={styles.intro}>{dict.worlds.body}</p>
          </Reveal>
          <div className={styles.worldGrid}>
            {worlds.map((world, index) => (
              <Reveal key={world.slug} delay={index * 0.08}>
                <CardMotion hoverY={-8}>
                  <Link className={styles.worldCard} href={`/${locale}/worlds/${world.slug}`}>
                    <div className={styles.worldArt}>
                      <Image src={world.image.replace(".webp", "-card.webp")} alt={world.imageAlt[locale]} fill sizes="(max-width: 900px) 90vw, 400px" />
                      <span className={styles.worldBadge}>{`${copy.world} ${world.number}`}</span>
                      <span className={styles.missionBadge}>{`${new Intl.NumberFormat(locale).format(world.missions.length)} ${dict.worlds.missions}`}</span>
                    </div>
                    <div className={styles.worldBody}>
                      <p className={styles.kicker}>{world.kicker[locale]}</p>
                      <h3>{world.title[locale]}</h3>
                      <p>{world.description[locale]}</p>
                      <span className={styles.worldAction}>
                        {dict.worlds.enter}
                        <ArrowShift isRtl={isRtl}>{arrow}</ArrowShift>
                      </span>
                    </div>
                  </Link>
                </CardMotion>
              </Reveal>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.cta}`} aria-labelledby="cta-title">
          <Reveal>
            <p className={styles.tag}>{copy.quest}</p>
            <h2 id="cta-title" className={`${styles.sectionTitle} ${styles.accentTitle}`}>{copy.ctaTitle}</h2>
            <p className={styles.intro}>{copy.ctaBody}</p>
            <div className={styles.actions}>
              <Interactive hoverY={-3} hoverScale={1.03} tapScale={0.98}>
                <Link className={styles.tealButton} href={learnHref}>{copy.start}</Link>
              </Interactive>
              <Interactive hoverY={-3} hoverScale={1.02} tapScale={0.98}>
                <Link className={styles.secondary} href={learnHref}>
                  <CompassRotate>
                    <Image className={styles.compass} src="/assets/landing/compass.svg" alt="" width={17} height={17} />
                  </CompassRotate>
                  {copy.explore}
                </Link>
              </Interactive>
            </div>
          </Reveal>
        </section>

        <div className={`${styles.section} ${styles.supportGrid}`}>
          <section id="questions" className={styles.questions} aria-labelledby="questions-title">
            <Reveal>
              <h2 id="questions-title" className={styles.sectionTitle}>{copy.questionsTitle}</h2>
            </Reveal>
            <FaqAccordion faqs={copy.faqs} />
          </section>

          <section id="contact" className={styles.contact} aria-labelledby="contact-title">
            <Reveal delay={0.1}>
              <p className={styles.contactEyebrow}>{copy.furtherQuestions}</p>
              <h2 id="contact-title">{copy.contact}</h2>
              <p>{copy.contactIntro}{" "}<a href="#questions">{copy.helpCenter}</a>.</p>
              <details className={styles.contactDetails}>
                <summary className={styles.primary}>{copy.contact}</summary>
                <p>{copy.contactPending}</p>
              </details>
            </Reveal>
          </section>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerAbout}>
            <Link href={`/${locale}`} aria-label={copy.home} className={styles.footerLogo}>
              <Interactive hoverScale={1.04} tapScale={0.96} hoverY={0}>
                <Image src="/assets/landing/logo-light.svg" alt="TICO" width={174} height={61} />
              </Interactive>
            </Link>
            <p>{copy.footerBody}</p>
          </div>
          <nav aria-label={copy.about}>
            <h2>TICO</h2>
            <a href="#method">{copy.about}</a>
            <a href="#questions">{copy.helpCenter}</a>
            <a href="#contact">{copy.contact}</a>
            <Link href={`/${alternate}`} lang={alternate}>{locale === "en" ? "العربية" : "English"}</Link>
          </nav>
          <nav aria-label={copy.challenges}>
            <h2>{copy.challenges}</h2>
            {worlds.map((world) => <Link key={world.slug} href={`/${locale}/worlds/${world.slug}`}>{world.title[locale]}</Link>)}
          </nav>
          <div className={styles.footerBrands}>
            <h2>{copy.social}</h2>
            <div className={styles.socialIcons}>
              {["facebook", "linkedin", "instagram"].map((name) => (
                <Interactive key={name} hoverY={-3} hoverScale={1.12} tapScale={0.95}>
                  <span className={styles.socialIcon} title={`${name} — ${copy.comingSoon}`}>
                    <Image src={`/assets/landing/${name}.svg`} alt={name} width={name === "instagram" ? 24 : 32} height={name === "instagram" ? 24 : 32} />
                  </span>
                </Interactive>
              ))}
            </div>
            <h2>{copy.payments}</h2>
            <div className={styles.paymentIcons}>
              {["mastercard", "instapay", "visa", "paypal"].map((name) => (
                <Interactive key={name} hoverY={-2} hoverScale={1.1} tapScale={0.95}>
                  <span>
                    <Image src={`/assets/landing/${name}.svg`} alt={name} width={32} height={name === "visa" ? 28 : 32} />
                  </span>
                </Interactive>
              ))}
            </div>
          </div>
          <nav aria-label={copy.play}>
            <h2>{copy.play}</h2>
            <Link href={learnHref}>{copy.explore}</Link>
            <Link href={`/${locale}/worlds/el-forn/missions/opening-message`}>{copy.previewAction}</Link>
            <p>© 2026 TICO</p>
          </nav>
        </div>
      </footer>
    </div>
  );
}


