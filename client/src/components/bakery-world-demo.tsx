"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import type { Locale } from "@/i18n/config";

type Plan = "idle" | "bakery" | "queue";
type Status = "idle" | "moving" | "arrived" | "queued" | "error";

const initialCode = `customer = Customer("Nour")
customer.move_to("bakery")
queue.join(customer)`;

const routes: Record<Plan, { left: string[]; top: string[] }> = {
  idle: { left: ["49%"], top: ["94%"] },
  bakery: {
    left: ["49%", "46%", "42%"],
    top: ["94%", "80%", "69%"],
  },
  queue: {
    left: ["49%", "46%", "42%", "38%", "47%", "55%", "62.5%"],
    top: ["94%", "80%", "69%", "60%", "58%", "58%", "58%"],
  },
};

export function BakeryWorldDemo({ locale }: { locale: Locale }) {
  const isArabic = locale === "ar-EG";
  const reduceMotion = useReducedMotion();
  const [code, setCode] = useState(initialCode);
  const [plan, setPlan] = useState<Plan>("idle");
  const [status, setStatus] = useState<Status>("idle");
  const [runId, setRunId] = useState(0);

  const copy = {
    prototype: isArabic ? "نموذج حركة للمشهد" : "Scene choreography prototype",
    objective: isArabic ? "الهدف: وصّل نور لآخر مكان فاضي في الطابور." : "Goal: move Nour into the last open queue position.",
    run: isArabic ? "عاين الحركة" : "Preview movement",
    reset: isArabic ? "ابدأ من جديد" : "Reset",
    idle: isArabic ? "عدّل الأوامر واضغط معاينة." : "Edit the commands, then preview them.",
    moving: isArabic ? "بنحوّل الأوامر لحركة داخل العالم…" : "Mapping commands to movement in the world…",
    arrived: isArabic ? "نور وصل للفرن، بس لسه مدخلش الطابور." : "Nour reached the bakery, but has not joined the queue yet.",
    queued: isArabic ? "تمام! نور وصل لمكانه في الطابور." : "Great! Nour reached his place in the queue.",
    error: isArabic ? "محتاج تستخدم customer.move_to(\"bakery\") الأول." : "Use customer.move_to(\"bakery\") first.",
    runnerNote: isArabic ? "المعاينة الحالية بتحرّك أوامر المشهد المسموح بها فقط. ربط Pyodide للتنفيذ الكامل هو الخطوة التالية." : "This preview maps only the allowlisted scene commands. Full Pyodide execution is the next integration step.",
  };

  function preview() {
    const hasMove = /customer\.move_to\(\s*["']bakery["']\s*\)/.test(code);
    const hasJoin = /queue\.join\(\s*customer\s*\)/.test(code);

    setRunId((value) => value + 1);
    if (!hasMove) {
      setPlan("idle");
      setStatus("error");
      return;
    }

    setPlan(hasJoin ? "queue" : "bakery");
    setStatus("moving");
  }

  function reset() {
    setRunId((value) => value + 1);
    setPlan("idle");
    setStatus("idle");
  }

  function completeMovement() {
    if (plan === "queue") setStatus("queued");
    if (plan === "bakery") setStatus("arrived");
  }

  return (
    <section className="game-demo" aria-label={isArabic ? "نموذج عالم الفرن" : "Bakery world prototype"}>
      <div className="game-demo__stage" dir="ltr">
        <Image className="game-demo__board" src="/assets/worlds/bakery/gameplay/playfield-topdown-v1.webp" alt={isArabic ? "ساحة لعب علوية لطابور فرن العيش" : "Top-down bakery queue playfield"} width={1600} height={900} priority />
        <div className="game-demo__target" aria-hidden="true" />

        <div className="game-actor game-actor--mariam">
          <Image src="/assets/characters/gameplay/mariam-queue-up-v1.webp" alt={isArabic ? "مريم واقفة في الطابور" : "Mariam waiting in the queue"} width={282} height={512} />
          <span>Mariam</span>
        </div>
        <div className="game-actor game-actor--salma">
          <Image src="/assets/characters/gameplay/salma-queue-up-v1.webp" alt={isArabic ? "سلمى بتنظّم الطابور" : "Salma coordinating the queue"} width={218} height={512} />
          <span>Salma</span>
        </div>

        <motion.div
          key={runId}
          className="game-player"
          initial={{ left: routes.idle.left[0], top: routes.idle.top[0] }}
          animate={{ left: routes[plan].left, top: routes[plan].top }}
          transition={{ duration: reduceMotion ? 0 : plan === "queue" ? 3.4 : plan === "bakery" ? 1.7 : 0, ease: "easeInOut", times: plan === "queue" ? [0, .16, .32, .48, .66, .83, 1] : undefined }}
          onAnimationComplete={completeMovement}
        >
          <div><Image src="/assets/characters/gameplay/nour-walk-up-v1.webp" alt={isArabic ? "نور، الشخصية اللي بتحركها" : "Nour, the controlled character"} width={203} height={512} priority /><span>Nour</span></div>
        </motion.div>

        {status === "moving" && <div className="game-demo__executing">{isArabic ? "جاري تحريك نور…" : "Moving Nour…"}</div>}
      </div>

      <aside className="game-demo__panel">
        <div className="prototype-chip"><span aria-hidden="true">◆</span>{copy.prototype}</div>
        <h2>{isArabic ? "الكود يغيّر العالم" : "Code changes the world"}</h2>
        <p>{copy.objective}</p>

        <div className="mini-editor" dir="ltr">
          <div className="mini-editor__bar"><span /><span /><span /><b>main.py</b></div>
          <textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label={isArabic ? "كود حركة نور" : "Nour movement code"} />
        </div>

        <div className={`game-result game-result--${status}`} role="status" aria-live="polite">
          <span aria-hidden="true">{status === "queued" ? "✓" : status === "error" ? "!" : status === "moving" ? "…" : "›_"}</span>
          <p>{copy[status]}</p>
        </div>

        <div className="game-demo__actions">
          <button className="button button--primary" type="button" onClick={preview} disabled={status === "moving"}>{copy.run}</button>
          <button className="button button--ghost" type="button" onClick={reset}>{copy.reset}</button>
        </div>
        <small>{copy.runnerNote}</small>
      </aside>
    </section>
  );
}
