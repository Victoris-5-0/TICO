"use client";

import Image from "next/image";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Locale } from "@/i18n/config";
import styles from "./mission-ui.module.css";

const copy = {
  en: { success: "CORRECT !!", completed: "Mission Completed", map: "Back To The Map", next: "Next Level", startTitle: "Are you ready to start the mission?", start: "Start Game", exitTitle: "Are you sure you want to leave?", exit: "Exit Game", cancel: "Cancel", close: "Close hint" },
  "ar-EG": { success: "إجابة صح!", completed: "المهمة اكتملت", map: "ارجع للخريطة", next: "المهمة التالية", startTitle: "جاهز تبدأ المهمة؟", start: "ابدأ اللعب", exitTitle: "متأكد إنك عايز تخرج؟", exit: "اخرج من اللعب", cancel: "إلغاء", close: "اقفل التلميح" },
};

type PanelProps = { locale: Locale; title?: string; titleId?: string };
type ActionProps = { children: ReactNode; onClick: () => void; secondary?: boolean };

function PanelAction({ children, onClick, secondary }: ActionProps) {
  const reduced = useReducedMotion();
  return <motion.button type="button" className={`${styles.action} ${secondary ? styles.secondary : ""}`} onClick={onClick} whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.98 }}>{children}</motion.button>;
}

/** Exact Figma sprite-sheet crops; art remains independent from panel layout. */
export function MissionMascot({ pose = "start", className = "" }: { pose?: "start" | "hint" | "exit"; className?: string }) {
  return <span aria-hidden="true" className={`${styles.mascot} ${styles[pose]} ${className}`}><Image src={`/assets/mission-ui/${pose}-sheet.png`} alt="" width={1500} height={1500} sizes="1500px" /></span>;
}

/** Nodes 2:1266 and 2:1276 are identical success designs. */
export function MissionSuccessPanel({ locale, title, titleId, message, onBackToMap, onNext, nextLabel }: PanelProps & { message?: string; onBackToMap: () => void; onNext: () => void; nextLabel?: string }) {
  const t = copy[locale];
  return <section className={`${styles.panel} ${styles.success}`} dir={locale === "ar-EG" ? "rtl" : "ltr"}>
    <Image className={styles.successArt} src="/assets/mission-ui/success.png" alt="" width={366} height={448} sizes="(max-width: 600px) 65vw, 366px" />
    <div className={styles.successCopy}><h2 id={titleId}>{title ?? t.success}</h2><p>{message ?? t.completed}</p></div>
    <div className={styles.actions}><PanelAction secondary onClick={onBackToMap}>{t.map}</PanelAction><PanelAction onClick={onNext}>{nextLabel ?? t.next}</PanelAction></div>
  </section>;
}

export function MissionStartPanel({ locale, title, titleId, onStart, onCancel, showMascot = false }: PanelProps & { onStart: () => void; onCancel: () => void; showMascot?: boolean }) {
  const t = copy[locale];
  return <section className={`${styles.panel} ${styles.confirmation}`} dir={locale === "ar-EG" ? "rtl" : "ltr"}>
    <div className={styles.confirmationCopy}><h2 id={titleId}>{title ?? t.startTitle}</h2><div className={styles.actions}><PanelAction onClick={onStart}>{t.start}</PanelAction><PanelAction secondary onClick={onCancel}>{t.cancel}</PanelAction></div></div>
    {showMascot && <MissionMascot className={styles.confirmationArt} />}
  </section>;
}

export function MissionExitPanel({ locale, title, titleId, onExit, onCancel, description }: PanelProps & { onExit: () => void; onCancel: () => void; description?: string }) {
  const t = copy[locale];
  return <section className={`${styles.panel} ${styles.confirmation}`} dir={locale === "ar-EG" ? "rtl" : "ltr"}>
    <div className={styles.confirmationCopy}><div><h2 id={titleId}>{title ?? t.exitTitle}</h2>{description && <p className={styles.description}>{description}</p>}</div><div className={styles.actions}><PanelAction onClick={onExit}>{t.exit}</PanelAction><PanelAction secondary onClick={onCancel}>{t.cancel}</PanelAction></div></div>
    <MissionMascot pose="exit" className={styles.confirmationArt} />
  </section>;
}

export function MissionHintPanel({ locale, hint, onClose, titleId }: { locale: Locale; hint: string; onClose: () => void; titleId?: string }) {
  return <section className={`${styles.panel} ${styles.hintPanel}`} dir={locale === "ar-EG" ? "rtl" : "ltr"}>
    <h2 id={titleId}><span aria-hidden="true">💡 </span>{hint}</h2><MissionMascot pose="hint" />
    <button type="button" className={styles.close} aria-label={copy[locale].close} onClick={onClose}><Image src="/assets/mission-ui/close.svg" alt="" width={38} height={38} /></button>
  </section>;
}

/** Controlled native modal: Escape, focus containment, and trigger restoration. */
export function MissionDialog({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const reduced = useReducedMotion();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) { if (dialog.open) dialog.close(); return; }
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus({ preventScroll: true }); };
  }, [open]);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <span id={id} className={styles.srOnly}>{label}</span>
    {open && <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>{children}</motion.div>}
  </dialog>;
}
