import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MarketingPageShell } from "@/components/marketing-page-shell";
import { Reveal } from "@/components/motion/reveal";
import { isLocale } from "@/i18n/config";
import { marketingCopy } from "@/i18n/marketing";
import styles from "@/components/marketing-pages.module.css";

const icons = ["info", "mission", "vision"];
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar-EG" ? "عن تيكو" : "About" };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = marketingCopy[locale];
  return <MarketingPageShell locale={locale} page="about">
    <h1 className={styles.srOnly}>{copy.aboutTitle}</h1>
    <div className={styles.aboutPanels}>
      {copy.about.map((section, index) => <Reveal key={section.title} delay={index * .06}>
        <section className={styles.aboutPanel} aria-labelledby={`about-${index}`}>
          <div className={styles.panelHeading}>
            <span className={`${styles.aboutIcon} ${styles[icons[index]]}`}><Image src={`/assets/about/${icons[index]}.svg`} alt="" width={40} height={40} /></span>
            <h2 id={`about-${index}`}>{section.title}</h2>
          </div>
          <p>{section.body}</p>
        </section>
      </Reveal>)}
    </div>
  </MarketingPageShell>;
}
