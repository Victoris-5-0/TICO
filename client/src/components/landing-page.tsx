import Image from "next/image";
import Link from "next/link";
import { Inter, Outfit } from "next/font/google";
import { MarketingHeader, MarketingFooter } from "@/components/marketing-chrome";
import { LandingTicoChat } from "@/components/landing-tico-chat";
import { Reveal } from "@/components/motion/reveal";
import { ScrollProgress } from "@/components/motion/scroll-progress";
import { InteractiveTico } from "@/components/motion/interactive-tico";
import { FaqAccordion } from "@/components/motion/faq-accordion";
import { ArrowShift, CompassRotate } from "@/components/motion/interactive";
import {
  HeroArtMotion,
  HeroTextMotion,
  KineticButton,
  KineticBadge,
  KineticWords,
  KineticParagraph,
  HeroFloatingCardMotion,
  LiveBadgeMotion,
  CardMotion,
  StepNumberMotion,
} from "@/components/motion/hero-motion";
import { WorldsMap, type MapWorld } from "@/components/mission-ui/worlds-map";
import { worlds } from "@/content/worlds";
import { type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { landingCopy } from "@/i18n/landing";
import type { HeaderUser } from "@/components/user-profile-menu";
import styles from "./landing-page.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-landing", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-world-title", display: "swap" });

const stepImages = ["step-start", "step-solve", "step-help", "step-progress"];

export function LandingPage({
  locale,
  user,
  mapWorlds,
  chatSessionId = null,
}: {
  locale: Locale;
  user?: HeaderUser | null;
  mapWorlds?: readonly MapWorld[];
  chatSessionId?: string | null;
}) {
  const dict = getDictionary(locale);
  const copy = landingCopy[locale];
  const learnHref = `/${locale}/learn`;
  const arrow = locale === "en" ? "→" : "←";
  const isRtl = locale === "ar-EG";

  const fallbackWorlds: readonly MapWorld[] = [
    {
      slot: 1,
      slug: worlds[0].slug,
      title: worlds[0].title[locale],
      status: "current",
      after: null,
      missionsDone: 0,
      missionsTotal: worlds[0].missions.length,
    },
    {
      slot: 2,
      slug: worlds[1].slug,
      title: worlds[1].title[locale],
      status: "locked",
      after: worlds[0].title[locale],
      missionsDone: 0,
      missionsTotal: worlds[1].missions.length,
    },
    {
      slot: 3,
      slug: worlds[2].slug,
      title: worlds[2].title[locale],
      status: "locked",
      after: worlds[1].title[locale],
      missionsDone: 0,
      missionsTotal: worlds[2].missions.length,
    },
  ];
  const resolvedWorlds = mapWorlds && mapWorlds.length > 0 ? mapWorlds : fallbackWorlds;

  return (
    <div data-landing-page className={`${styles.page} ${inter.variable} ${outfit.variable}`}>
      <ScrollProgress />
      <a className="skip-link" href="#main-content">{dict.skip}</a>
      <MarketingHeader locale={locale} user={user} />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title" data-landing-hero>
          <HeroArtMotion>
            <Image src="/assets/landing/tico/background.webp" alt="" fill sizes="100vw" preload />
          </HeroArtMotion>
          <InteractiveTico locale={locale} />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <HeroTextMotion title={copy.title} subtitle={copy.subtitle} body={copy.body} />
              <div className={styles.actions}>
                <KineticButton delay={0.38} hoverY={-3} hoverScale={1.03} tapScale={0.95}>
                  <Link className={styles.primary} href={learnHref} data-tico-greeting>{copy.start}</Link>
                </KineticButton>
                <KineticButton delay={0.44} hoverY={-2} hoverScale={1.02} tapScale={0.95}>
                  <a className={styles.secondary} href="#method">{copy.how}</a>
                </KineticButton>
              </div>
            </div>
          </div>
          <HeroFloatingCardMotion locale={locale} />
        </section>

        <section id="method" className={`${styles.section} ${styles.method}`} aria-labelledby="method-title">
          <KineticWords
            as="h2"
            id="method-title"
            className={styles.sectionTitle}
            prefix="… "
            text={`${copy.howBefore} TICO ${copy.howAfter}`}
            suffix=" …"
            accentWord="TICO"
          />
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
                      <KineticWords as="h3" text={step.title} delay={0.06} />
                      <KineticParagraph text={step.body} delay={0.12} />
                    </div>
                  </CardMotion>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.preview}`} aria-labelledby="preview-title">
          <KineticWords as="h2" id="preview-title" className={styles.sectionTitle} text={copy.previewTitle} />
          <KineticParagraph className={styles.intro} text={copy.previewBody} delay={0.08} />
          <Reveal delay={0.12}>
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
          <KineticParagraph className={styles.deviceNote} text={copy.deviceNote} delay={0.16} />
          <div className={styles.previewActionWrap}>
            <KineticButton delay={0.2} hoverY={-2} hoverScale={1.03} tapScale={0.96}>
              <Link className={styles.primary} href={`/${locale}/worlds/el-forn/missions/opening-message`}>
                {copy.previewAction} {arrow}
              </Link>
            </KineticButton>
          </div>
        </section>

        <section id="worlds" className={`${styles.section} ${styles.worlds}`} aria-labelledby="worlds-title">
          <KineticWords as="h2" id="worlds-title" className={`${styles.sectionTitle} ${styles.accentTitle}`} text={copy.worldsTitle} accentWord="Challenges" />
          <KineticParagraph className={styles.intro} text={dict.worlds.body} delay={0.08} />
          <Reveal delay={0.12}>
            <div className={styles.mapWrapper}>
              <WorldsMap locale={locale} worlds={resolvedWorlds} />
            </div>
          </Reveal>
        </section>

        <section className={`${styles.section} ${styles.cta}`} aria-labelledby="cta-title">
          <KineticBadge className={styles.tag}>{copy.quest}</KineticBadge>
          <KineticWords as="h2" id="cta-title" className={`${styles.sectionTitle} ${styles.accentTitle}`} text={copy.ctaTitle} delay={0.06} />
          <KineticParagraph className={styles.intro} text={copy.ctaBody} delay={0.12} />
          <div className={styles.actions}>
            <KineticButton inView delay={0.18} hoverY={-3} hoverScale={1.03} tapScale={0.96}>
              <Link className={styles.tealButton} href={learnHref}>{copy.start}</Link>
            </KineticButton>
            <KineticButton inView delay={0.24} hoverY={-3} hoverScale={1.02} tapScale={0.96}>
              <Link className={styles.secondary} href={learnHref}>
                <CompassRotate>
                  <Image className={styles.compass} src="/assets/landing/compass.svg" alt="" width={17} height={17} />
                </CompassRotate>
                {copy.explore}
              </Link>
            </KineticButton>
          </div>
        </section>

        <div className={`${styles.section} ${styles.supportGrid}`}>
          <section id="questions" className={styles.questions} aria-labelledby="questions-title">
            <KineticWords as="h2" id="questions-title" className={styles.sectionTitle} text={copy.questionsTitle} />
            <FaqAccordion faqs={copy.faqs} />
          </section>

          <section id="contact" className={styles.contact} aria-labelledby="contact-title">
            <KineticWords as="p" className={styles.contactEyebrow} text={copy.furtherQuestions} />
            <KineticWords as="h2" id="contact-title" text={copy.contact} delay={0.06} />
            <KineticParagraph text={`${copy.contactIntro} ${copy.helpCenter}.`} delay={0.12} />
            <details className={styles.contactDetails}>
              <summary className={styles.primary}>{copy.contact}</summary>
              <p>{copy.contactPending}</p>
            </details>
          </section>
        </div>
      </main>

      <MarketingFooter locale={locale} />
      <LandingTicoChat locale={locale} sessionId={chatSessionId} signedIn={Boolean(user)} />
    </div>
  );
}


