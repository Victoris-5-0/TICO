"use client";

/**
 * TICO, permanently on the side of the progress page.
 *
 * Three states, one component, because they are the same character and swapping between
 * separate widgets would make him appear to teleport:
 *
 *   tour   he walks the panels on arrival and explains each one   (authored lines)
 *   dock   a small button pinned to the side                      (idle)
 *   chat   a conversation, streamed from the AI service           (a real model)
 *
 * Scoped to this page on purpose. It is being reviewed here before it goes anywhere else.
 *
 * ## The session
 *
 * `POST /v1/tico/messages` is built around a mission: it takes a `sessionId`, checks the
 * student owns it, and uses it as the LangGraph thread. There is no mission on this page,
 * so the chat attaches to the learner's most recent session — one they own, which the
 * ownership check will accept, and which gives the conversation somewhere to live.
 *
 * With no sessions at all he says so rather than failing. A child who has never played
 * has nothing to discuss yet, and a spinner that ends in an error is a worse answer than
 * a sentence.
 */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./tico-dock.module.css";
import { TOUR, type Stop } from "./tico-guide";

type Turn = { role: "tico" | "you"; text: string };

const POSE = {
  neutral: "/assets/characters/tico/tico-neutral.webp",
  thinking: "/assets/characters/tico/tico-thinking.webp",
  determined: "/assets/characters/tico/tico-determined.webp",
  celebrating: "/assets/characters/tico/tico-celebrating.webp",
} as const;

const COPY = {
  ar: {
    open: "اتكلم مع تيكو",
    title: "تيكو",
    subtitle: "اسألني عن أي رقم في الصفحة دي",
    placeholder: "اكتب سؤالك…",
    send: "ابعت",
    close: "اقفل",
    skip: "كفاية",
    next: "التالي",
    done: "تمام!",
    greeting: "أهلاً! اسألني عن أي حاجة في الصفحة دي — أو عن الكود لو عندك سؤال.",
    noSession: "لسه مخلّصتش أي مهمة، فمعنديش حاجة أتكلم عنها لحد دلوقتي. ابدأ أول مهمة وارجعلي!",
    failed: "معرفتش أوصل دلوقتي. جرّب تاني بعد شوية.",
    thinking: "بفكّر…",
  },
  en: {
    open: "Chat with TICO",
    title: "TICO",
    subtitle: "Ask me about any number on this page",
    placeholder: "Type your question…",
    send: "Send",
    close: "Close",
    skip: "Skip",
    next: "Next",
    done: "Got it!",
    greeting: "Hi! Ask me about anything on this page — or about your code, if you have a question.",
    noSession: "You haven't finished a mission yet, so there's nothing for me to talk about. Start one and come back!",
    failed: "I couldn't reach anyone just now. Try again in a moment.",
    thinking: "Thinking…",
  },
} as const;

export function TicoDock({ locale, sessionId }: { locale: string; sessionId: string | null }) {
  const ar = locale.startsWith("ar");
  const t = ar ? COPY.ar : COPY.en;

  const [mode, setMode] = useState<"tour" | "dock" | "chat">("tour");
  const [step, setStep] = useState(0);
  const [walking, setWalking] = useState(false);

  const [turns, setTurns] = useState<Turn[]>([{ role: "tico", text: t.greeting }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const lineRef = useRef<HTMLParagraphElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepped = useRef(false);

  const stop: Stop = TOUR[step];

  const lightPanel = useCallback((target: string, scroll: boolean) => {
    document.querySelectorAll("[data-tour]").forEach((el) => el.classList.remove("tourLit"));
    const panel = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (!panel) return;
    panel.classList.add("tourLit");
    if (scroll) panel.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const clearPanels = useCallback(() => {
    document.querySelectorAll("[data-tour]").forEach((el) => el.classList.remove("tourLit"));
  }, []);

  // He arrives already standing at the first panel. Focus is not taken here — only on a
  // step the reader asked for — because stealing it on load drops a keyboard user into
  // something they did not open.
  useEffect(() => {
    lightPanel(TOUR[0].target, false);
    return clearPanels;
  }, [lightPanel, clearPanels]);

  useEffect(() => {
    if (mode === "tour" && stepped.current) lineRef.current?.focus();
  }, [step, mode]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, busy]);

  useEffect(() => {
    if (mode === "chat") inputRef.current?.focus();
  }, [mode]);

  const goTo = useCallback((next: number) => {
    stepped.current = true;
    lightPanel(TOUR[next].target, true);
    setWalking(true);
    setStep(next);
    window.setTimeout(() => setWalking(false), 520);
  }, [lightPanel]);

  const endTour = useCallback(() => {
    clearPanels();
    setMode("dock");
  }, [clearPanels]);

  // Escape backs out one level: chat to dock, tour to dock.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "chat") setMode("dock");
        else if (mode === "tour") endTour();
        return;
      }
      if (mode !== "tour") return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const forward = ar ? e.key === "ArrowLeft" : e.key === "ArrowRight";
        const next = step + (forward ? 1 : -1);
        if (next >= 0 && next < TOUR.length) goTo(next);
        else if (next >= TOUR.length) endTour();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, step, ar, goTo, endTour]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;

    setTurns((prev) => [...prev, { role: "you", text }]);
    setDraft("");

    if (!sessionId) {
      setTurns((prev) => [...prev, { role: "tico", text: t.noSession }]);
      return;
    }

    setBusy(true);
    // One empty TICO turn, filled in as the stream arrives.
    setTurns((prev) => [...prev, { role: "tico", text: "" }]);

    try {
      const res = await fetch("/api/v1/ai/tico/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      // SSE frames are `data: {...}` separated by a blank line, and a chunk can split one
      // in half — so hold the tail until the next chunk completes it.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.delta) {
              answer += payload.delta;
              setTurns((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "tico", text: answer };
                return next;
              });
            }
          } catch {
            // A frame that is not JSON is not something a learner should be shown.
          }
        }
      }

      if (!answer) {
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "tico", text: t.failed };
          return next;
        });
      }
    } catch {
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "tico", text: t.failed };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------- the tour
  if (mode === "tour") {
    const last = step === TOUR.length - 1;
    return (
      <>
        {/* Dim everything else. The lit panel is raised above this by `.tourLit`, so it
            stays sharp while the rest of the page recedes. */}
        <div className={styles.veil} onClick={endTour} aria-hidden="true" />
        <div className={styles.guide} role="region" aria-live="polite">
        <div className={`${styles.avatar} ${walking ? styles.walking : ""}`}>
          <Image src={POSE[stop.pose]} alt="TICO" width={128} height={128} priority />
        </div>
        <div className={styles.bubble}>
          <p className={styles.line} ref={lineRef} tabIndex={-1}>
            {ar ? stop.ar : stop.en}
          </p>
          <div className={styles.controls}>
            <span className={styles.dots} aria-hidden="true">
              {TOUR.map((_, i) => (
                <span key={i} className={i === step ? styles.dotOn : styles.dot} />
              ))}
            </span>
            <button type="button" className={styles.ghost} onClick={endTour}>{t.skip}</button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => (last ? endTour() : goTo(step + 1))}
            >
              {last ? t.done : t.next}
            </button>
          </div>
        </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------- the dock
  if (mode === "dock") {
    return (
      <button
        type="button"
        className={styles.dock}
        onClick={() => setMode("chat")}
        aria-label={t.open}
        title={t.open}
      >
        <Image src={POSE.neutral} alt="" width={96} height={96} />
        <span className={styles.dockLabel}>{t.open}</span>
      </button>
    );
  }

  // ------------------------------------------------------------------- the chat
  return (
    <section className={styles.chat} aria-label={t.title}>
      <header className={styles.chatHead}>
        <Image
          className={styles.chatFace}
          src={busy ? POSE.thinking : POSE.neutral}
          alt=""
          width={44}
          height={44}
        />
        <div className={styles.chatTitle}>
          <strong>{t.title}</strong>
          <span>{t.subtitle}</span>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={() => setMode("dock")}
          aria-label={t.close}
        >
          ×
        </button>
      </header>

      <div className={styles.log} ref={logRef} role="log" aria-live="polite">
        {turns.map((turn, i) => (
          <p
            key={i}
            className={turn.role === "you" ? styles.you : styles.tico}
          >
            {turn.text || (busy && i === turns.length - 1 ? t.thinking : turn.text)}
          </p>
        ))}
      </div>

      <form
        className={styles.compose}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={inputRef}
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.placeholder}
          disabled={busy}
          maxLength={500}
        />
        <button type="submit" className={styles.primary} disabled={busy || !draft.trim()}>
          {t.send}
        </button>
      </form>
    </section>
  );
}
