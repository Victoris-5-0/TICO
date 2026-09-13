"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";

import type {
  GuidedStep,
  MissionTest,
  PhaseDiscover,
  PhaseEncounter,
  PhaseExplore,
  Phase,
  PhaseGuided,
  PhaseRemix,
  PhaseUnderstand,
} from "@/lib/ai/types";
import type { CaseResult } from "@/lib/runner/protocol";
import type { RunResult } from "@/lib/runner/use-python-runner";
import type { Locale } from "@/i18n/config";

import { CodeEditor } from "./code-editor";
import { SPEAKER_PORTRAITS, TICO_PORTRAIT } from "./mission-copy";
import styles from "./mission-player.module.css";

type Ar = { ar: boolean };

/** A line of dialogue with the speaker's portrait beside it. */
function Speech({ portrait, name, line, ar }: { portrait: string; name: string; line: string } & Ar) {
  return (
    <div className={styles.speech}>
      <Image className={styles.portrait} src={portrait} alt="" width={384} height={384} sizes="88px" />
      <div className={styles.speechBubble}>
        <strong className={styles.speaker}>{name}</strong>
        <p dir={ar ? "rtl" : "ltr"}>{line}</p>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- 1. encounter

/**
 * The problem, stated by whoever has it.
 *
 * `awaiting` names a prop in the scene that has to be pressed before the mission will
 * move on. When it is set there is no Continue button at all — the way forward is the
 * shop itself, lit and waiting. A child who opens the bakery by turning its sign has
 * already changed the world once before they are asked to write anything.
 */
export function EncounterPhase({ phase, locale, onContinue, awaiting = null, spokenInScene = false }: { phase: PhaseEncounter; locale: Locale; onContinue: () => void; awaiting?: string | null; spokenInScene?: boolean }) {
  const ar = locale === "ar-EG";
  const portrait = SPEAKER_PORTRAITS[phase.speaker] ?? TICO_PORTRAIT;

  return (
    <div className={styles.storyPhase}>
      {/* When the scene is saying it over his head, the panel would only be an echo. */}
      {!spokenInScene && <Speech portrait={portrait} name={phase.speakerNameAr} line={phase.lineAr} ar={ar} />}
      {awaiting ? (
        <p className={styles.awaiting} dir={ar ? "rtl" : "ltr"}>
          {ar ? "اضغط على اليافطة المضوّية جوّه المحل." : "Press the highlighted sign inside the shop."}
        </p>
      ) : (
        <button type="button" className={styles.primaryAction} onClick={onContinue}>
          {phase.ctaAr || (ar ? "يلا نبدأ" : "Let's start")}
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------- 2. explore

export function ExplorePhase({
  phase,
  locale,
  onHighlight,
  onContinue,
}: {
  phase: PhaseExplore;
  locale: Locale;
  onHighlight: (props: string[]) => void;
  onContinue: () => void;
}) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number[]>([]);

  const current = phase.rounds[round];
  const isLast = round === phase.rounds.length - 1;
  const correct = picked !== null && picked === current?.correctIndex;

  useEffect(() => {
    onHighlight(current?.highlight ?? []);
  }, [current, onHighlight]);

  if (!current) return null;

  function choose(index: number) {
    if (correct) return;
    setPicked(index);
    if (index !== current.correctIndex) setWrong((seen) => (seen.includes(index) ? seen : [...seen, index]));
  }

  function next() {
    if (isLast) { onContinue(); return; }
    setRound((n) => n + 1);
    setPicked(null);
    setWrong([]);
  }

  return (
    <div className={styles.storyPhase}>
      <Speech portrait={TICO_PORTRAIT} name={ar ? "تيكو" : "Tico"} line={phase.ticoIntroAr} ar={ar} />

      <div className={styles.question}>
        <p className={styles.questionText} dir={ar ? "rtl" : "ltr"}>
          <span className={styles.roundCount}>{ar ? `سؤال ${round + 1} من ${phase.rounds.length}` : `Question ${round + 1} of ${phase.rounds.length}`}</span>
          {current.questionAr}
        </p>

        <ul className={styles.options}>
          {current.optionsAr.map((option, index) => {
            const isPicked = picked === index;
            const isWrong = wrong.includes(index);
            const isRight = correct && isPicked;
            return (
              <li key={option}>
                <motion.button
                  type="button"
                  className={`${styles.option} ${isRight ? styles.optionRight : ""} ${isWrong ? styles.optionWrong : ""}`}
                  onClick={() => choose(index)}
                  disabled={correct}
                  aria-pressed={isPicked}
                  // One restrained nudge on a wrong answer, never repeated shaking.
                  animate={isWrong && isPicked && !reduced ? { x: [0, -3, 3, 0] } : undefined}
                  transition={{ duration: 0.18 }}
                  whileHover={reduced || correct ? undefined : { y: -2 }}
                >
                  <span aria-hidden="true" className={styles.optionMark}>
                    {isRight ? "✓" : isWrong ? "•" : ""}
                  </span>
                  <bdi>{option}</bdi>
                </motion.button>
              </li>
            );
          })}
        </ul>

        {picked !== null && !correct && (
          <motion.p
            className={styles.nudge}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
            dir={ar ? "rtl" : "ltr"}
          >
            {current.nudgeAr}
          </motion.p>
        )}

        {correct && (
          <motion.button
            type="button"
            className={styles.primaryAction}
            onClick={next}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {isLast ? (ar ? "كمّل" : "Continue") : (ar ? "السؤال اللي بعده" : "Next question")}
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- 3. discover

export function DiscoverPhase({ phase, locale, onContinue }: { phase: PhaseDiscover; locale: Locale; onContinue: () => void }) {
  const ar = locale === "ar-EG";
  return (
    <div className={styles.storyPhase}>
      <div className={styles.conceptCard}>
        <span className={styles.conceptEyebrow}>{ar ? "المفهوم" : "The concept"}</span>
        <h2 className={styles.conceptName}>{phase.conceptNameAr}</h2>
        <p className={styles.conceptBody} dir={ar ? "rtl" : "ltr"}>{phase.explanationAr}</p>
      </div>
      {phase.ticoLineAr && <Speech portrait={TICO_PORTRAIT} name={ar ? "تيكو" : "Tico"} line={phase.ticoLineAr} ar={ar} />}
      <button type="button" className={styles.primaryAction} onClick={onContinue}>
        {ar ? "وريني الكود" : "Show me the code"}
      </button>
    </div>
  );
}

// --------------------------------------------------------------------- shared: tests

/**
 * The tests a phase will be judged by, and how they went.
 *
 * Shown before Run so the target is never a secret — `docs/design.md` requires the
 * expected behaviour and one visible example to stay on screen. Hidden cases show that
 * they exist and nothing else.
 *
 * `docs/07` requires the UI to distinguish a wrong answer from a raised exception, so
 * those read differently here rather than both being "failed".
 */
export function TestList({ tests, locale, results }: { tests: MissionTest[]; locale: Locale; results?: CaseResult[] }) {
  const ar = locale === "ar-EG";
  const visible = tests.filter((test) => !test.hidden);
  if (!visible.length) return null;

  const byCall = new Map((results ?? []).map((row) => [row.call, row]));

  return (
    <section className={styles.tests}>
      <h3 className={styles.testsTitle}>{ar ? "الاختبارات" : "Tests"}</h3>
      <ul>
        {visible.map((test, index) => {
          const result = byCall.get(test.call);
          const cls =
            result?.status === "PASSED" ? styles.testPass
            : result?.status === undefined ? ""
            : styles.testFail;
          return (
            <li key={`${test.call}-${index}`} className={cls}>
              <code dir="ltr" lang="en">{test.call}</code>
              <span aria-hidden="true" className={styles.arrow}>→</span>
              <code dir="ltr" lang="en">{test.expected}</code>
              {result && result.status !== "PASSED" && (
                <span className={styles.testActual} dir="ltr" lang="en">
                  {result.status === "RAISED" ? result.error : ar ? `طلع ${result.actual}` : `got ${result.actual}`}
                </span>
              )}
              {result?.status === "PASSED" && <span aria-hidden="true" className={styles.testTick}>✓</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Run controls.
 *
 * `notice` explains a limitation without taking the control away; `disabledReason` is
 * for a button that genuinely cannot act. Keeping them separate matters: an earlier
 * version disabled Run whenever there was anything to say about it, which dead-ended
 * phase 4 — its Run only ever played an animation, so there was nothing to disable and
 * no way left to advance.
 */
export function RunBar({
  locale,
  onRun,
  label,
  notice,
  disabledReason,
  busy,
  secondary,
}: {
  locale: Locale;
  onRun: () => void;
  label?: string;
  notice?: string;
  disabledReason?: string;
  busy?: boolean;
  /** Hint, reset — actions that belong beside Run without competing with it. */
  secondary?: ReactNode;
}) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  return (
    <div className={styles.runBar}>
      <motion.button
        type="button"
        className={styles.runButton}
        onClick={onRun}
        disabled={Boolean(disabledReason) || busy}
        whileTap={reduced ? undefined : { scale: 0.98 }}
      >
        <span aria-hidden="true">▸</span>
        {busy ? (ar ? "بيشتغل…" : "Running…") : label || (ar ? "شغّل الكود" : "Run code")}
      </motion.button>
      <kbd className={styles.shortcut} dir="ltr" lang="en">Ctrl + Enter</kbd>
      {secondary}
      {(disabledReason || notice) && (
        <p className={styles.runNotice} role="note">{disabledReason || notice}</p>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- 4. understand

/**
 * Phase 4 runs nothing. The student presses Run and watches the bakery work — the code
 * is already finished and correct, and the point is to connect it to the world. So this
 * phase is complete without the Python runner, and its Run must never be disabled for
 * want of one.
 */
export function UnderstandPhase({
  phase,
  locale,
  onRun,
  hasRun,
  onContinue,
}: {
  phase: PhaseUnderstand;
  locale: Locale;
  onRun: () => void;
  hasRun: boolean;
  onContinue: () => void;
}) {
  const ar = locale === "ar-EG";

  return (
    <div className={styles.workspaceBody}>
      {phase.introAr && <p className={styles.intro} dir={ar ? "rtl" : "ltr"}>{phase.introAr}</p>}

      <CodeEditor value={phase.code} readOnly onRun={onRun} ariaLabel={ar ? "كود المهمة، للقراءة فقط" : "Mission code, read only"} />

      {phase.annotations?.length ? (
        <ol className={styles.annotations}>
          {phase.annotations.map((note) => (
            <li key={`${note.line}-${note.textAr}`}>
              <span className={styles.lineChip} dir="ltr" lang="en">{ar ? `سطر ${note.line}` : `line ${note.line}`}</span>
              <span dir={ar ? "rtl" : "ltr"}>{note.textAr}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <RunBar locale={locale} onRun={onRun} label={phase.runLabelAr || undefined} />

      {hasRun && (
        <button type="button" className={styles.primaryAction} onClick={onContinue}>
          {ar ? "دوري أكتب" : "My turn to write"}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------- shared: run feedback

/**
 * What happened when their code ran.
 *
 * `docs/07` requires the UI to tell apart a syntax error, a runtime error, a timeout,
 * wrong output and a runner failure — a child who is already unsure is owed a different
 * sentence for each, not a generic "failed". `docs/design.md` section 9 fixes the tone:
 * "Something doesn't look right yet", soft surface, never an alarm-red panel.
 */
function RunFeedback({ result, locale }: { result: RunResult | null; locale: Locale }) {
  const ar = locale === "ar-EG";
  if (!result) return null;

  if (result.outcome === "OK" && result.allPassed) {
    return <p className={styles.good} role="status" dir={ar ? "rtl" : "ltr"}>{ar ? "كل الاختبارات نجحت!" : "Every test passed!"}</p>;
  }

  const headline =
    result.outcome === "SYNTAX_ERROR" ? (ar ? "في حاجة في الكتابة نفسها." : "Something in the way it is written.")
    : result.outcome === "RUNTIME_ERROR" ? (ar ? "الكود وقف وهو بيشتغل." : "The code stopped while running.")
    : result.outcome === "TIMEOUT" ? (ar ? "الكود فضل شغال من غير ما يخلص." : "The code kept running and never finished.")
    : result.outcome === "RUNNER_ERROR" ? (ar ? "مشغّل بايثون مش جاهز." : "The Python runner is not ready.")
    : (ar ? "لسه مش مظبوط." : "Not quite right yet.");

  return (
    <div className={styles.problem} role="status" dir={ar ? "rtl" : "ltr"}>
      <strong>{headline}</strong>
      {result.error && <code className={styles.errorLine} dir="ltr" lang="en">{result.error}</code>}
      {result.stdout.trim() && (
        <pre className={styles.stdout} dir="ltr" lang="en">{result.stdout.trim()}</pre>
      )}
    </div>
  );
}

/** The hint currently on screen, with which rung it came from. */
function HintNote({ hint, locale }: { hint: { text: string; rung: number } | null; locale: Locale }) {
  const ar = locale === "ar-EG";
  if (!hint) return null;
  return (
    <p className={styles.hint} role="note" dir={ar ? "rtl" : "ltr"}>
      <span className={styles.hintRung}>{ar ? `تلميح ${hint.rung} من ٤` : `Hint ${hint.rung} of 4`}</span>
      {hint.text}
    </p>
  );
}

export type RunCode = (source: string, tests: MissionTest[]) => Promise<RunResult>;
/**
 * Ask for a hint about a specific place in the mission.
 *
 * The extra arguments are not optional decoration: the AI service rations the ladder by
 * phase — `ADAPT_REMIX` starts a rung higher because the student has already seen this
 * code work — and aims the hint at one guided step, so a hint for step 2 does not talk
 * about step 1. Without them every hint arrived as "first attempt, step 1".
 */
export type RequestHint = (
  code: string,
  lastResult: LastResult,
  where: { phase: Phase; guidedStep?: number | null; errorText?: string | null },
) => Promise<{ text: string; rung: number } | null>;
export type LastResult = "PASSED" | "FAILED" | "ERROR" | "TIMEOUT" | null;

const lastResultOf = (result: RunResult | null): LastResult => {
  if (!result) return null;
  if (result.allPassed) return "PASSED";
  if (result.outcome === "TIMEOUT") return "TIMEOUT";
  if (result.outcome === "SYNTAX_ERROR" || result.outcome === "RUNTIME_ERROR") return "ERROR";
  return "FAILED";
};

// ------------------------------------------------------------------------ 5. guided

export function GuidedPhase({
  phase,
  locale,
  runCode,
  requestHint,
  runnerBusy,
  onSolved,
  onContinue,
}: {
  phase: PhaseGuided;
  locale: Locale;
  runCode: RunCode;
  requestHint: RequestHint;
  runnerBusy: boolean;
  onSolved: (code: string) => void;
  onContinue: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = phase.steps[index];
  if (!step) return null;

  return (
    // Keyed on the step so advancing remounts: the editor content, the result and the
    // hint all reset because the component is new, not because an effect cleared them.
    // React 19 rejects the effect version, and this one cannot drift.
    <GuidedStepView
      key={index}
      step={step}
      index={index}
      total={phase.steps.length}
      tests={phase.tests}
      locale={locale}
      runCode={runCode}
      requestHint={requestHint}
      runnerBusy={runnerBusy}
      onSolved={onSolved}
      onNext={() => (index === phase.steps.length - 1 ? onContinue() : setIndex((n) => n + 1))}
      isLast={index === phase.steps.length - 1}
    />
  );
}

function GuidedStepView({
  step, index, total, tests, locale, runCode, requestHint, runnerBusy, onSolved, onNext, isLast,
}: {
  step: GuidedStep;
  index: number;
  total: number;
  tests: MissionTest[];
  locale: Locale;
  runCode: RunCode;
  requestHint: RequestHint;
  runnerBusy: boolean;
  onSolved: (code: string) => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const ar = locale === "ar-EG";
  const [code, setCode] = useState(step.code);
  const [result, setResult] = useState<RunResult | null>(null);
  const [hint, setHint] = useState<{ text: string; rung: number } | null>(null);
  const [asking, setAsking] = useState(false);

  const solved = Boolean(result?.allPassed);

  async function check() {
    // A blank left in place is not a syntax error worth a traceback — it is the one
    // thing this phase is asking them to do, so say that instead.
    if (code.includes("___")) {
      setResult({
        outcome: "SYNTAX_ERROR", cases: [], stdout: "", allPassed: false, durationMs: 0,
        error: ar ? "لسه في فراغ مش متملي (___)" : "there is still a blank (___) to fill",
      });
      return;
    }
    const next = await runCode(code, tests);
    setResult(next);
    if (next.allPassed) onSolved(code);
  }

  async function askForHint() {
    setAsking(true);
    try {
      setHint(await requestHint(code, lastResultOf(result), {
        phase: "GUIDED_CODING",
        // The step they are on, so the hint is about this blank and not an earlier one.
        guidedStep: index,
        errorText: result?.error ?? null,
      }));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className={styles.workspaceBody}>
      <div className={styles.stepHeader}>
        <span className={styles.roundCount}>{ar ? `خطوة ${index + 1} من ${total}` : `Step ${index + 1} of ${total}`}</span>
        <p dir={ar ? "rtl" : "ltr"}>{step.promptAr}</p>
      </div>

      <CodeEditor
        value={code}
        onChange={(next) => { setCode(next); setResult(null); }}
        onRun={check}
        ariaLabel={ar ? "اكتب الكود هنا" : "Write your code here"}
      />

      <RunBar
        locale={locale}
        onRun={check}
        label={ar ? "شغّل" : "Run"}
        busy={runnerBusy}
        secondary={
          <button type="button" className={styles.ghostAction} onClick={askForHint} disabled={asking}>
            {asking ? (ar ? "بيفكر…" : "Thinking…") : ar ? "محتاج تلميح" : "I need a hint"}
          </button>
        }
      />

      <HintNote hint={hint} locale={locale} />
      <RunFeedback result={result} locale={locale} />

      {solved && (
        <button type="button" className={styles.primaryAction} onClick={onNext}>
          {isLast ? (ar ? "كمّل" : "Continue") : (ar ? "الخطوة اللي بعدها" : "Next step")}
        </button>
      )}

      <TestList tests={tests} locale={locale} results={result?.cases} />
    </div>
  );
}

// ------------------------------------------------------------------------- 6. remix

export function RemixPhase({
  phase, locale, runCode, requestHint, runnerBusy, onSolved, onFinish,
}: {
  phase: PhaseRemix;
  locale: Locale;
  runCode: RunCode;
  requestHint: RequestHint;
  runnerBusy: boolean;
  onSolved: (code: string) => void;
  onFinish: () => void;
}) {
  const ar = locale === "ar-EG";
  // Their working code from phase 5, deliberately not reset — that is what makes this
  // feel like the world moved rather than a new exercise arriving.
  const [code, setCode] = useState(phase.startingCode);
  const [result, setResult] = useState<RunResult | null>(null);
  const [hint, setHint] = useState<{ text: string; rung: number } | null>(null);
  const [asking, setAsking] = useState(false);

  const solved = Boolean(result?.allPassed);

  async function check() {
    const next = await runCode(code, phase.tests);
    setResult(next);
    if (next.allPassed) onSolved(code);
  }

  async function askForHint() {
    setAsking(true);
    try {
      // No step: the remix is one edit to code they already have working. The service
      // starts this phase's ladder at rung 2 for that reason.
      setHint(await requestHint(code, lastResultOf(result), {
        phase: "ADAPT_REMIX",
        guidedStep: null,
        errorText: result?.error ?? null,
      }));
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className={styles.workspaceBody}>
      <div className={styles.twist}>
        <span className={styles.conceptEyebrow}>{ar ? "الدنيا اتغيرت" : "The world changed"}</span>
        <p className={styles.twistLine} dir={ar ? "rtl" : "ltr"}>{phase.twistAr}</p>
        <p dir={ar ? "rtl" : "ltr"}>{phase.newRequirementAr}</p>
      </div>

      <CodeEditor
        value={code}
        onChange={(next) => { setCode(next); setResult(null); }}
        onRun={check}
        ariaLabel={ar ? "عدّل الكود هنا" : "Adapt your code here"}
      />

      <RunBar
        locale={locale}
        onRun={check}
        label={ar ? "شغّل" : "Run"}
        busy={runnerBusy}
        secondary={
          <>
            <button type="button" className={styles.ghostAction} onClick={askForHint} disabled={asking}>
              {asking ? (ar ? "بيفكر…" : "Thinking…") : ar ? "محتاج تلميح" : "I need a hint"}
            </button>
            <button
              type="button"
              className={styles.ghostAction}
              onClick={() => { setCode(phase.startingCode); setResult(null); }}
            >
              {ar ? "رجّع الكود" : "Reset code"}
            </button>
          </>
        }
      />

      <HintNote hint={hint} locale={locale} />
      <RunFeedback result={result} locale={locale} />

      {solved && (
        <button type="button" className={styles.primaryAction} onClick={onFinish}>
          {ar ? "خلّصت المهمة" : "Finish mission"}
        </button>
      )}

      <TestList tests={phase.tests} locale={locale} results={result?.cases} />
    </div>
  );
}
