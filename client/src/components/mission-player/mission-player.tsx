"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MissionDialog, MissionExitPanel } from "@/components/mission-ui/mission-panels";
import type { MissionTest, PhasedMissionOut, WorldChange } from "@/lib/ai/types";
import { beatsOf, interactionsOf, settledProps, resolveChange, undrawnProps, type MissionProps } from "@/lib/bakery/mission-scene";
import { bakeryScene } from "@/lib/bakery/scene-manifest";
import * as telemetry from "@/lib/mission/telemetry";
import { usePythonRunner, type RunResult } from "@/lib/runner/use-python-runner";
import type { Locale } from "@/i18n/config";

import { CharacterBust } from "./character-bust";
import { MissionDebrief } from "./mission-debrief";
import { NarrationControls, NarrationProvider } from "./narration";
import { MissionScene } from "./mission-scene";
import { DiscoverPhase, EncounterPhase, ExplorePhase, GuidedPhase, RemixPhase, UnderstandPhase, type RequestHint } from "./phases";
import styles from "./mission-player.module.css";

/** The six phases, in the fixed order the AI backend composes them in. */
const ORDER = ["encounter", "explore", "discover", "understand", "guided", "remix"] as const;
type PhaseKey = (typeof ORDER)[number];

/**
 * What each phase reads aloud, in order.
 *
 * Coding phases are silent on purpose: a student is reading code and thinking, and a
 * voice over that is an interruption rather than help.
 */
const NARRATION: Record<PhaseKey, readonly string[]> = {
  encounter: ["encounter"],
  explore: ["explore.intro"],
  discover: ["discover.explanation", "discover.tico"],
  understand: [],
  guided: [],
  remix: ["remix.twist"],
};

/** Phases that need a real editor, and therefore a real screen. */
const CODING: ReadonlySet<PhaseKey> = new Set(["understand", "guided", "remix"]);

const READOUT_LABELS: Record<string, { ar: string; en: string; unitAr?: string; unitEn?: string }> = {
  total_price: { ar: "الفلوس", en: "Takings", unitAr: "جنيه", unitEn: "EGP" },
  dough_ready: { ar: "العجين الجاهز", en: "Dough ready" },
  stock_count: { ar: "الأرغفة المتاحة", en: "Loaves available" },
  temperature: { ar: "حرارة الفرن", en: "Oven temperature", unitAr: "درجة", unitEn: "°" },
  delivery_order: { ar: "طلب التوصيل", en: "Delivery order" },
  delivery_left: { ar: "الباقي بعد التوصيل", en: "After delivery" },
  shelf_left: { ar: "الباقي للطابور", en: "Left for queue" },
  waiting_cars: { ar: "العربيات المستنية", en: "Waiting cars" },
  cars_passed: { ar: "العربيات اللي عدّت", en: "Cars released" },
  signal: { ar: "حالة الإشارة", en: "Signal" },
};

const STEP_LABELS: Record<Locale, Record<PhaseKey, string>> = {
  "ar-EG": {
    encounter: "المشكلة", explore: "استكشاف", discover: "المفهوم",
    understand: "الكود", guided: "اكتب", remix: "التغيير",
  },
  en: {
    encounter: "Problem", explore: "Explore", discover: "Concept",
    understand: "Code", guided: "Write", remix: "Twist",
  },
};

const WORLD_BANNERS: Record<string, string> = {
  "el-forn": "/assets/challenge-map/bakery-banner.png",
  "cairo-traffic": "/assets/challenge-map/traffic-banner.png",
  "isharet-cairo": "/assets/challenge-map/traffic-banner.png",
};

export type MissionPlayerProps = {
  locale: Locale;
  mission: PhasedMissionOut;
  worldSlug: string;
  worldTitle: string;
  lessonId?: string | null;
  /** Used to point the map at whatever this mission just unlocked. */
  lessonSlug?: string | null;
  missionName?: string | null;
  /** Line keys with a pre-recorded reading. Empty means this mission has no audio. */
  narrationKeys?: readonly string[];
  /** Play a review sample without opening a tracked curriculum session. */
  preview?: boolean;
};

export function MissionPlayer({ locale, mission, worldSlug, worldTitle, lessonId, lessonSlug, missionName, narrationKeys = [], preview = false }: MissionPlayerProps) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const router = useRouter();
  const worldHref = `/${locale}/worlds/${worldSlug}`;
  // Finishing sends them to the map rather than back to the world list: the point of the
  // moment is seeing what opened up, and `?done=` is what tells the map which one.
  const mapHref = preview ? worldHref : worldSlug === "isharet-cairo"
    ? `${worldHref}${lessonSlug ? `?done=${encodeURIComponent(lessonSlug)}` : ""}`
    : lessonSlug ? `/${locale}/challenges?done=${encodeURIComponent(lessonSlug)}`
    : `/${locale}/challenges`;
  const bannerUrl = WORLD_BANNERS[worldSlug] || "/assets/challenge-map/bakery-banner.png";

  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState(false);
  const [debrief, setDebrief] = useState<telemetry.MissionDebrief | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [playToken, setPlayToken] = useState(0);
  const [ran, setRan] = useState<Record<string, boolean>>({});
  const [change, setChange] = useState<WorldChange | null>(null);
  const [world, setWorld] = useState<MissionProps>(mission.phases.encounter.world?.props ?? {});
  const [interactionIndex, setInteractionIndex] = useState(0);
  // Every world opens with its guide speaking before the first clickable instruction.
  // Traffic used to start at `true`, which replaced Karim's introduction immediately
  // with "press the signal" and made the world introduction impossible to see.
  const [encounterStarted, setEncounterStarted] = useState(false);
  const [sceneBusy, setSceneBusy] = useState(false);
  const values = useRef<Record<string, string>>({});
  const interactions = interactionsOf(mission.phases.encounter.world);
  const settleScene = useCallback(() => setSceneBusy(false), []);
  /**
   * A run that did not pass, while a customer is standing at the counter waiting for it.
   *
   * She shows it and says so until the next run. Impatience rather than anger at the
   * child: `el_forn.yaml` documents `puzzled`/`pleased` and says never anger, and a
   * customer furious at a ten-year-old's first attempt punishes the attempt. Being in a
   * hurry is about her morning, not about them, and it clears the moment they run again.
   */
  const [missed, setMissed] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const sessionId = useRef<string | null>(null);
  const runner = usePythonRunner();

  const phaseKey = ORDER[step];
  const phases = mission.phases;

  // Open the practice session once. A null id means the mission plays unrecorded, which
  // is the documented degradation — never a blocker.
  useEffect(() => {
    let cancelled = false;
    sessionId.current = null;
    if (preview) return;
    telemetry.startSession({ generatedMissionId: mission.id, lessonId }).then((id) => {
      if (!cancelled) sessionId.current = id;
    });
    return () => { cancelled = true; };
  }, [mission.id, lessonId, preview]);

  useEffect(() => {
    telemetry.reportPhase(sessionId.current, step);
  }, [step]);

  // docs/design.md section 13: a phone shows the mission material and a "continue on a
  // wider screen" state, never a shrunken editor. Measured, not guessed from the UA.
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px), (max-height: 460px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /**
   * Move to the next phase, playing whatever that phase announces about the world.
   *
   * `remix.worldChange` is the twist as the world tells it — the oven works, a neighbour
   * walks in, she asks for something. Nothing ever played it: only `onRun` was, on solve,
   * so the customer the twist is about appeared for the first time mid-handover, and the
   * student was asked for her order before she was on screen.
   *
   * Played from the click that advances rather than an effect watching the step, which is
   * the rule the rest of this file follows: entering a phase is a gesture.
   */
  const advance = useCallback(() => {
    const next = Math.min(step + 1, ORDER.length - 1);
    const announces = ORDER[next] === "remix" ? mission.phases.remix.worldChange
      : ORDER[next] === "guided" ? mission.phases.guided.steps[0]?.onEnter : null;
    setWorld((current) => settledProps(change, current));
    setChange(announces ?? null);
    setSceneBusy(Boolean(announces?.steps?.length));
    setPlayToken((n) => n + 1);
    setMissed(false);
    setHighlight([]);
    setStep(next);
  }, [step, mission.phases, change]);

  const play = useCallback((next: WorldChange | null | undefined, key: string) => {
    setWorld((current) => settledProps(change, current));
    // A second press of Run reports the same code result without resetting traffic
    // and reintroducing cars that already left this round.
    const replay = worldSlug === "isharet-cairo" && Boolean(ran[key]) &&
      (key === "understand" || /^guided-\d+$/.test(key) || key === "remix");
    const playback = replay && next ? { ...next, animate: "officer_point", steps: [] } : next;
    setChange(playback ? resolveChange(playback, values.current) : null);
    setSceneBusy(Boolean(playback?.steps?.length));
    setPlayToken((n) => n + 1);
    setRan((seen) => ({ ...seen, [key]: true }));
  }, [change, ran, worldSlug]);

  /** Run the student's code, and record the attempt. */
  const runCode = useCallback(
    async (source: string, tests: MissionTest[]): Promise<RunResult> => {
      setMissed(false);
      const result = await runner.run({
        source,
        cases: tests.map((t) => ({ call: t.call, expected: t.expected, hidden: t.hidden })),
      });
      setMissed(!result.allPassed);
      values.current = Object.fromEntries(result.cases.filter((row) => row.actual !== undefined).map((row) => [row.call, row.actual!]));
      if (!result.allPassed) {
        const actuals: MissionProps = Object.fromEntries(Object.entries(values.current).map(([key, value]) => [key, value.replace(/^['"]|['"]$/g, "")]));
        setWorld((current) => ({ ...settledProps(change, current), ...actuals }));
        setChange(null);
        setPlayToken((n) => n + 1);
      }
      telemetry.reportSubmission(sessionId.current, {
        code: source,
        status: result.allPassed ? "PASSED" : result.outcome === "TIMEOUT" ? "TIMEOUT"
          : result.outcome === "SYNTAX_ERROR" || result.outcome === "RUNTIME_ERROR" ? "ERROR" : "FAILED",
        output: result.stdout.slice(0, 4000),
        durationMs: result.durationMs,
      });
      return result;
    },
    [runner, change],
  );

  /**
   * The hint ladder. The rung is counted server-side from prior `hint_events`; this only
   * asks. When the service is unreachable the mission's own authored hint stands in, so
   * a student is never left with nothing.
   */
  const requestHint = useCallback<RequestHint>(
    async (code, lastResult, where) => {
      const hint = await telemetry.requestHint({
        sessionId: sessionId.current,
        missionId: mission.id,
        codeExcerpt: code,
        lastResult,
        locale,
        // Passed through from the phase that asked: the ladder is rationed by phase and
        // the hint is aimed at one guided step.
        ...where,
      });
      if (hint) return hint;
      const authored = where.phase === "GUIDED_CODING"
        ? phases.guided.steps[where.guidedStep ?? 0]?.hintAr
        : phases.remix.twistAr;
      return authored ? { text: authored, rung: 1 } : null;
    },
    [mission.id, locale, phases.guided.steps, phases.remix.twistAr],
  );

  const finish = useCallback(async () => {
    setDone(true);
    setDebrief(await telemetry.finishSession(sessionId.current));
  }, []);

  /**
   * The thing the opening asks the child to press, and whether they have.
   *
   * A mission can open by handing them the shop rather than a Continue button: Am Hassan
   * says the sign still reads مقفول, the sign is the only thing lit, and pressing it is
   * what starts the lesson. Pressing is a click, so the state change lives in the handler
   * and never in an effect.
   */
  const awaiting = phaseKey === "encounter" && encounterStarted ? interactions[interactionIndex] : undefined;
  const press = awaiting?.target ?? null;

  const restProps: MissionProps | undefined = useMemo(() => {
    return { ...world, ...change?.props };
  }, [change, world]);

  const takePress = (target: string) => {
    if (!awaiting || target !== awaiting.target || sceneBusy) return;
    play(awaiting.onPress, `interaction-${interactionIndex}`);
    setInteractionIndex((index) => index + 1);
  };

  /**
   * Where a character's words appear, in the scene's own 1600×900 coordinates.
   *
   * The tour puts speech over the speaker's head rather than in a panel beside the
   * picture, and a mission set in the same shop should not suddenly talk from the margin.
   * Am Hassan stands at `bakeryScene.baker`; the bubble sits just clear of his head.
   *
   * `extendLeft` paints extra wall to the left for the panel to sit on, which widens the
   * view box — so a world x has to be converted against that wider frame or the bubble
   * drifts off the person saying the words.
   */
  const ext = narrow ? 0 : 700;
  const speechAt = worldSlug === "isharet-cairo"
    ? { left: "40.3%", bottom: "42.7%" }
    : {
        left: `${((bakeryScene.baker.x + ext) / (1600 + ext)) * 100}%`,
        bottom: `${((900 - 424) / 900) * 100}%`,
      };

  /**
   * What is said out loud in the scene, as opposed to what the panel is for.
   *
   * The opening line belongs to whoever has the problem; every later phase speaks through
   * the caption its Run produced. The panel keeps the questions, the editor and the
   * buttons — the things you act on rather than listen to.
   */
  const sceneLine = phaseKey === "encounter"
    ? encounterStarted
      ? awaiting?.promptAr || change?.captionAr || phases.encounter.lineAr
      : phases.encounter.lineAr
    : change?.captionAr || null;

  // Stable across renders, or the scene rebuilds its frame callback on every one.
  const beats = useMemo(() => beatsOf(change), [change]);

  const sceneLabel = worldSlug === "isharet-cairo"
    ? ar
      ? "تقاطع في القاهرة: ضابط المرور واقف عند الإشارة والعربيات مستنية دورها."
      : "A Cairo junction: the traffic officer stands by the signal while cars wait their turn."
    : ar
      ? "فرن الحارة: حسن بيخبز والزباين مستنيين في الطابور."
      : "Forn El Hara: Hassan at the oven and neighbours waiting in the queue.";

  const extras = undrawnProps(restProps)
    .filter(([key]) => key in READOUT_LABELS)
    .sort(([a], [b]) => {
      const priority = ["stock_count", "total_price", "temperature"];
      const rank = (key: string) => priority.includes(key) ? priority.indexOf(key) : priority.length;
      return rank(a) - rank(b);
    })
    .slice(0, 3);

  // The encounter is spoken by whoever has the problem; every later phase is TICO.
  const speaker = phaseKey === "encounter" ? phases.encounter.speaker || "tico" : "tico";
  const speakerName = phaseKey === "encounter" ? phases.encounter.speakerNameAr : ar ? "تيكو" : "Tico";
  const blockedOnWidth = narrow && CODING.has(phaseKey);
  // Coding cannot begin while Pyodide is still loading or rebuilding after a timeout.
  // Posting early starts the learner-code timer while the interpreter is still warming,
  // which made a one-line assignment look like an infinite loop on slower machines.
  const runnerBusy = runner.state !== "ready";

  return (
    <MotionConfig reducedMotion="user">
     <NarrationProvider missionId={mission.id} keys={narrationKeys} sequence={NARRATION[phaseKey]}>
      <div className={styles.page} dir={ar ? "rtl" : "ltr"}>
        <header className={styles.header}>
          <Link className={styles.navLogo} href={`/${locale}`} aria-label="TICO home">
            <Image src="/assets/landing/tico/logo-mission.png" alt="TICO" width={912} height={289} priority />
          </Link>
          <div className={styles.headerMeta}>
            <span className={styles.world}>{worldTitle}</span>
            <h1 className={styles.title}>{missionName || mission.titleAr}</h1>
          </div>
          <NarrationControls locale={locale} />
          <button
            type="button"
            className={styles.close}
            onClick={() => setExiting(true)}
            aria-label={ar ? "اخرج من المهمة" : "Leave mission"}
          >
            ×
          </button>
        </header>

        <ol className={styles.steps} aria-label={ar ? "مراحل المهمة" : "Mission phases"}>
          {ORDER.map((key, index) => (
            <li
              key={key}
              className={`${styles.stepChip} ${index === step ? styles.stepCurrent : ""} ${index < step ? styles.stepDone : ""}`}
              aria-current={index === step ? "step" : undefined}
            >
              <span className={styles.stepIndex} aria-hidden="true">{index < step ? "✓" : index + 1}</span>
              {STEP_LABELS[locale][key]}
            </li>
          ))}
        </ol>

        <main className={styles.main}>
          <section className={styles.stage}>
            <MissionScene
              locale={locale}
              worldSlug={worldSlug}
              props={restProps}
              animate={change?.animate}
              playToken={playToken}
              caption={change?.captionAr}
              highlight={press ? [press] : highlight}
              pickable={!sceneBusy ? press ?? undefined : undefined}
              onPick={takePress}
              pickLabel={() => awaiting?.promptAr || (ar ? "اضغط على العنصر المضيء" : "Press the highlighted object")}
              onSettled={settleScene}
              beats={beats}
              upset={missed ? worldSlug === "isharet-cairo"
                ? { name: ar ? "الضابط كريم" : "Officer Karim", line: ar ? "العربيات لسه مستنية عند الخط. بص على نتيجة الكود وجرّب تاني." : "The cars are still waiting at the line. Check your code result and try again." }
                : { name: ar ? "الطلب مستني" : "Order waiting", line: ar ? "الطلب لسه متجهّزش. شوف نتيجة الكود وجرب تاني." : "The order is still waiting. Check your result and try again." }
                : null}
              speech={sceneLine ? { name: speakerName, line: sceneLine } : null}
              speechAt={speechAt}
              extendLeft={ext}
              label={sceneLabel}
            />
            {extras.length > 0 && (
              <dl className={styles.readouts}>
                {extras.map(([key, value]) => (
                  <div key={key} className={highlight.includes(key) ? styles.readoutLit : ""}>
                    <dt>{READOUT_LABELS[key]?.[ar ? "ar" : "en"] ?? key}</dt>
                    <dd>
                      {typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : value}
                      {READOUT_LABELS[key]?.[ar ? "unitAr" : "unitEn"] ? ` ${READOUT_LABELS[key][ar ? "unitAr" : "unitEn"]}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/*
            The speaker is a sibling of the panel, not a child: the panel's own
            `backdrop-filter` creates a stacking context, and a child inside it cannot be
            layered against the glass independently. Out here the figure sits in front of
            the card, undimmed by the blur, with its top half clear of the frame.
          */}
          <div className={`${styles.panelDock} ${CODING.has(phaseKey) ? styles.panelDockWide : ""} ${worldSlug === "isharet-cairo" ? styles.panelDockTraffic : ""}`}>
            <CharacterBust speaker={speaker} alt={speakerName} />

            <section className={styles.panel}>
              <div className={styles.bustName}>
                <span>{STEP_LABELS[locale][phaseKey]}</span>
                <strong>{speakerName}</strong>
              </div>

              <div className={styles.panelBody}>
            {/*
              A keyed remount with an entrance only — deliberately not AnimatePresence.

              `docs/design.md` asks for `mode="wait"` on mission steps, and it deadlocked
              here: the phase state advanced, the exiting panel never finished exiting, so
              the entering one never mounted and the mission stranded on phase 1 with the
              rail already showing phase 2. Phase changes are one-way and replace the whole
              panel, so the exit half of that handshake bought nothing and was the half that
              broke. Changing `key` remounts, Motion plays the entrance, and there is no
              exit to wait on.
            */}
            <motion.div
              key={phaseKey}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {blockedOnWidth ? (
                <WiderScreenNotice locale={locale} />
              ) : (
                <>
                  {phaseKey === "encounter" && (
                    <EncounterPhase
                      phase={phases.encounter}
                      locale={locale}
                      onContinue={() => encounterStarted ? advance() : setEncounterStarted(true)}
                      awaiting={press || (sceneBusy ? "scene" : null)}
                      spokenInScene
                    />
                  )}
                  {phaseKey === "explore" && (
                    <ExplorePhase phase={phases.explore} locale={locale} onHighlight={setHighlight} onContinue={advance} />
                  )}
                  {phaseKey === "discover" && (
                    <DiscoverPhase phase={phases.discover} locale={locale} onContinue={advance} />
                  )}
                  {phaseKey === "understand" && (
                    <UnderstandPhase
                      phase={phases.understand}
                      locale={locale}
                      onRun={() => play(phases.understand.onRun, "understand")}
                      hasRun={Boolean(ran.understand)}
                      onContinue={advance}
                    />
                  )}
                  {phaseKey === "guided" && (
                    <GuidedPhase
                      phase={phases.guided}
                      locale={locale}
                      runCode={runCode}
                      requestHint={requestHint}
                      runnerBusy={runnerBusy || sceneBusy}
                      onEnter={(outcome) => play(outcome, "guided-enter")}
                      onSolved={(_code, outcome, stepIndex) => play(outcome ?? phases.guided.onRun, `guided-${stepIndex}`)}
                      onContinue={advance}
                    />
                  )}
                  {phaseKey === "remix" && (
                    <RemixPhase
                      phase={phases.remix}
                      locale={locale}
                      runCode={runCode}
                      requestHint={requestHint}
                      runnerBusy={runnerBusy || sceneBusy}
                      onSolved={() => play(phases.remix.onRun, "remix")}
                      onFinish={finish}
                    />
                  )}
                </>
              )}
              </motion.div>
              </div>
            </section>
          </div>
        </main>

        <div
          className={styles.bottomBanner}
          style={{ backgroundImage: `url(${bannerUrl})` }}
          aria-hidden="true"
        />

        <RunnerStatus state={runner.state} error={runner.error} onRetry={runner.restart} locale={locale} />

        <p className={styles.footNote}>
          {ar ? "المهمة دي اتولدت بالذكاء الاصطناعي واتراجعت آليًا." : "This mission was generated and machine-validated."}
          {" "}
          <Link href={worldHref}>{ar ? "ارجع للعالم" : "Back to the world"}</Link>
        </p>

        <MissionDialog open={exiting} onClose={() => setExiting(false)} label={ar ? "الخروج من المهمة" : "Leave mission"}>
          <MissionExitPanel
            locale={locale}
            description={ar ? "اللي كتبته في المهمة دي مش هيتحفظ." : "What you have written in this mission will not be kept."}
            onExit={() => router.push(worldHref)}
            onCancel={() => setExiting(false)}
          />
        </MissionDialog>

        <MissionDialog open={done} onClose={() => setDone(false)} label={ar ? "المهمة اكتملت" : "Mission complete"}>
          <MissionDebrief
            locale={locale}
            titleAr={missionName || mission.titleAr}
            conceptNameAr={phases.discover.conceptNameAr}
            worldLine={phases.remix.onRun?.captionAr || phases.guided.onRun?.captionAr || (ar ? "الفرن اشتغل بالكود اللي كتبته." : "The bakery ran on the code you wrote.")}
            debrief={debrief}
            onReplay={() => { setDone(false); setStep(0); setChange(null); setRan({}); setWorld(phases.encounter.world?.props ?? {}); setInteractionIndex(0); setEncounterStarted(worldSlug === "isharet-cairo"); setMissed(false); setSceneBusy(false); setPlayToken((n) => n + 1); }}
            onNext={() => router.push(mapHref)}
          />
        </MissionDialog>
      </div>
     </NarrationProvider>
    </MotionConfig>
  );
}

/** docs/design.md section 13 — the coding CTA explains the wider-screen requirement. */
function WiderScreenNotice({ locale }: { locale: Locale }) {
  const ar = locale === "ar-EG";
  return (
    <div className={styles.wideOnly} role="note">
      <span aria-hidden="true" className={styles.wideOnlyIcon}>⌨</span>
      <h2>{ar ? "الجزء ده محتاج شاشة أوسع" : "This part needs a wider screen"}</h2>
      <p>
        {ar
          ? "كتابة الكود محتاجة مساحة. افتح المهمة على تابلت بالعرض أو كمبيوتر وكمّل من هنا بالظبط."
          : "Writing code needs room. Open this mission on a landscape tablet or a computer and pick up exactly here."}
      </p>
    </div>
  );
}

/**
 * The runner's own state, shown only when it matters.
 *
 * docs/07 asks for first-load progress and a retry that does not lose editor content.
 * Silent while ready or running, because a child mid-mission does not need to be told
 * the interpreter is fine.
 */
function RunnerStatus({
  state, error, onRetry, locale,
}: {
  state: ReturnType<typeof usePythonRunner>["state"];
  error: string | null;
  onRetry: () => void;
  locale: Locale;
}) {
  const ar = locale === "ar-EG";
  if (state === "ready" || state === "running") return null;

  return (
    <p className={styles.runnerStatus} role="status" aria-live="polite">
      {state === "failed" ? (
        <>
          {ar ? "مشغّل بايثون محمّلش." : "The Python runner did not load."}
          {error && <span className={styles.runnerDetail} dir="ltr" lang="en"> {error}</span>}
          <button type="button" className={styles.ghostAction} onClick={onRetry}>
            {ar ? "حاول تاني" : "Try again"}
          </button>
        </>
      ) : (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          {ar ? "بنجهّز بايثون… أول مرة بس بتاخد شوية." : "Getting Python ready… only the first time takes a moment."}
        </>
      )}
    </p>
  );
}
