"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { ChallengeMapView, type MapStage } from "@/components/mission-ui/challenge-map-view";
import { LessonLoadingOverlay } from "@/components/mission-generating/lesson-loading-overlay";
import type { World } from "@/content/worlds";
import type { Locale } from "@/i18n/config";

import styles from "./world-overview.module.css";

const bakeryCast = [
  { id: "hassan", name: { "ar-EG": "عم حسن", en: "Hassan" }, role: { "ar-EG": "صاحب الفرن", en: "Bakery owner" }, size: [685, 1330] },
  { id: "salma", name: { "ar-EG": "سلمى", en: "Salma" }, role: { "ar-EG": "منظّمة الطابور", en: "Queue coordinator" }, size: [516, 1336] },
  { id: "mariam", name: { "ar-EG": "مريم", en: "Mariam" }, role: { "ar-EG": "زبونة الفرن", en: "Bakery customer" }, size: [547, 1285] },
] as const;

const trafficCast = [
  { id: "officer", name: { "ar-EG": "الضابط كريم", en: "Officer Karim" }, role: { "ar-EG": "منظّم التقاطع", en: "Intersection officer" }, src: "/assets/traffic-v2/frames/officer-idle.webp" },
  { id: "naser", name: { "ar-EG": "ناصر", en: "Naser" }, role: { "ar-EG": "سائق التاكسي", en: "Taxi driver" }, src: "/assets/traffic-v2/characters/naser.png" },
  { id: "nadia", name: { "ar-EG": "مدام نادية", en: "Ms Nadia" }, role: { "ar-EG": "من أهل الشارع", en: "Neighborhood resident" }, src: "/assets/traffic-v2/characters/nadia.png" },
] as const;

export type WorldLesson = {
  id: string;
  slug: string;
  title: string;
  completed: boolean;
};

export function WorldOverview({
  locale,
  world,
  lessons,
  map,
  unlocked,
  error,
  initialLoadingLesson,
  initialLivePreview = false,
}: {
  locale: Locale;
  world: World;
  lessons: readonly WorldLesson[];
  map?: MapStage | null;
  unlocked?: { nodeId: string; label: string } | null;
  error?: string;
  initialLoadingLesson?: WorldLesson | null;
  initialLivePreview?: boolean;
}) {
  const router = useRouter();
  const [loadingLesson, setLoadingLesson] = useState<WorldLesson | null>(
    initialLoadingLesson ?? null,
  );
  const [livePreview, setLivePreview] = useState(initialLivePreview);
  const isArabic = locale === "ar-EG";
  const isBakery = world.slug === "el-forn";
  const isTraffic = world.slug === "isharet-cairo";
  const reduced = useReducedMotion();

  const nextLesson = lessons.find((lesson) => !lesson.completed) ?? lessons[0];
  const pedestrianLesson = lessons.find((lesson) => lesson.slug === "pedestrian-crossing");
  const nextLessonIndex = nextLesson ? lessons.findIndex((lesson) => lesson.id === nextLesson.id) : -1;
  const nextMissionName = nextLesson && nextLessonIndex >= 0
    ? world.missions[nextLessonIndex]?.[locale] ?? nextLesson.title
    : null;
  const completedCount = lessons.filter((l) => l.completed).length;
  const startedAny = completedCount > 0;
  const allCompleted = lessons.length > 0 && completedCount === lessons.length;

  const arabicDigits = (val: number) => String(val).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

  const errorNote = error ? (
    <p className={styles.errorBanner} role="status">
      {error === "no-mission"
        ? isArabic
          ? "مفيش مهمة جاهزة دلوقتي. جرّب تاني بعد شوية."
          : "No mission is ready right now. Please try again shortly."
        : isArabic
          ? "المهمة دي مش موجودة."
          : "That lesson does not exist."}
    </p>
  ) : null;

  return (
    <div className={styles.page}>
      <main className={styles.wrapper}>
        {/* Top Hero Banner */}
        <section className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <Link className={styles.backLink} href={`/${locale}/learn`}>
              {isArabic ? "→ خريطة العوالم" : "← World Map"}
            </Link>

            <div className={styles.heroMetaRow}>
              <span className={styles.chapterPill}>
                {isArabic ? `الفصل ${world.number}` : `Chapter ${world.number}`}
              </span>
              <span className={styles.kicker}>{world.kicker[locale]}</span>
            </div>

            <h1 className={styles.heroTitle}>{world.title[locale]}</h1>
            <p className={styles.heroDesc}>{world.description[locale]}</p>

            <div className={styles.heroStats}>
              <span className={styles.statPill}>
                📚 {isArabic ? `${arabicDigits(lessons.length || world.missions.length)} مهمات` : `${lessons.length || world.missions.length} Missions`}
              </span>
              <span className={styles.statPill}>
                💡 {world.concepts[locale]}
              </span>
              <span className={`${styles.statPill} ${allCompleted ? styles.statPillActive : ""}`}>
                🏆 {isArabic
                  ? `${arabicDigits(completedCount)} من ${arabicDigits(lessons.length || world.missions.length)} مكتملة`
                  : `${completedCount} of ${lessons.length || world.missions.length} Completed`}
              </span>
            </div>

            {errorNote}

            <div className={styles.heroActions}>
              {nextLesson ? (
                <Link
                  className={styles.primaryBtn}
                  href={`/${locale}/worlds/${world.slug}/play/${nextLesson.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setLivePreview(false);
                    setLoadingLesson(nextLesson);
                  }}
                >
                  {allCompleted
                    ? isArabic
                      ? "إعادة استكشاف العالم"
                      : "Review World Missions"
                    : startedAny
                      ? isArabic
                        ? `كمّل: ${nextMissionName}`
                        : `Continue: ${nextMissionName}`
                      : isArabic
                        ? "ابدأ المهمة الأولى"
                        : "Start Mission 1"}
                  <span aria-hidden="true">{isArabic ? "←" : "→"}</span>
                </Link>
              ) : (
                <button className={`${styles.primaryBtn} ${styles.disabledBtn}`} type="button" disabled>
                  {isArabic ? "قريبًا" : "Coming soon"}
                </button>
              )}
              {isTraffic && pedestrianLesson && (
                <Link
                  className={styles.previewBtn}
                  href={`/${locale}/worlds/isharet-cairo/play/${pedestrianLesson.slug}?live=1`}
                  onClick={(event) => {
                    event.preventDefault();
                    setLivePreview(true);
                    setLoadingLesson(pedestrianLesson);
                  }}
                >
                  {isArabic ? "جرّب مهمة مباشرة (تجريبية)" : "Generate a live beta mission"}
                </Link>
              )}
            </div>
          </div>

          <div className={styles.heroRight}>
            <motion.div
              className={styles.ticoMascot}
              animate={reduced ? undefined : { y: [0, -8, 0] }}
              transition={
                reduced
                  ? undefined
                  : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }
              }
            >
              <Image
                src="/assets/worlds-map/tico.png"
                alt="TICO"
                width={320}
                height={345}
                priority
              />
            </motion.div>
            <div className={`${styles.ticoSpeech} ${isTraffic ? styles.ticoSpeechBeta : ""}`}>
              {isTraffic
                ? isArabic
                  ? "أنا تيكو! عالم إشارة القاهرة لسه نسخة تجريبية وبنكمل تطويره. جرّب المهمات وقولنا رأيك."
                  : "I'm TICO! Isharet Cairo is still in beta and under development. Try the missions and tell us what you think."
                : allCompleted
                ? isArabic
                  ? "أحسنت يا بطل! أتممت كل المهمات! 🎉"
                  : "Great job! All missions completed! 🎉"
                : startedAny
                  ? isArabic
                    ? "يلا نكمل التحدي مع بعض! 🚀"
                    : "Let's continue the challenge! 🚀"
                  : isArabic
                    ? isTraffic ? "جاهز تنظّم التقاطع بالكود؟ 🚦" : "جاهز لرحلة بايثون في الفرن؟ 🥐"
                    : isTraffic ? "Ready to control the intersection with code? 🚦" : "Ready for your Python mission? 🥐"}
            </div>
          </div>
        </section>

        {/* Challenge Map Section */}
        {map && (
          <section className={styles.mapCard}>
            <div className={styles.mapContainer}>
              <ChallengeMapView
                locale={locale}
                stages={[map]}
                unlocked={unlocked}
                bannerTitle={isArabic ? "خريطة التحديات" : "Challenge Map"}
                onSelectLesson={(slug) => {
                  const lesson = lessons.find((l) => l.slug === slug);
                  if (!lesson) return;
                  setLivePreview(false);
                  setLoadingLesson(lesson);
                }}
              />
            </div>
          </section>
        )}

        {(isBakery || isTraffic) && (
          <section className={styles.castSection} id="cast">
            <div className={styles.castHeader}>
              <p className={styles.chapterPill}>
                {isArabic ? (isTraffic ? "شخصيات التقاطع" : "شخصيات الفرن") : "MEET THE CHARACTERS"}
              </p>
              <h2 className={styles.castTitle}>
                {isArabic ? (isTraffic ? "أهل الشارع اللي هتقابلهم" : "أهل الفرن اللي هتقابلهم") : "Characters You'll Meet"}
              </h2>
            </div>
            <div className={styles.castGrid}>
              {(isTraffic ? trafficCast : bakeryCast.map((character) => ({
                ...character,
                src: `/assets/characters/bakery/${character.id}-v1.webp`,
              }))).map((character) => (
                <div className={styles.castCard} key={character.id}>
                  <div className={styles.castAvatar}>
                    <Image
                      src={character.src}
                      alt={character.name[locale]}
                      fill
                      sizes="90px"
                    />
                  </div>
                  <h3 className={styles.castName}>{character.name[locale]}</h3>
                  <p className={styles.castRole}>{character.role[locale]}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Python Learning Note */}
        <aside className={styles.noteCard}>
          <div className={styles.noteLeft}>
            <p className={styles.noteEyebrow}>
              {isArabic ? "فلسفة التعلّم" : "LEARNING PHILOSOPHY"}
            </p>
            <h2 className={styles.noteHeading}>
              {isArabic ? "بايثون لحل مشكلات واقعية" : "Python for Real Problem Solving"}
            </h2>
            <p className={styles.noteBody}>
              {isArabic
                ? isTraffic
                  ? "كل سطر كود بتكتبه بيغيّر التقاطع قدامك: الإشارة تفتح، والعربيات تتحرك واحدة واحدة، والطابور يكبر من غير ما نكرر الكود. جرّب وعدّل وشوف النتيجة بأمان."
                  : "كل سطر كود بتكتبه بيأثر مباشرة في عالم الفرن: تنظيم الطوابير، حساب الخبز، وتوزيع الطلبات. جرب بحرية تامة وبدون أي قلق من الخطأ."
                : isTraffic
                  ? "Every line of code changes the intersection in front of you: the signal turns green, cars move one at a time, and the queue can grow without duplicating code."
                  : "Every line of Python you write directly affects the bakery: managing queues, counting bread trays, and serving orders fairly. Experiment freely without penalty."}
            </p>
          </div>
          <div className={styles.noteCode} dir="ltr">
            {isTraffic
              ? `# Give every car its turn\ncars = ["taxi", "bus", "tuktuk"]\nfor car in cars:\n    print("Go:", car)`
              : `# Bakery Queue Helper\norders = [3, 5, 2, 4]\ntotal_bread = sum(orders)\nprint(f"Total needed: {total_bread}")`}
          </div>
        </aside>
      </main>

      {loadingLesson && (
        <LessonLoadingOverlay
          locale={locale}
          worldSlug={world.slug}
          worldTitle={world.title[locale]}
          lessonSlug={loadingLesson.slug}
          lessonTitle={loadingLesson.title}
          livePreview={livePreview}
          onCancel={() => {
            setLoadingLesson(null);
            setLivePreview(false);
            if (typeof window !== "undefined" && window.location.pathname.includes("/play/")) {
              router.push(`/${locale}/worlds/${world.slug}`);
            }
          }}
        />
      )}
    </div>
  );
}
