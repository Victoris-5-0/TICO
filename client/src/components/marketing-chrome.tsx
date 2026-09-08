import Image from "next/image";
import Link from "next/link";
import { LandingHeader } from "@/components/landing-header";
import { Interactive } from "@/components/motion/interactive";
import { KineticButton } from "@/components/motion/hero-motion";
import { worlds } from "@/content/worlds";
import { alternateLocale, type Locale } from "@/i18n/config";
import { landingCopy } from "@/i18n/landing";
import styles from "./landing-page.module.css";

export function MarketingHeader({ locale, currentPage = "home" }: { locale: Locale; currentPage?: "home" | "about" | "pricing" }) {
  const copy = landingCopy[locale];
  const alternate = alternateLocale(locale);
  const learnHref = `/${locale}/learn`;
  return (
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
              <Link href={`/${locale}#worlds`}>{copy.challenges}</Link>
            </Interactive>
            <Interactive hoverY={-1} hoverScale={1}>
              <Link href={`/${locale}/pricing`} aria-current={currentPage === "pricing" ? "page" : undefined}>{locale === "en" ? "Pricing" : "الأسعار"}</Link>
            </Interactive>
            <Interactive hoverY={-1} hoverScale={1}>
              <Link href={`/${locale}/about`} aria-current={currentPage === "about" ? "page" : undefined}>{copy.about}</Link>
            </Interactive>
          </nav>
          <div className={styles.headerActions}>
            <Interactive hoverScale={1.06} tapScale={0.95} hoverY={0}>
              <Link className={styles.language} href={`/${alternate}${currentPage === "home" ? "" : `/${currentPage}`}`} lang={alternate} hrefLang={alternate}>{locale === "en" ? "عربي" : "EN"}</Link>
            </Interactive>
            <KineticButton delay={0.08} hoverY={-2} hoverScale={1.04} tapScale={0.95}>
              <Link className={styles.primary} href={`/${locale}/signup`}>{copy.signUp}</Link>
            </KineticButton>
            <KineticButton delay={0.14} hoverY={-2} hoverScale={1.03} tapScale={0.95}>
              <Link className={styles.login} href={`/${locale}/login`}>{copy.login}</Link>
            </KineticButton>
          </div>
        </div>
      </LandingHeader>
  );
}

export function MarketingFooter({ locale }: { locale: Locale }) {
  const copy = landingCopy[locale];
  const alternate = alternateLocale(locale);
  const learnHref = `/${locale}/learn`;
  return (
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
            <Link href={`/${locale}/about`}>{copy.about}</Link>
            <Link href={`/${locale}/pricing`}>{locale === "en" ? "Pricing" : "الأسعار"}</Link>
            <Link href={`/${locale}#questions`}>{copy.helpCenter}</Link>
            <Link href={`/${locale}#contact`}>{copy.contact}</Link>
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
  );
}
