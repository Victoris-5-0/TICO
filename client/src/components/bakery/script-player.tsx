"use client";

/**
 * Plays an authored bakery script: the opening tour, and mission one.
 *
 * One component for both, on purpose. A mission should look like the world the child was
 * just shown round — same shop, same people, speech over their heads, things they click —
 * not a picture parked beside a panel of text. The only thing a mission adds is a stop
 * where they type.
 *
 * ## Who stands where
 *
 * Hassan is in the shop, because he works there. Mariam walks in off the street. TICO is
 * neither: he lives in a rail beside the picture, so the bakery stays a bakery instead of
 * a bakery with a robot parked in front of the till.
 *
 * The camera never moves. One wide view, every prop on it from the first frame, and
 * pointing at something is done by lighting it up.
 *
 * ## No effects drive anything
 *
 * A `watch` stop fires its action the moment it is entered — and a stop is entered by a
 * click, which is an event, so the dispatch lives in `go` and never in a render. Whether
 * the bakery has finished is read off `isBusy`. The shop's own facts (sign turned, sacks
 * left) are derived by scanning the script up to the current stop, so stepping backwards
 * rewinds them with no undo history to get wrong.
 *
 * ## The typing step
 *
 * `boundValue` reads the variable straight out of the editor text on every keystroke and
 * hands the number to the tray, so the bread changes as they type — before Run, before any
 * Python has run. Run then executes it for real in the Pyodide worker. If that worker
 * never came up, the parsed value is accepted instead: a child who typed the right answer
 * should not be held hostage by a 6 MB download that failed.
 */

import Link from "next/link";
import { AnimatePresence, motion, useAnimationFrame, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";

import { CodeEditor } from "@/components/mission-player/code-editor";
import type { Locale } from "@/i18n/config";
import { bakeryScene, frame, propAssetUrls, sceneAssetUrls, worldPropNames } from "@/lib/bakery/scene-manifest";
import { boundValue, worldAt, type Script } from "@/lib/bakery/script";
import { bakeryReducer, initialBakeryState, isBusy, phaseProgress, type CustomerId } from "@/lib/bakery/simulation";
import { propName } from "@/lib/bakery/world-tour";
import * as telemetry from "@/lib/mission/telemetry";
import { usePythonRunner } from "@/lib/runner/use-python-runner";
import { BakeryScene } from "./scene";
import styles from "./world-tour.module.css";

const POSE = {
  neutral: "/assets/characters/tico/tico-neutral.webp",
  thinking: "/assets/characters/tico/tico-thinking.webp",
  determined: "/assets/characters/tico/tico-determined.webp",
  celebrating: "/assets/characters/tico/tico-celebrating.webp",
} as const;

/**
 * Who is drawn in the shop. Module constants so the identity is stable across renders.
 *
 * The queue always holds all eight customers, because the reducer refuses to bake with
 * nobody waiting — `cast` decides who is actually on stage.
 */
const NOBODY: readonly CustomerId[] = [];
const MARIAM: readonly CustomerId[] = ["mariam"];

/**
 * Where each in-scene speaker's words appear, in the scene's own 1600×900 coordinates.
 * Both sit just clear of the top of a head, centred on their speaker — which is why the
 * bubble's tail is centred and needs no aiming.
 */
const SCENE_BUBBLE = {
  hassan: { x: bakeryScene.baker.x, y: 424 },
  mariam: { x: bakeryScene.queue.first.x, y: 546 },
} as const;

/** The note panel hangs under the order sheet, which is what it is a copy of. */
const NOTE_AT = { x: 1200, y: 486 };

const percentX = (x: number) => `${(x / 1600) * 100}%`;
const percentY = (y: number) => `${(y / 900) * 100}%`;
const percentUp = (y: number) => `${((900 - y) / 900) * 100}%`;

const COPY = {
  ar: {
    next: "كمّل", skip: "عدّي", replay: "من الأول", working: "استنى شوية…",
    loading: "بنجهّز الفرن…", failed: "في صور متحمّلتش. جرّب تاني.", retry: "حاول تاني",
    tico: "تيكو", hassan: "عم حسن", mariam: "مدام مريم",
    press: (thing: string) => `اضغط على ${thing}`,
    waiting: "مستنيك…",
    till: "الخزنة", pounds: "جنيه", note: "ورقة الطلبات", sacks: "شوالات الدقيق",
    open: "مفتوح", closed: "مقفول", sign: "اليافطة",
    run: "شغّل الكود", running: "بشغّل…", again: "جرّب تاني",
    wrong: "مش كده بالظبط. فكّر تاني.",
    mismatch: (want: number) => `الرقم لسه مش مظبوط. الطلب ${want}.`,
    preparing: "بنجهّز بايثون…",
    editorLabel: "اكتب الكود هنا",
  },
  en: {
    next: "Next", skip: "Skip", replay: "Start over", working: "One moment…",
    loading: "Getting the bakery ready…", failed: "Some images could not load. Please retry.", retry: "Retry",
    tico: "TICO", hassan: "Am Hassan", mariam: "Madam Mariam",
    press: (thing: string) => `Press ${thing}`,
    waiting: "Waiting for you…",
    till: "The till", pounds: "EGP", note: "Order sheet", sacks: "Flour sacks",
    open: "OPEN", closed: "CLOSED", sign: "the sign",
    run: "Run the code", running: "Running…", again: "Try again",
    wrong: "Not quite. Have another think.",
    mismatch: (want: number) => `That number isn't right yet — the order is ${want}.`,
    preparing: "Starting Python…",
    editorLabel: "Write your code here",
  },
} as const;

const subscribeToHydration = () => () => {};

/**
 * The six rungs, in the order the learning flow fixes them, for reporting progress.
 * A script with no `phase` on its stops — the tour — simply reports nothing.
 */
const RUNGS = ["encounter", "explore", "discover", "understand", "guided", "remix"] as const;

export function ScriptPlayer({ locale, script, finishHref, finishLabel, session }: {
  locale: Locale;
  script: Script;
  finishHref: string;
  finishLabel: { ar: string; en: string };
  /**
   * The mission row this play belongs to. Given, the script reports phases and finishes
   * the session exactly as the old player did, so progress and lesson credit are
   * unchanged — only the rendering is different. Omitted for the tour, which is not a
   * mission and credits nothing.
   */
  session?: { generatedMissionId: string; lessonId?: string | null };
}) {
  const ar = locale === "ar-EG";
  const t = ar ? COPY.ar : COPY.en;
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const motionPreference = useReducedMotion();
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const reduced = hydrated && Boolean(motionPreference);

  const [state, dispatch] = useReducer(bakeryReducer, undefined, initialBakeryState);
  const [assets, setAssets] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState("");
  const [verdict, setVerdict] = useState<"idle" | "running" | "wrong">("idle");
  const [missed, setMissed] = useState(false);

  const runner = usePythonRunner();
  const sessionId = useRef<string | null>(null);
  const reported = useRef(-1);
  const lastFrame = useRef<number | null>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);

  const stop = script[step];
  const finished = step >= script.length - 1;
  const busy = isBusy(state);
  const shop = useMemo(() => worldAt(script, step), [script, step]);

  const waitingOnClick = stop.kind === "ask";
  const watching = stop.kind === "watch" && busy;
  const typing = stop.kind === "code";
  const choosing = stop.kind === "choose";
  const encounter = script.some((item) => item.action === "arrive")
    && step >= script.findIndex((item) => item.action === "arrive");

  // The live binding: what the tray shows while they type, before Run has ever happened.
  const typed = typing && stop.code
    ? boundValue(stop.code.readOnly ? stop.code.starter : source, stop.code.binding)
    : null;

  useEffect(() => {
    let cancelled = false;
    const urls = [...sceneAssetUrls(), ...propAssetUrls(worldPropNames), ...Object.values(POSE), frame("banknotes")];
    Promise.all(urls.map((src) => new Promise<void>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => img.decode().then(resolve, reject);
      img.onerror = reject;
      img.src = src;
    }))).then(() => { if (!cancelled) setAssets("ready"); }, () => { if (!cancelled) setAssets("error"); });
    return () => { cancelled = true; };
  }, [retry]);

  // One session per play, opened against the mission row the lesson resolved to.
  useEffect(() => {
    if (!session) return;
    let live = true;
    telemetry.startSession(session).then((id) => { if (live) sessionId.current = id; });
    return () => { live = false; };
  }, [session]);

  useEffect(() => {
    const onVisibility = () => dispatch({ type: "visibility", hidden: document.hidden });
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => { lastFrame.current = null; }, [state.paused, state.hidden, assets]);

  const advanceClock = useCallback((time: number) => {
    const previous = lastFrame.current;
    lastFrame.current = time;
    if (assets === "ready" && previous !== null) dispatch({ type: "tick", ms: time - previous });
  }, [assets]);
  useAnimationFrame(advanceClock);

  /**
   * Tell the server which rung they reached, once per rung.
   *
   * Called from the same click that advances rather than from an effect watching `step`,
   * which is the rule this whole component follows: a stop is entered by a gesture.
   */
  const report = useCallback((index: number) => {
    const rung = RUNGS.indexOf(script[index]?.phase as (typeof RUNGS)[number]);
    if (rung < 0 || rung <= reported.current) return;
    reported.current = rung;
    telemetry.reportPhase(sessionId.current, rung);
  }, [script]);

  /**
   * Move to a stop, and set the bakery going if that stop is one that acts.
   *
   * The only place an animation starts. A `serve` carries the number the child actually
   * typed, so what leaves the tray is their answer rather than a constant.
   */
  const go = useCallback((next: number) => {
    moved.current = true;
    const target = Math.min(Math.max(next, 0), script.length - 1);
    const entering = script[target];
    switch (entering.action) {
      case "arrive": dispatch({ type: "arrive" }); break;
      case "bake": dispatch({ type: "bake" }); break;
      case "leave": dispatch({ type: "leave" }); break;
      case "serve": {
        // Whatever the last code stop settled on, priced per loaf.
        const ordered = [...script].slice(0, target).reverse().find((item) => item.code)?.code?.answer ?? 2;
        dispatch({ type: "serve", count: ordered, price: ordered * 5 });
        break;
      }
    }
    // The editor keeps whatever a code stop starts it with, and a remix deliberately keeps
    // the line they already wrote — that is what makes it read as the world moving.
    if (entering.code) setSource((current) => (current.trim() ? current : entering.code!.starter));
    setVerdict("idle");
    setMissed(false);
    setStep(target);
    report(target);
  }, [script, report]);

  const forward = useCallback(() => go(step + 1), [go, step]);


  useEffect(() => {
    if (moved.current) lineRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (ar ? event.key === "ArrowLeft" : event.key === "ArrowRight") {
        if (!waitingOnClick && !watching && !typing && !choosing) forward();
        return;
      }
      moved.current = true;
      setStep((current) => Math.max(current - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ar, waitingOnClick, watching, typing, choosing, forward]);

  /**
   * Run their code for real, and move on only if it is right.
   *
   * Pyodide is the judge when it is up. When it is not, the parsed value is — a child who
   * typed the right answer should not be blocked by a download that failed, and this
   * mission's whole program is one assignment, which a regex can check honestly.
   */
  const runCode = useCallback(async () => {
    const step_ = stop.code;
    if (!step_ || verdict === "running") return;
    setVerdict("running");

    const text = step_.readOnly ? step_.starter : source;
    if (runner.state === "failed" || runner.state === "loading") {
      const ok = boundValue(text, step_.binding) === step_.answer;
      if (ok) { forward(); return; }
      setVerdict("wrong");
      return;
    }

    const result = await runner.run({ source: text, cases: [...step_.tests] });
    if (result.allPassed) { forward(); return; }
    setVerdict("wrong");
  }, [stop, source, verdict, runner, forward]);

  const answer = useCallback((correct: boolean) => {
    if (correct) forward();
    else setMissed(true);
  }, [forward]);

  const speaker = stop.speaker;
  // Typing and answering both need room the rail does not have, so those stops dock across
  // the pavement at the bottom of the scene instead. The counter and the tray stay above
  // it, uncovered — which matters, because watching the tray is the point of the binding.
  const docked = typing || choosing;
  const paying = state.phase === "paying";
  const note = stop.note;

  const bubble = (
    <AnimatePresence mode="wait">
      <motion.div
        key={stop.id}
        className={styles.bubble}
        data-speaker={speaker}
        initial={reduced ? false : { opacity: 0, y: 8, scale: .97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: .98 }}
        transition={{ duration: reduced ? 0 : .22 }}
        dir={ar ? "rtl" : "ltr"}
      >
        <span className={styles.who}>{t[speaker]}</span>
        <p className={styles.line} ref={lineRef} tabIndex={-1} aria-live="polite">{ar ? stop.ar : stop.en}</p>

        {choosing && stop.answers ? (
          <>
            <ul className={styles.answers}>
              {stop.answers.map((option) => (
                <li key={option.en}>
                  <button type="button" onClick={() => answer(Boolean(option.correct))}>{ar ? option.ar : option.en}</button>
                </li>
              ))}
            </ul>
            {missed && <span className={styles.waiting}>{t.wrong}</span>}
          </>
        ) : typing && stop.code ? (
          <div className={styles.editor}>
            <CodeEditor
              value={stop.code.readOnly ? stop.code.starter : source}
              onChange={stop.code.readOnly ? undefined : setSource}
              readOnly={stop.code.readOnly}
              onRun={runCode}
              ariaLabel={t.editorLabel}
              minHeight={72}
            />
            <div className={styles.actions}>
              {verdict === "wrong" && <span className={styles.waiting}>{t.mismatch(stop.code.answer)}</span>}
              <button type="button" className={styles.primary} onClick={runCode} disabled={verdict === "running"}>
                {verdict === "running" ? t.running : runner.state === "loading" ? t.preparing : verdict === "wrong" ? t.again : t.run}
              </button>
            </div>
          </div>
        ) : waitingOnClick ? (
          <span className={styles.waiting}>{t.waiting}</span>
        ) : watching ? (
          <span className={styles.waiting}>{t.working}</span>
        ) : finished ? (
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={() => { moved.current = true; dispatch({ type: "reset" }); setSource(""); setStep(0); }}>{t.replay}</button>
            <Link className={styles.primary} href={finishHref} onClick={() => { void telemetry.finishSession(sessionId.current); }}>
              {ar ? finishLabel.ar : finishLabel.en}
            </Link>
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={forward}>{t.next}</button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <section className={styles.tour} aria-label={ar ? "فرن عم حسن" : "Am Hassan's bakery"} data-ready={assets} data-speaker={speaker} data-phase={stop.phase} dir={ar ? "rtl" : "ltr"}>
      <div className={styles.rail}>
        <div className={styles.railBubble}>{speaker === "tico" && !docked ? bubble : null}</div>
        <motion.img
          className={styles.tico}
          src={POSE[stop.pose ?? "neutral"]}
          alt={t.tico}
          animate={reduced ? undefined : { y: speaker === "tico" ? -5 : 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 14 }}
        />
      </div>

      <div className={styles.stage} dir="ltr">
        <BakeryScene
          state={state}
          reducedMotion={reduced}
          counterView={false}
          cast={encounter ? MARIAM : NOBODY}
          loose={worldPropNames}
          highlight={stop.look ? [stop.look] : undefined}
          pickable={waitingOnClick && !busy ? stop.look : undefined}
          onPick={forward}
          pickLabel={(name) => t.press(name === "sign" ? t.sign : propName(name, ar))}
          sign={{ open: shop.open, label: shop.open ? t.open : t.closed }}
          sacks={shop.sacks}
          preview={typed}
          label={ar ? "فرن عم حسن من جوّه: فرن طوب، كاونتر طويل عليه الخزنة والميزان، وشوالات دقيق ورا." : "Inside Am Hassan's bakery: a brick oven, a long counter with the till and the scale, and flour sacks behind."}
        />

        {docked ? (
          <div className={styles.dock}>{bubble}</div>
        ) : speaker !== "tico" ? (
          <div className={styles.inScene} style={{ left: percentX(SCENE_BUBBLE[speaker].x), bottom: percentUp(SCENE_BUBBLE[speaker].y) }}>
            {bubble}
          </div>
        ) : null}

        {/* The things the picture cannot act out. A box with the number written in it is
            the only honest way to show "seven loaves" or "thirty-five pounds", and the
            child is meant to watch them change. */}
        {note && (
          <div className={styles.note} style={{ left: percentX(NOTE_AT.x), top: percentY(NOTE_AT.y) }} dir={ar ? "rtl" : "ltr"}>
            <span>{t.note}</span>
            <strong>{ar ? note.ar : note.en}</strong>
          </div>
        )}

        {encounter && (
          <div className={styles.till} dir={ar ? "rtl" : "ltr"} aria-live="polite">
            <span>{t.till}</span>
            <strong>{number.format(state.money)} <small>{t.pounds}</small></strong>
            {paying && (
              <motion.em
                className={styles.gain}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: reduced ? 0 : -10 * phaseProgress(state) }}
              >
                +{number.format(state.charge)}
              </motion.em>
            )}
          </div>
        )}

        {!finished && (
          <button type="button" className={styles.skip} onClick={() => { moved.current = true; setStep(script.length - 1); }}>
            {t.skip}
          </button>
        )}

        <span className={styles.progress} role="img" aria-label={`${step + 1} / ${script.length}`}>
          <span style={{ inlineSize: `${((step + 1) / script.length) * 100}%` }} />
        </span>

        {assets !== "ready" && (
          <div className={styles.loading}>
            {assets === "loading" ? t.loading : t.failed}
            {assets === "error" && (
              <button type="button" onClick={() => { setAssets("loading"); setRetry((n) => n + 1); }}>{t.retry}</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
