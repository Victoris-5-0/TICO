"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { MissionDialog, MissionSuccessPanel, MissionStartPanel, MissionExitPanel, MissionHintPanel, MissionMascot } from "./mission-panels";
import { ChallengeMap, type ChallengeNode } from "./challenge-map";
import styles from "./preview.module.css";

type Example = "success" | "start" | "exit" | "hint";
export function ComponentPreview({ locale }: { locale: Locale }) {
  const ar = locale === "ar-EG";
  const [dialog, setDialog] = useState<Example | null>(null);
  const [message, setMessage] = useState("");
  const [hintVisible, setHintVisible] = useState(true);
  const complete = (text: string) => { setMessage(text); setDialog(null); };
  const hint = ar ? "اقرأ رسالة الخطأ كويس، ممكن تدلّك على مكان المشكلة." : "Read the error message carefully—it may point you to the problem.";
  const labels = { success: ar ? "اكتمال المهمة" : "Mission completed", start: ar ? "بدء المهمة" : "Start mission", exit: ar ? "الخروج من المهمة" : "Exit mission", hint: ar ? "تلميح" : "Hint" };
  const renderPanel = (kind: Example) => {
    if (kind === "success") return <MissionSuccessPanel locale={locale} onBackToMap={() => complete(ar ? "تم اختيار الرجوع للخريطة." : "Back to map selected.")} onNext={() => complete(ar ? "تم اختيار المهمة التالية." : "Next mission selected.")} />;
    if (kind === "start") return <MissionStartPanel locale={locale} onStart={() => complete(ar ? "تم اختيار بدء المهمة." : "Start mission selected.")} onCancel={() => complete(ar ? "تم إلغاء البدء." : "Start cancelled.")} />;
    if (kind === "exit") return <MissionExitPanel locale={locale} onExit={() => complete(ar ? "تم اختيار الخروج." : "Exit selected.")} onCancel={() => complete(ar ? "تم إلغاء الخروج." : "Exit cancelled.")} />;
    return <MissionHintPanel locale={locale} hint={hint} onClose={() => { if (dialog) setDialog(null); else setHintVisible(false); }} />;
  };
  const stateNodes: ChallengeNode[] = (["completed", "current", "available", "locked"] as const).map((status, index) => ({ id: status, label: ar ? ["مهمة مكتملة", "المهمة الحالية", "مهمة متاحة", "مهمة مقفولة"][index] : ["Completed mission", "Current mission", "Available mission", "Locked mission"][index], x: [521,720,708,459][index], y: [141,488,842,1168][index], status }));
  return <main className={styles.preview}>
    <header className={styles.intro}><Link href={`/${locale}`}>TICO</Link><div className={styles.toolbar}><Link href={`/${locale}/challenges`}>{ar ? "خريطة التحديات" : "Challenge map"}</Link><Link href={`/${ar ? "en" : "ar-EG"}/components-preview`} lang={ar ? "en" : "ar"}>{ar ? "English" : "العربية"}</Link></div><h1>{ar ? "مكونات المهمة" : "Mission components"}</h1><p>{ar ? "معاينة تفاعلية للمكونات. الأزرار هنا بتعرض الاختيار من غير تغيير تقدمك." : "An interactive component preview. Actions report your selection without changing learning progress."}</p></header>
    <div className={styles.toolbar}>{(Object.keys(labels) as Example[]).map(kind => <button key={kind} onClick={() => setDialog(kind)}>{ar ? "افتح: " : "Open: "}{labels[kind]}</button>)}</div>
    <p role="status" className={styles.status}>{message || (ar ? "جرّب المكونات أو افتحها في نافذة." : "Try the panels below or open them as dialogs.")}</p>
    <div className={styles.gallery}>
      <section className={styles.example}><h2 className={styles.caption}>01 · {labels.success} <small>2:1266</small></h2>{renderPanel("success")}</section>
      <div className={styles.stack}>
        <section className={styles.example}><h2 className={styles.caption}>02 · {labels.start} <small>2:1346</small></h2>{renderPanel("start")}</section>
        <section className={styles.example}><h2 className={styles.caption}>03 · {labels.hint} <small>2:1354</small></h2>{hintVisible ? renderPanel("hint") : <button className={styles.restore} onClick={() => setHintVisible(true)}>{ar ? "اعرض التلميح تاني" : "Show hint again"}</button>}</section>
      </div>
      <section className={`${styles.example} ${styles.wide}`}><h2 className={styles.caption}>04 · {labels.exit} <small>2:1337</small></h2>{renderPanel("exit")}</section>
      <section className={styles.example}><h2 className={styles.caption}>05 · {ar ? "تيكو جاهز" : "Ready TICO"} <small>2:1359</small></h2><div className={styles.mascotStage}><MissionMascot /></div></section>
      <section className={styles.example}><h2 className={styles.caption}>06 · {ar ? "نسخة اكتمال المهمة" : "Completion duplicate"} <small>2:1276</small></h2>{renderPanel("success")}</section>
    </div>
    <section className={styles.statePreview}><h2>{ar ? "حالات عقد الخريطة" : "Map node states"}</h2><p>{ar ? "حالات تجريبية: مكتملة، حالية، متاحة، ومقفولة." : "Sample states: completed, current, available, and locked."}</p><ChallengeMap locale={locale} stages={[{ id: "states", title: ar ? "حالات المهمة" : "Mission states", stageLabel: ar ? "معاينة" : "Preview", theme: "bakery", nodes: stateNodes }]} onSelect={(node) => setMessage(node.label)} /></section>
    <MissionDialog open={dialog !== null} onClose={() => setDialog(null)} label={dialog ? labels[dialog] : ""}>{dialog && renderPanel(dialog)}</MissionDialog>
  </main>;
}
