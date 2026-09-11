import Image from "next/image";
import Link from "next/link";
import { Caveat, Inter } from "next/font/google";

import { Reveal } from "@/components/motion/reveal";
import { TicoFloat } from "@/components/motion/tico-float";
import { ChallengeMapView, type MapStage } from "@/components/mission-ui/challenge-map-view";
import { SiteHeader } from "@/components/site-header";
import type { World } from "@/content/worlds";
import type { Locale } from "@/i18n/config";

// The map artwork is lettered in these two faces, the same as `/challenges`.
const inter = Inter({ subsets: ["latin"], variable: "--font-mission", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-map-title", display: "swap" });

const bakeryCast = [
  { id: "hassan", name: { "ar-EG": "عم حسن", en: "Hassan" }, role: { "ar-EG": "صاحب الفرن", en: "Bakery owner" }, size: [685, 1330] },
  { id: "salma", name: { "ar-EG": "سلمى", en: "Salma" }, role: { "ar-EG": "منظّمة الطابور", en: "Queue coordinator" }, size: [516, 1336] },
  { id: "mariam", name: { "ar-EG": "مريم", en: "Mariam" }, role: { "ar-EG": "زبونة الفرن", en: "Bakery customer" }, size: [547, 1285] },
] as const;

/** One lesson of this world, as the path list needs it. */
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
}: {
  locale: Locale;
  world: World;
  /**
   * Real lessons, in order, from the database — not the static names in `content/worlds`.
   * Those described six missions for a world that has two, and the page's only CTA went
   * to a demo route rather than to anything a student could be given.
   */
  lessons: readonly WorldLesson[];
  /**
   * This world's painted map. The numbered list below is the fallback for a world whose
   * scene has not been drawn yet, not a second way of saying the same thing.
   */
  map?: MapStage | null;
  unlocked?: { nodeId: string; label: string } | null;
  error?: string;
}) {
  const isArabic = locale === "ar-EG";
  const isBakery = world.slug === "el-forn";

  // The first unfinished lesson is the one to offer. Finished ones stay replayable —
  // `docs/02` is explicit that skipping is a suggestion and never a lock-out.
  const nextLesson = lessons.find((lesson) => !lesson.completed) ?? lessons[0];
  const nextLessonId = nextLesson?.id;
  const startedAny = lessons.some((lesson) => lesson.completed);

  const errorNote = error ? (
    <p className="mission-list__error" role="status">
      {error === "no-mission"
        ? (isArabic ? "مفيش مهمة جاهزة دلوقتي. جرّب تاني بعد شوية." : "No mission is ready right now. Please try again shortly.")
        : (isArabic ? "المهمة دي مش موجودة." : "That lesson does not exist.")}
    </p>
  ) : null;

  const startButton = nextLesson ? (
    <Link className="button button--primary button--large" href={`/${locale}/worlds/${world.slug}/play/${nextLesson.slug}`}>
      {startedAny ? (isArabic ? "كمّل المهمة" : "Continue mission") : (isArabic ? "ابدأ المهمة الأولى" : "Start mission one")}
    </Link>
  ) : (
    <button className="button button--primary button--large" type="button" disabled>{isArabic ? "قريبًا" : "Coming soon"}</button>
  );

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
            <div className="world-hero__facts"><span>{lessons.length || world.missions.length} {isArabic ? "مهمات" : "missions"}</span><span>{world.concepts[locale]}</span></div>
          </div>
          <TicoFloat className="world-hero__tico" pose={isBakery ? "determined" : "thinking"} alt="" priority />
        </section>

        {map ? (
          <section className={`world-path ${inter.variable} ${caveat.variable}`}>
            <div className="shell world-path__intro">
              <p className="eyebrow">{isArabic ? "المسار" : "THE PATH"}</p>
              <h2>{isArabic ? "خريطة العالم" : "World map"}</h2>
              <p className="world-path__lede">
                {isArabic
                  ? "تيكو واقف جنب المهمة اللي دورك عليها. اللي مقفول بيتفتح أول ما تخلّص اللي قبله."
                  : "TICO stands beside the mission you're on. Locked stops open as you finish the one before."}
              </p>
              {errorNote}
            </div>
            <ChallengeMapView locale={locale} stages={[map]} unlocked={unlocked} banners={false} />
            <div className="shell world-path__cta">{startButton}</div>
          </section>
        ) : (
          <section className="world-details shell">
            <div className="mission-list-block">
              <p className="eyebrow">{isArabic ? "المسار" : "THE PATH"}</p>
              <h2>{isArabic ? "مهمات العالم" : "World missions"}</h2>
              <ol className="mission-list">
                {lessons.map((lesson, index) => (
                  <li key={lesson.id} className={lesson.id === nextLessonId ? "mission-list__active" : ""}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <b>{lesson.title}</b>
                      <small>
                        {lesson.completed
                          ? (isArabic ? "اتعملت" : "Completed")
                          : lesson.id === nextLessonId
                            ? (isArabic ? "جاهزة للبدء" : "Ready to begin")
                            : (isArabic ? "بتتفتح بالترتيب" : "Unlocks in order")}
                      </small>
                    </div>
                    {lesson.completed || lesson.id === nextLessonId ? (
                      <Link className="mission-list__go" href={`/${locale}/worlds/${world.slug}/play/${lesson.slug}`}>
                        <span className="sr-only">{isArabic ? `ابدأ ${lesson.title}` : `Start ${lesson.title}`}</span>
                        <i aria-hidden="true">{lesson.completed ? "↻" : "▶"}</i>
                      </Link>
                    ) : (
                      <i aria-hidden="true">◇</i>
                    )}
                  </li>
                ))}
              </ol>
              {errorNote}
              {startButton}
            </div>

            <WorldNote isArabic={isArabic} />
          </section>
        )}

        {map && <section className="shell world-note-block"><WorldNote isArabic={isArabic} /></section>}

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

function WorldNote({ isArabic }: { isArabic: boolean }) {
  return (
    <aside className="world-note">
      <p className="eyebrow">{isArabic ? "هتتعلّم" : "YOU’LL LEARN"}</p>
      <h2>{isArabic ? "بايثون بيحل مشكلة حقيقية" : "Python solves a real problem"}</h2>
      <p>{isArabic ? "كل مهمة بتوصّل الكود بنتيجة واضحة جوّه المكان. جرّب براحتك؛ المحاولات والتلميحات من غير عقاب." : "Every mission connects code to a visible result in the world. Try freely—attempts and hints never carry a penalty."}</p>
      <code dir="ltr">print(&quot;Yalla, Python!&quot;)</code>
    </aside>
  );
}
