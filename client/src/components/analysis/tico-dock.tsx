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
 * The landing page shares the dock/chat states without the analysis tour.
 *
 * ## The session
 *
 * Page chat sends its page and locale. An optional owned session supplies background
 * only when the learner asks about a mission; it is not required for page questions.
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { readTicoStream } from "@/lib/ai/tico-stream";

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
    failed: "معرفتش أوصل دلوقتي. جرّب تاني بعد شوية.",
    thinking: "بفكّر…",
    signIn: "سجّل دخولك بجوجل عشان أساعدك تفهم الموقع والصفحة دي.",
    login: "سجّل دخولك",
    landingSubtitle: "اسألني عن تيكو وطريقة استخدام الموقع",
    landingGreeting: "أهلاً! أنا تيكو، الروبوت البرتقالي وصاحبك في تعلّم البرمجة. تحب تعرف إيه عن الموقع أو طريقة استخدامه؟",
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
    failed: "I couldn't reach anyone just now. Try again in a moment.",
    thinking: "Thinking…",
    signIn: "Sign in with Google so I can help you understand this website and page.",
    login: "Sign in",
    landingSubtitle: "Ask about TICO and how to use the website",
    landingGreeting: "Hi! I'm TICO, the orange robot and your programming companion. What would you like to know about this website or how to use it?",
  },
} as const;

export function TicoDock({ locale, sessionId, page = "analysis", signedIn = true }: {
  locale: string;
  sessionId: string | null;
  page?: "analysis" | "landing";
  signedIn?: boolean;
}) {
  const ar = locale.startsWith("ar");
  const t = ar ? COPY.ar : COPY.en;

  const [mode, setMode] = useState<"tour" | "dock" | "chat">(page === "landing" ? "dock" : "tour");
  const [step, setStep] = useState(0);
  const [walking, setWalking] = useState(false);

  const [turns, setTurns] = useState<Turn[]>([{ role: "tico", text: page === "landing" ? t.landingGreeting : t.greeting }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(!signedIn);
  const dockRef = useRef<HTMLButtonElement>(null);
  const conversationRef = useRef<string | null>(null);

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
    if (page !== "analysis") return;
    lightPanel(TOUR[0].target, false);
    return clearPanels;
  }, [page, lightPanel, clearPanels]);

  useEffect(() => {
    if (mode === "tour" && stepped.current) lineRef.current?.focus();
  }, [step, mode]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, busy]);

  useEffect(() => {
    if (mode === "chat") inputRef.current?.focus();
  }, [mode]);

  const closeChat = useCallback(() => {
    setMode("dock");
    window.requestAnimationFrame(() => dockRef.current?.focus());
  }, []);

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
        if (mode === "chat") closeChat();
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
  }, [mode, step, ar, goTo, endTour, closeChat]);

  async function send() {
    const text = draft.trim();
    if (!text || busy || needsSignIn) return;

    setTurns((prev) => [...prev, { role: "you", text }]);
    setDraft("");

    setBusy(true);
    // One empty TICO turn, filled in as the stream arrives.
    setTurns((prev) => [...prev, { role: "tico", text: "" }]);

    try {
      const res = await fetch("/api/v1/ai/tico/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text, page, locale,
          conversationId: conversationRef.current ?? (conversationRef.current = crypto.randomUUID()) }),
      });
      if (res.status === 401) setNeedsSignIn(true);
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const answer = await readTicoStream(res.body, (text) => {
        setTurns((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "tico", text };
          return next;
        });
      });
      if (!answer.trim()) {
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
        ref={dockRef}
        type="button"
        className={`${styles.dock} ${page === "landing" ? styles.landingDock : ""}`}
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
    <section className={styles.chat} aria-label={t.title} dir={ar ? "rtl" : "ltr"}>
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
          <span>{page === "landing" ? t.landingSubtitle : t.subtitle}</span>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={closeChat}
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

      {needsSignIn ? (
        <div className={styles.entry}>
          <p>{t.signIn}</p>
          <Link className={styles.primary} href={`/${locale}/login`}>
            {t.login}
          </Link>
        </div>
      ) : <form
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
          aria-label={t.placeholder}
          disabled={busy}
          maxLength={500}
        />
        <button type="submit" className={styles.primary} disabled={busy || !draft.trim()}>
          {t.send}
        </button>
      </form>}
    </section>
  );
}
