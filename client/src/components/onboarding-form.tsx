"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { completeOnboarding } from "@/actions/onboarding";
import type { Locale } from "@/i18n/config";
import styles from "./account-form.module.css";

export function OnboardingForm({ locale, name, preview = false }: { locale: Locale; name: string; preview?: boolean }) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(name);
  const [ageBand, setAgeBand] = useState("");
  const [mode, setMode] = useState("LEARNER");
  const [previewDone, setPreviewDone] = useState(false);
  const stepHeading = useRef<HTMLLegendElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const hasAdvanced = useRef(false);
  const [error, action, pending] = useActionState(async (_previous: string, form: FormData) => {
    if (preview) { setPreviewDone(true); return ""; }
    const result = await completeOnboarding({ name: form.get('name'), ageBand: form.get('ageBand'), mode: form.get('mode'), locale });
    return result.error;
  }, "");

  useEffect(() => {
    const back = (event: PopStateEvent) => setStep(event.state?.onboardingStep === 2 ? 2 : 1);
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  useEffect(() => {
    if (step === 2) { hasAdvanced.current = true; stepHeading.current?.focus(); }
    else if (hasAdvanced.current) nameInput.current?.focus();
  }, [step]);

  function next(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim()) { event.currentTarget.querySelector('input')?.focus(); return; }
    window.history.pushState({ ...window.history.state, onboardingStep: 2 }, '', window.location.href);
    setStep(2);
  }

  return <main className={styles.onboardingPage}>
    <div className={styles.onboardingTop}>
      <Link href={`/${locale}/login`} aria-label={ar ? "ارجع لتسجيل الدخول" : "Back to login"}>TICO</Link>
      <span role="status">{ar ? `الخطوة ${step} من ٢` : `Step ${step} of 2`}</span>
      <Link href={`/${ar ? "en" : "ar-EG"}/onboarding${preview ? '/preview' : ''}`} lang={ar ? "en" : "ar"}>{ar ? "English" : "العربية"}</Link>
    </div>
    <ol className={styles.progress} aria-label={ar ? "خطوات البداية" : "Setup progress"}>
      <li data-active={step === 1} aria-current={step === 1 ? "step" : undefined}><span className={styles.srOnly}>{ar ? "بياناتك" : "Your details"}</span></li>
      <li data-active={step === 2} aria-current={step === 2 ? "step" : undefined}><span className={styles.srOnly}>{ar ? "اختار طريقك" : "Choose your path"}</span></li>
    </ol>
    <div className={styles.onboardingBody}>
      <section className={styles.onboardingContent} aria-labelledby="onboarding-title">
        <header><h1 id="onboarding-title">{ar ? "خلّينا نتعرّف عليك!" : "Let’s Get to Know you!"}</h1><p className={styles.subtitle}>{ar ? "احكيلنا شوية عن نفسك." : "Tell us a bit about yourself."}</p></header>
        {previewDone ? <div className={styles.previewComplete} role="status"><h2>{ar ? "جاهز للمغامرة!" : "Ready for your adventure!"}</h2><p>{ar ? "دي معاينة للتصميم. مفيش بيانات اتحفظت." : "This is a design preview. No account details were saved."}</p><Link className={styles.primary} href={`/${locale}/login`}>{ar ? "كمّل باستخدام Google" : "Continue with Google"}</Link></div> :
          <motion.div key={step} className={styles.stepContent} initial={reduced ? false : { opacity: 0, x: ar ? -10 : 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .2 }}>
            {step === 1 ? <form onSubmit={next} className={styles.detailsForm}>
              <div className={styles.fields}>
                <label>{ar ? "تحب نناديك بإيه؟" : "What would you like us to call you?"}<input ref={nameInput} name="name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={ar ? "اسمك" : "Your name"} autoComplete="given-name" required maxLength={80} /></label>
                <label>{ar ? "الفئة العمرية" : "Age group"}<select name="ageBand" value={ageBand} onChange={e => setAgeBand(e.target.value)} required><option value="" disabled>{ar ? "اختار فئتك العمرية" : "Choose your age group"}</option><option value="UNDER_13">{ar ? "أقل من ١٣ سنة" : "Under 13"}</option><option value="TEEN">{ar ? "من ١٣ إلى ١٧ سنة" : "13–17"}</option><option value="ADULT">{ar ? "١٨ سنة أو أكتر" : "18 or older"}</option></select></label>
              </div>
              <button className={styles.primary}>{ar ? "التالي" : "Next"}</button>
            </form> : <form action={action} className={styles.choiceForm}>
              <input type="hidden" name="name" value={displayName} /><input type="hidden" name="ageBand" value={ageBand} />
              <fieldset disabled={pending} className={styles.choices}>
                <legend ref={stepHeading} tabIndex={-1}>{ar ? "إنت حابب تكون؟" : "You are?"}</legend>
                <div className={styles.choiceGrid}>{(["LEARNER", "CHALLENGER"] as const).map(value => <label key={value} className={styles.choice} data-selected={mode === value}>
                  <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                  <span>{value === "LEARNER" ? (ar ? "متعلّم" : "Learner") : (ar ? "متحدّي" : "Challenger")}</span>
                </label>)}</div>
              </fieldset>
              {error && <p className={styles.error} role="alert">{error === 'unauthorized' ? <Link href={`/${locale}/login`}>{ar ? "سجّل دخولك تاني علشان تكمّل." : "Sign in again to continue."}</Link> : (ar ? "مقدرناش نحفظ بياناتك. جرّب تاني." : "We couldn’t save your setup. Please try again.")}</p>}
              <div className={styles.stepActions}><button className={styles.secondary} type="button" onClick={() => window.history.back()} disabled={pending}>{ar ? "رجوع" : "Back"}</button><button className={styles.primary} disabled={pending}>{pending ? (ar ? "بنجهّز حسابك…" : "Saving…") : (ar ? "التالي" : "Next")}</button></div>
            </form>}
          </motion.div>}
      </section>
      <div className={styles.thinkingArt} aria-hidden="true"><Image src="/assets/auth/thinking-sheet.png" alt="" width={1500} height={1500} sizes="1500px" preload /></div>
    </div>
    {preview && <p className={styles.previewNote}>{ar ? "معاينة التصميم · البيانات مش بتتحفظ" : "Design preview · Details are not saved"}</p>}
  </main>;
}
