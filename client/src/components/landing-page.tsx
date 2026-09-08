import Image from "next/image";
import Link from "next/link";
import { Inter, Outfit } from "next/font/google";
import { LandingHeader } from "@/components/landing-header";
import { Reveal } from "@/components/motion/reveal";
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

  return (
    <div data-landing-page className={`${styles.page} ${inter.variable} ${outfit.variable}`}>
      <a className="skip-link" href="#main-content">{dict.skip}</a>
      <LandingHeader>
        <div className={styles.headerInner}>
          <Link href={`/${locale}`} aria-label={copy.home} className={styles.logo}>
            <Image src="/assets/landing/logo.png" width={200} height={67} alt="TICO" preload />
          </Link>
          <nav className={styles.nav} aria-label={copy.navigation}>
            <Link href={learnHref}>{copy.play}</Link>
            <a href="#worlds">{copy.challenges}</a>
            <a href="#method">{copy.about}</a>
          </nav>
          <div className={styles.headerActions}>
            <Link className={styles.language} href={`/${alternate}`} lang={alternate} hrefLang={alternate}>{locale === "en" ? "عربي" : "EN"}</Link>
            <Link className={styles.primary} href={`/${locale}/signup`}>{copy.signUp}</Link>
            <Link className={styles.login} href={`/${locale}/login`}>{copy.login}</Link>
          </div>
        </div>
      </LandingHeader>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroArt} aria-hidden="true">
            <Image src="/assets/landing/hero.png" alt="" fill sizes="100vw" preload />
          </div>
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title">{copy.title[0]}<br />{copy.title[1]}<br />{copy.title[2]}{" "}<span>TICO</span></h1>
              <p className={styles.subtitle}>{copy.subtitle}</p>
              <p className={styles.heroBody}>{copy.body}</p>
              <div className={styles.actions}>
                <Link className={styles.primary} href={learnHref}>{copy.start}</Link>
                <a className={styles.secondary} href="#method">{copy.how}</a>
              </div>
            </div>
          </div>
        </section>
        <section id="method" className={`${styles.section} ${styles.method}`} aria-labelledby="method-title">
          <h2 id="method-title" className={styles.sectionTitle}><span aria-hidden="true">… </span>{copy.howBefore}{" "}<span>TICO</span>{" "}{copy.howAfter}<span aria-hidden="true"> …</span></h2>
          <ol className={styles.steps}>
            {copy.steps.map((step, index) => (
              <li key={step.title}>
                <Reveal className={styles.step} delay={index * 0.06}>
                  <div className={styles.stepArt}>
                    <Image src={`/assets/landing/${stepImages[index]}.png`} alt="" fill sizes="(max-width: 550px) 80vw, (max-width: 1100px) 300px, 245px" />
                    <span className={styles.stepNumber}>{new Intl.NumberFormat(locale).format(index + 1)}</span>
                  </div>
                  <h3>{step.title}</h3><p>{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>
        <section className={`${styles.section} ${styles.preview}`} aria-labelledby="preview-title">
          <h2 id="preview-title" className={styles.sectionTitle}>{copy.previewTitle}</h2>
          <p className={styles.intro}>{copy.previewBody}</p>
          <Link className={styles.previewLink} href={`/${locale}/worlds/el-forn/missions/opening-message`}>
            <Image src="/assets/worlds/bakery/establishing-v1.webp" alt={worlds[0].imageAlt[locale]} fill sizes="(max-width: 1280px) 90vw, 1240px" />
            <span className={styles.previewCaption}>{copy.previewAction}<span aria-hidden="true">{arrow}</span></span>
          </Link>
          <p className={styles.deviceNote}>{copy.deviceNote}</p>
        </section>
        <section id="worlds" className={`${styles.section} ${styles.worlds}`} aria-labelledby="worlds-title">
          <h2 id="worlds-title" className={`${styles.sectionTitle} ${styles.accentTitle}`}>{copy.worldsTitle}</h2>
          <p className={styles.intro}>{dict.worlds.body}</p>
          <div className={styles.worldGrid}>
            {worlds.map((world, index) => (
              <Reveal key={world.slug} delay={index * 0.06}>
                <Link className={styles.worldCard} href={`/${locale}/worlds/${world.slug}`}>
                  <div className={styles.worldArt}>
                    <Image src={world.image.replace(".webp", "-card.webp")} alt={world.imageAlt[locale]} fill sizes="(max-width: 900px) 90vw, 400px" />
                    <span className={styles.worldBadge}>{`${copy.world} ${world.number}`}</span>
                    <span className={styles.missionBadge}>{`${new Intl.NumberFormat(locale).format(world.missions.length)} ${dict.worlds.missions}`}</span>
                  </div>
                  <div className={styles.worldBody}>
                    <p className={styles.kicker}>{world.kicker[locale]}</p><h3>{world.title[locale]}</h3>
                    <p>{world.description[locale]}</p>
                    <span className={styles.worldAction}>{dict.worlds.enter}<span aria-hidden="true">{arrow}</span></span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
        <section className={`${styles.section} ${styles.cta}`} aria-labelledby="cta-title">
          <p className={styles.tag}>{copy.quest}</p>
          <h2 id="cta-title" className={`${styles.sectionTitle} ${styles.accentTitle}`}>{copy.ctaTitle}</h2>
          <p className={styles.intro}>{copy.ctaBody}</p>
          <div className={styles.actions}>
            <Link className={styles.tealButton} href={learnHref}>{copy.start}</Link>
            <Link className={styles.secondary} href={learnHref}><Image className={styles.compass} src="/assets/landing/compass.svg" alt="" width={17} height={17} />{copy.explore}</Link>
          </div>
        </section>
        <div className={`${styles.section} ${styles.supportGrid}`}>
        <section id="questions" className={styles.questions} aria-labelledby="questions-title">
          <h2 id="questions-title" className={styles.sectionTitle}>{copy.questionsTitle}</h2>
          <div className={styles.faqs}>
            {copy.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p></details>)}
          </div>
        </section>
        <section id="contact" className={styles.contact} aria-labelledby="contact-title">
          <p className={styles.contactEyebrow}>{copy.furtherQuestions}</p>
          <h2 id="contact-title">{copy.contact}</h2>
          <p>{copy.contactIntro}{" "}<a href="#questions">{copy.helpCenter}</a>.</p>
          <details className={styles.contactDetails}>
            <summary className={styles.primary}>{copy.contact}</summary>
            <p>{copy.contactPending}</p>
          </details>
        </section>
        </div>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerAbout}>
            <Link href={`/${locale}`} aria-label={copy.home} className={styles.footerLogo}><Image src="/assets/landing/logo-light.png" alt="TICO" width={174} height={58} /></Link>
            <p>{copy.footerBody}</p>
          </div>
          <nav aria-label={copy.about}>
            <h2>TICO</h2><a href="#method">{copy.about}</a><a href="#questions">{copy.helpCenter}</a><a href="#contact">{copy.contact}</a>
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
                <span key={name} className={styles.socialIcon} title={`${name} — ${copy.comingSoon}`}>
                  <Image src={`/assets/landing/${name}.svg`} alt={name} width={name === "instagram" ? 24 : 32} height={name === "instagram" ? 24 : 32} />
                </span>
              ))}
            </div>
            <h2>{copy.payments}</h2>
            <div className={styles.paymentIcons}>
              {["mastercard", "instapay", "visa", "paypal"].map((name) => (
                <span key={name}><Image src={`/assets/landing/${name}.svg`} alt={name} width={32} height={name === "visa" ? 28 : 32} /></span>
              ))}
            </div>
          </div>
          <nav aria-label={copy.play}>
            <h2>{copy.play}</h2><Link href={learnHref}>{copy.explore}</Link>
            <Link href={`/${locale}/worlds/el-forn/missions/opening-message`}>{copy.previewAction}</Link><p>© 2026 TICO</p>
          </nav>
        </div>
      </footer>
    </div>
  );
}
