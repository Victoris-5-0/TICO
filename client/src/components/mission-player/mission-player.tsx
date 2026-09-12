"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MissionDialog, MissionExitPanel } from "@/components/mission-ui/mission-panels";
import { SiteLogo } from "@/components/site-logo";
import type { MissionTest, PhasedMissionOut, WorldChange } from "@/lib/ai/types";
import { undrawnProps, type MissionProps } from "@/lib/bakery/mission-scene";
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

export type MissionPlayerProps = {
  locale: Locale;
  mission: PhasedMissionOut;
  worldSlug: string;
  worldTitle: string;
  lessonId?: string | null;
  /** Used to point the map at whatever this mission just unlocked. */
  lessonSlug?: string | null;
  /** Line keys with a pre-recorded reading. Empty means this mission has no audio. */
  narrationKeys?: readonly string[];
};

export function MissionPlayer({ locale, mission, worldSlug, worldTitle, lessonId, lessonSlug, narrationKeys = [] }: MissionPlayerProps) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const router = useRouter();
  const worldHref = `/${locale}/worlds/${worldSlug}`;
  // Finishing sends them to the map rather than back to the world list: the point of the
  // moment is seeing what opened up, and `?done=` is what tells the map which one.
  const mapHref = lessonSlug
    ? `/${locale}/challenges?done=${encodeURIComponent(lessonSlug)}`
    : `/${locale}/challenges`;

  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [done, setDone] = useState(false);
  const [debrief, setDebrief] = useState<telemetry.MissionDebrief | null>(null);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [playToken, setPlayToken] = useState(0);
  const [ran, setRan] = useState<Record<string, boolean>>({});
  const [change, setChange] = useState<WorldChange | null>(null);
  const [narrow, setNarrow] = useState(false);

  const sessionId = useRef<string | null>(null);
  const runner = usePythonRunner();

  const phaseKey = ORDER[step];
  const phases = mission.phases;

  // Open the practice session once. A null id means the mission plays unrecorded, which
  // is the documented degradation — never a blocker.
  useEffect(() => {
    let cancelled = false;
    telemetry.startSession({ generatedMissionId: mission.id, lessonId }).then((id) => {
      if (!cancelled) sessionId.current = id;
    });
    return () => { cancelled = true; };
  }, [mission.id, lessonId]);

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

  const advance = useCallback(() => {
    setChange(null);
    setHighlight([]);
    setStep((n) => Math.min(n + 1, ORDER.length - 1));
  }, []);

  const play = useCallback((next: WorldChange | null | undefined, key: string) => {
    setChange(next ?? null);
    setPlayToken((n) => n + 1);
    setRan((seen) => ({ ...seen, [key]: true }));
  }, []);

  /** Run the student's code, and record the attempt. */
  const runCode = useCallback(
    async (source: string, tests: MissionTest[]): Promise<RunResult> => {
      const result = await runner.run({
        source,
        cases: tests.map((t) => ({ call: t.call, expected: t.expected, hidden: t.hidden })),
      });
      telemetry.reportSubmission(sessionId.current, {
        code: source,
        status: result.allPassed ? "PASSED" : result.outcome === "TIMEOUT" ? "TIMEOUT"
          : result.outcome === "SYNTAX_ERROR" || result.outcome === "RUNTIME_ERROR" ? "ERROR" : "FAILED",
        output: result.stdout.slice(0, 4000),
        durationMs: result.durationMs,
      });
      return result;
    },
    [runner],
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
      const authored = phases.guided.steps.find((s) => s.hintAr)?.hintAr;
      return authored ? { text: authored, rung: 1 } : null;
    },
    [mission.id, locale, phases.guided.steps],
  );

  const finish = useCallback(async () => {
    setDone(true);
    setDebrief(await telemetry.finishSession(sessionId.current));
  }, []);

  const restProps: MissionProps | undefined = useMemo(
    () => change?.props ?? phases.encounter.world?.props,
    [change, phases.encounter.world?.props],
  );

  const sceneLabel = ar
    ? "فرن الحارة: حسن بيخبز والزباين مستنيين في الطابور."
    : "Forn El Hara: Hassan at the oven and neighbours waiting in the queue.";

  const extras = undrawnProps(restProps);

  // The encounter is spoken by whoever has the problem; every later phase is TICO.
  const speaker = phaseKey === "encounter" ? phases.encounter.speaker || "tico" : "tico";
  const speakerName = phaseKey === "encounter" ? phases.encounter.speakerNameAr : ar ? "تيكو" : "Tico";
  const blockedOnWidth = narrow && CODING.has(phaseKey);
  const runnerBusy = runner.state === "running";

  return (
    <MotionConfig reducedMotion="user">
     <NarrationProvider missionId={mission.id} keys={narrationKeys} sequence={NARRATION[phaseKey]}>
      <div className={styles.page} dir={ar ? "rtl" : "ltr"}>
        <header className={styles.header}>
          <SiteLogo href={`/${locale}`} />
          <div className={styles.headerMeta}>
            <span className={styles.world}>{worldTitle}</span>
            <h1 className={styles.title}>{mission.titleAr}</h1>
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
              props={restProps}
              animate={change?.animate}
              playToken={playToken}
              caption={change?.captionAr}
              highlight={highlight}
              extendLeft={narrow ? 0 : 700}
              label={sceneLabel}
            />
            {extras.length > 0 && (
              <dl className={styles.readouts}>
                {extras.map(([key, value]) => (
                  <div key={key} className={highlight.includes(key) ? styles.readoutLit : ""}>
                    <dt dir="ltr" lang="en">{key}</dt>
                    <dd>{typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : value}</dd>
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
          <div className={`${styles.panelDock} ${CODING.has(phaseKey) ? styles.panelDockWide : ""}`}>
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
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {blockedOnWidth ? (
                <WiderScreenNotice locale={locale} />
              ) : (
                <>
                  {phaseKey === "encounter" && (
                    <EncounterPhase phase={phases.encounter} locale={locale} onContinue={advance} />
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
                      runnerBusy={runnerBusy}
                      onSolved={() => play(phases.guided.onRun, "guided")}
                      onContinue={advance}
                    />
                  )}
                  {phaseKey === "remix" && (
                    <RemixPhase
                      phase={phases.remix}
                      locale={locale}
                      runCode={runCode}
                      requestHint={requestHint}
                      runnerBusy={runnerBusy}
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
            titleAr={mission.titleAr}
            conceptNameAr={phases.discover.conceptNameAr}
            worldLine={phases.remix.onRun?.captionAr || phases.guided.onRun?.captionAr || (ar ? "الفرن اشتغل بالكود اللي كتبته." : "The bakery ran on the code you wrote.")}
            debrief={debrief}
            onReplay={() => { setDone(false); setStep(0); setChange(null); setRan({}); }}
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
