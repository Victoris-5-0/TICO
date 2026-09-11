import type { Metadata } from "next";
import { Inter, Caveat } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChallengeMapView, type MapStage } from "@/components/mission-ui/challenge-map-view";
import type { ChallengeNode } from "@/components/mission-ui/challenge-map";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isLocale, type Locale } from "@/i18n/config";
import styles from "@/components/mission-ui/challenge-map.module.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-mission", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-map-title", display: "swap" });

export const metadata: Metadata = { title: "Challenge map", robots: { index: false, follow: false } };

/**
 * Where each world's missions sit on its painted map. Authored to the artwork, in the
 * 1440 x 1929 scene the component expects.
 */
const POSITIONS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  bakery: [[521, 141], [720, 488], [708, 842], [459, 1168], [839, 1548]],
  traffic: [[498, 148], [794, 562], [392, 846], [919, 1330], [653, 1653]],
};

/** Only two worlds have map artwork. A third would need its own painted scene. */
const THEMES: Record<string, "bakery" | "traffic"> = {
  "el-forn": "bakery",
  "isharet-cairo": "traffic",
};

type Search = Promise<{ done?: string }>;

/**
 * The challenge map.
 *
 * Was a design preview fed from the static `content/worlds` list, with every node marked
 * available and a dialog that said so. It now reads the real tracks, lessons and the
 * signed-in student's `UserProgress`, and a node launches its lesson.
 *
 * Status follows the same rule as the world page: finished lessons stay open because
 * `docs/02` is explicit that a skipped or completed lesson remains replayable, the first
 * unfinished one is where they are, and the rest wait their turn.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Search }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const ar = locale === "ar-EG";
  const { done } = await searchParams;

  const user = await getCurrentUser();

  const tracks = await db.track.findMany({
    orderBy: { order: "asc" },
    include: { lessons: { orderBy: { order: "asc" }, select: { id: true, slug: true, title: true } } },
  });

  const completed = user
    ? new Set(
        (
          await db.userProgress.findMany({
            where: { userId: user.id, completed: true },
            select: { lessonId: true },
          })
        ).map((row) => row.lessonId),
      )
    : new Set<string>();

  const stages: MapStage[] = [];
  let unlocked: { nodeId: string; label: string } | null = null;

  for (const track of tracks) {
    const theme = THEMES[track.slug];
    if (!theme || !track.lessons.length) continue;

    // The first unfinished lesson is where the student is; everything after it waits.
    const currentIndex = track.lessons.findIndex((lesson) => !completed.has(lesson.id));
    const positions = POSITIONS[theme];

    const nodes: ChallengeNode[] = track.lessons.slice(0, positions.length).map((lesson, index) => {
      const [x, y] = positions[index];
      const status: ChallengeNode["status"] =
        completed.has(lesson.id) ? "completed"
        : index === currentIndex ? "current"
        : "locked";
      return { id: `${track.slug}-${lesson.slug}`, label: lesson.title, x, y, status };
    });

    // Arriving from a finished mission: the lesson after it is what just opened up.
    //
    // Announced only when that lesson is genuinely reachable now. `?done=` is a hint in a
    // URL — anyone can type it, and a student who quit a mission early would otherwise be
    // congratulated on unlocking something still locked behind them.
    if (done) {
      const finished = track.lessons.findIndex((lesson) => lesson.slug === done);
      const next = finished >= 0 ? track.lessons[finished + 1] : undefined;
      const reachable = next && nodes.find((node) => node.id === `${track.slug}-${next.slug}`)?.status === "current";
      if (next && reachable) unlocked = { nodeId: `${track.slug}-${next.slug}`, label: next.title };
    }

    stages.push({
      id: track.slug,
      worldSlug: track.slug,
      title: track.title,
      stageLabel: ar ? `المرحلة ${stages.length + 1}` : `Stage 0${stages.length + 1}`,
      theme,
      nodes,
      slugs: Object.fromEntries(track.lessons.map((lesson) => [`${track.slug}-${lesson.slug}`, lesson.slug])),
      companion: stages.length === 0
        ? { x: 491, y: 1528, message: ar ? "مين عايز يبدأ؟" : "Who's starting?" }
        : { x: 734, y: 346 },
    });
  }

  const pending = tracks.find((track) => !THEMES[track.slug] && track.lessons.length)?.title ?? null;

  return (
    <div className={`${styles.page} ${inter.variable} ${caveat.variable}`}>
      <a className="skip-link" href="#challenge-map">{ar ? "انتقل للخريطة" : "Skip to map"}</a>
      <Header locale={locale} ar={ar} />
      <main id="challenge-map">
        <div className={styles.previewNotice}>
          <h1>{ar ? "خريطة التحديات" : "Challenge map"}</h1>
          <p>{ar ? "اختار مهمة وابدأ" : "Pick a mission and begin"}</p>
          <Link href={`/${locale}/learn`}>{ar ? "خريطة التعلّم" : "Learning map"}</Link>
        </div>
        <ChallengeMapView locale={locale} stages={stages} unlocked={unlocked} pending={pending} />
      </main>
    </div>
  );
}

function Header({ locale, ar }: { locale: Locale; ar: boolean }) {
  return (
    <header className={styles.header}>
      <Link href={`/${locale}`} aria-label={ar ? "تيكو — الرئيسية" : "TICO — Home"}>
        <Image className={styles.logo} src="/assets/landing/logo-light.svg" alt="TICO" width={147} height={52} />
      </Link>
      <nav aria-label={ar ? "التنقل الرئيسي" : "Main navigation"}>
        <Link href={`/${locale}`}>{ar ? "الرئيسية" : "Home"}</Link>
        <Link href={`/${locale}/challenges`} aria-current="page">{ar ? "التحديات" : "Challenges"}</Link>
        <Link href={`/${locale}/about`}>{ar ? "عن تيكو" : "About"}</Link>
      </nav>
      <Link href={`/${ar ? "en" : "ar-EG"}/challenges`} lang={ar ? "en" : "ar"}>{ar ? "English" : "العربية"}</Link>
    </header>
  );
}
