import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing-page-shell";
import { PlanAvailability } from "@/components/plan-availability";
import { Reveal } from "@/components/motion/reveal";
import { isLocale } from "@/i18n/config";
import { marketingCopy } from "@/i18n/marketing";
import styles from "@/components/marketing-pages.module.css";

// Figma 2:526 supplies these preview prices; no billing period or checkout is defined.
const previewPrices = [0, 30, 100];
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar-EG" ? "الأسعار" : "Pricing" };
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = marketingCopy[locale];
  return <MarketingPageShell locale={locale} page="pricing">
    <h1 className={styles.srOnly}>{copy.pricingTitle}</h1>
    <p className={styles.previewNotice}>{copy.preview}</p>
    <div className={styles.plans}>
      {copy.plans.map((plan, index) => <Reveal key={plan.name} delay={index * .06} className={styles.planReveal}>
        <article className={`${styles.plan} ${index === 1 ? styles.featuredPlan : ""}`} aria-labelledby={`plan-${index}`}>
          <div className={styles.planHeading}>
            <span className={styles.planNumber}>{new Intl.NumberFormat(locale).format(index + 1)}</span>
            <h2 id={`plan-${index}`}>{plan.name}</h2>
            <bdi className={styles.price}>{previewPrices[index]}$</bdi>
          </div>
          <p className={styles.planSubtitle}>{plan.subtitle}</p>
          <div className={styles.planActionRow}>
            {index === 0 ? <Link className={`${styles.planAction} ${styles.freeAction}`} href={`/${locale}/signup`}>{plan.action}</Link> : <PlanAvailability plan={plan.name} price={`${previewPrices[index]}$`} label={plan.action} variant={index === 1 ? "premium" : "pro"} title={copy.availability} body={copy.availabilityBody} close={copy.close} explore={copy.explore} href={`/${locale}/learn`} />}
          </div>
          <h3 className={styles.featureHeading}>{copy.experience}</h3>
          <ul className={styles.features}>
            {copy.features.map((feature) => <li key={feature}><Image className={styles.check} src="/assets/pricing/check.svg" alt="" width={23} height={24} /><span>{feature}</span></li>)}
          </ul>
          <ul className={`${styles.features} ${styles.unavailable}`}>
            {copy.unavailable.map((feature) => <li key={feature}><Image className={styles.cancel} src="/assets/pricing/unavailable.svg" alt="" width={24} height={24} /><span>{feature}</span></li>)}
          </ul>
        </article>
      </Reveal>)}
    </div>
  </MarketingPageShell>;
}
