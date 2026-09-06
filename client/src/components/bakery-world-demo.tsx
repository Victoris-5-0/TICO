"use client";
import Image from "next/image";
import { motion, useAnimationFrame, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { BakeryScene } from "./bakery/scene";
import { sceneAssetUrls } from "@/lib/bakery/scene-manifest";
import { bakeryReducer, initialBakeryState, isBusy, readyLoaves, type Phase } from "@/lib/bakery/simulation";
import styles from "./bakery/bakery.module.css";

export function BakeryWorldDemo({ locale }: { locale: Locale }) {
  const ar = locale === "ar-EG";
  const reduced = Boolean(useReducedMotion());
  const [state, dispatch] = useReducer(bakeryReducer, undefined, initialBakeryState);
  const [assets, setAssets] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [counterView, setCounterView] = useState(false);
  const lastFrame = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all(sceneAssetUrls().map((src) => new Promise<void>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => img.decode().then(resolve, reject);
      img.onerror = reject;
      img.src = src;
    }))).then(() => { if (!cancelled) setAssets("ready"); }, () => { if (!cancelled) setAssets("error"); });
    return () => { cancelled = true; };
  }, [retry]);
  useEffect(() => {
    const onVisibility = () => dispatch({ type: "visibility", hidden: document.hidden });
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => { lastFrame.current = null; }, [state.paused, state.hidden, assets]);
  const advance = useCallback((time: number) => {
    const previous = lastFrame.current;
    lastFrame.current = time;
    if (assets === "ready" && previous !== null) dispatch({ type: "tick", ms: time - previous });
  }, [assets]);
  useAnimationFrame(advance);
  const copy: Record<Phase, string> = ar ? {
    idle: "الصينية جاهزة! قدّم العيش لأول واحد في الطابور.", loading: "حسن بيحط العجين في الفرن بالمِطرحة.", baking: "العيش البلدي بيستوي جوّه الفرن.", retrieving: "حسن بيطلّع العيش السخن بالمِطرحة.", stocking: "من المِطرحة للصينية… الدفعة جاهزة!", handover: "رغيفين لأول واحد في الطابور، بالترتيب.", exiting: "العيش في الشنطة، والزبون يكمّل يومه.", advancing: "الطابور بيتقدّم خطوة. مين عليه الدور؟", complete: "كل الـ٨ خدوا العيش! دفعتين، ١٦ رغيف، بالترتيب.",
  } : {
    idle: "The tray is ready. Serve the first person in the queue.", loading: "Hassan slides the dough into the oven with his peel.", baking: "The baladi bread is baking inside the oven.", retrieving: "Hassan brings the warm bread out on his peel.", stocking: "From the peel to the tray. A fresh batch is ready!", handover: "Two loaves for the first customer. Everyone gets a turn.", exiting: "Bread in the bag, and on with their day.", advancing: "The queue takes a step forward. Who is next?", complete: "All 8 served! Two batches, 16 loaves, one orderly queue.",
  };
  const stock = readyLoaves(state).length;
  const busy = isBusy(state);
  const unavailable = assets !== "ready" || busy || state.phase === "complete";
  const message = assets === "loading" ? (ar ? "بنجهّز الفرن…" : "Getting the bakery ready…") : assets === "error" ? (ar ? "بعض الصور متحمّلتش. جرّب تاني." : "Some scene assets could not load. Please retry.") : state.paused || state.hidden ? (ar ? "المشهد متوقف. كمّل لما تكون جاهز." : "The bakery is paused. Continue when you are ready.") : state.notice === "welcome" ? (ar ? "صباح الخير! ٨ في الطابور. نخبز أول دفعة؟" : "Sabah el kheir! Eight people are waiting. Shall we bake the first batch?") : state.notice === "empty" ? (ar ? "الصينية فاضية. اخبز دفعة الأول." : "The tray is empty. Bake a batch first.") : state.notice === "full" ? (ar ? "قدّم العيش اللي في الصينية الأول." : "Serve the bread on the tray before baking again.") : copy[state.phase];
  const format = new Intl.NumberFormat(locale);
  return <section className={styles.preview} aria-label={ar ? "معاينة الفرن" : "Bakery preview"} data-testid="bakery-preview" data-ready={assets}>
    <div className={styles.topbar}>
      <span className={styles.location}><span aria-hidden="true">◉</span> {ar ? "الفرن · صباح جديد" : "EL FORN · A NEW MORNING"}</span>
      <div className={styles.views} aria-label={ar ? "زاوية العرض" : "Scene view"}>
        <button type="button" aria-pressed={!counterView} onClick={() => setCounterView(false)}>{ar ? "المشهد كامل" : "Full scene"}</button>
        <button type="button" aria-pressed={counterView} onClick={() => setCounterView(true)}>{ar ? "الكاونتر" : "Counter"}</button>
      </div>
    </div>
    <div className={`${styles.stage} ${counterView ? styles.counterView : ""}`} dir="ltr">
      <BakeryScene state={state} reducedMotion={reduced} counterView={counterView} label={ar ? "فرن عيش بلدي مصري: حسن بيخبز ويقدّم العيش، والزبائن واقفين في طابور منظم." : "An Egyptian baladi bakery: Hassan bakes and serves bread to an orderly queue."} />
      {assets !== "ready" && <div className={styles.loading}>{message}{assets === "error" && <button type="button" onClick={() => { setAssets("loading"); setRetry((n) => n + 1); }}>{ar ? "حاول تاني" : "Retry assets"}</button>}</div>}
      {(state.paused || state.hidden) && <span className={styles.paused}>{ar ? "متوقف" : "Paused"}</span>}
    </div>
    <div className={styles.desk}>
      <div className={styles.companion}>
        <Image src="/assets/characters/tico/tico-neutral.webp" alt="" width={421} height={734} sizes="52px" />
        <div><strong>{ar ? "تيكو معاك" : "Tico’s bakery notebook"}</strong><p role="status" aria-live="polite" aria-atomic="true">{message}</p></div>
      </div>
      <dl className={styles.stats} aria-label={ar ? "حالة الفرن" : "Bakery inventory"}>
        <div><dt>{ar ? "رغيف جاهز" : "Loaves ready"}</dt><dd data-testid="stock">{format.format(stock)}</dd></div>
        <div><dt>{ar ? "في الطابور" : "Waiting"}</dt><dd data-testid="waiting">{format.format(state.queue.length)}</dd></div>
        <div><dt>{ar ? "اتقدّم لهم" : "Served"}</dt><dd data-testid="served" dir="ltr">{format.format(state.served.length)}<small> / {format.format(8)}</small></dd></div>
      </dl>
      <div className={styles.controls}>
        <motion.button whileTap={reduced ? undefined : { scale: .98 }} className={!stock && !unavailable ? styles.primary : ""} disabled={unavailable} onClick={() => dispatch({ type: "bake" })}>{ar ? "اخبز دفعة" : "Bake batch"}<small>{ar ? "٨ أرغفة" : "8 loaves"}</small></motion.button>
        <motion.button whileTap={reduced ? undefined : { scale: .98 }} className={stock && !unavailable ? styles.primary : ""} disabled={unavailable} onClick={() => dispatch({ type: "serve" })}>{ar ? "قدّم للي عليه الدور" : "Serve next"}<small>{ar ? "رغيفين" : "2 loaves"}</small></motion.button>
        <button disabled={unavailable} onClick={() => dispatch({ type: "demo" })}>{ar ? "شغّل العرض" : "Play demo"}<small>{ar ? "شوف الدورة كاملة" : "Watch the full cycle"}</small></button>
        <button disabled={!busy || assets !== "ready"} onClick={() => dispatch({ type: "pause" })}>{state.paused ? (ar ? "كمّل" : "Resume") : (ar ? "وقّف مؤقتًا" : "Pause")}</button>
        <button onClick={() => dispatch({ type: "reset" })}>{ar ? "ابدأ من جديد" : "Reset"}</button>
      </div>
    </div>
    <p className={styles.note}>{ar ? "معاينة تفاعلية للعالم، مش اختبار بايثون. الكميات في المشهد خيالية للتجربة." : "An interactive world preview, not a Python assessment. Quantities are fictional demo values."}{reduced && <> {ar ? "وضع تقليل الحركة مفعّل." : "Reduced motion is on."}</>}</p>
  </section>;
}
