"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { signInAction, signUpAction } from "@/actions/auth";
import type { Locale } from "@/i18n/config";
import styles from "./account-form.module.css";

export function AccountForm({ locale, mode }: { locale: Locale; mode: "login" | "signup" }) {
  const ar = locale === "ar-EG";
  const signup = mode === "signup";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const reducedMotion = useReducedMotion();
  const title = signup ? (ar ? "اعمل حساب جديد" : "Create your account") : (ar ? "أهلًا بيك من تاني" : "Welcome back");

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage("");
    startTransition(async () => {
      try {
        const credentials = { email: String(data.get("email")), password: String(data.get("password")) };
        const result = signup
          ? await signUpAction({ ...credentials, name: String(data.get("name")) })
          : await signInAction(credentials);
        if (!result.success) {
          setMessage(ar ? "مقدرناش نكمّل. راجع بياناتك وجرّب تاني." : "We couldn’t continue. Check your details and try again.");
        } else if (signup) {
          setCreated(true);
          setMessage(ar ? "راجع بريدك الإلكتروني لتأكيد حسابك، وبعدها سجّل دخولك." : "Check your email to confirm your account, then log in.");
        } else {
          router.push(`/${locale}/learn`);
          router.refresh();
        }
      } catch {
        setMessage(ar ? "حصلت مشكلة في الاتصال. جرّب تاني." : "Connection interrupted. Please try again.");
      }
    });
  }

  return <main className={styles.page}>
    <section className={styles.story} aria-labelledby="story-title">
      <Link href={`/${locale}`} className={styles.brand} aria-label={ar ? "الرئيسية" : "TICO home"}>
        <Image src="/assets/landing/logo.svg" alt="TICO" width={140} height={49} preload />
      </Link>
      <div className={styles.storyCopy}>
        <p className={styles.eyebrow}>{ar ? "مغامرتك الجاية بتبدأ هنا" : "YOUR NEXT CHAPTER STARTS HERE"}</p>
        <h2 id="story-title">{ar ? "سطر كود صغير." : "A little code."}<br /><span>{ar ? "عالم جديد مستنيك." : "A whole new world."}</span></h2>
        <p>{ar ? "من فرن العيش لإشارات القاهرة، كل مشكلة فرصة تتعلّم حاجة جديدة. وتيكو معاك في كل خطوة." : "From the neighborhood bakery to the streets of Cairo, turn everyday problems into little discoveries. TICO is with you every step."}</p>
      </div>
      <div className={styles.scene}>
        <div className={styles.sceneWindow}>
          <Image src="/assets/worlds/bakery/establishing-v1.webp" alt="" fill sizes="(max-width: 900px) 100vw, 55vw" preload />
        </div>
        <div className={styles.codeNote} dir="ltr" lang="en">
          <div><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /><b>hello_world.py</b></div>
          <code><span>print</span>(&quot;Let’s try something new!&quot;)</code>
        </div>
        <Image className={styles.mascot} src="/assets/characters/tico/tico-neutral.webp" alt={ar ? "تيكو، رفيقك في البرمجة" : "TICO, your coding companion"} width={421} height={734} preload />
        <div className={styles.sceneCaption}><span>{ar ? "أول محطة" : "FIRST STOP"}</span><strong>{ar ? "فرن الحي" : "The neighborhood bakery"}</strong></div>
      </div>
      <p className={styles.storyFooter}>{ar ? "بايثون حقيقي. مشاكل من حياتنا. تعلّم على مهلك." : "Real Python. Familiar places. Your own pace."}</p>
    </section>

    <div className={styles.formSide}>
      <div className={styles.topLinks}>
        <Link href={`/${locale}`} className={styles.back}><span aria-hidden="true">{ar ? "→" : "←"}</span>{ar ? "الرئيسية" : "Back to home"}</Link>
        <Link href={`/${ar ? "en" : "ar-EG"}/${mode}`} lang={ar ? "en" : "ar-EG"}>{ar ? "English" : "العربية"}</Link>
      </div>
      <section className={styles.card} aria-labelledby="account-title">
        <p className={styles.eyebrow}>{ar ? "خطوة صغيرة، بداية جديدة" : "A SMALL STEP. A FRESH START."}</p>
        <h1 id="account-title">{title}<span className={styles.titleDot}>.</span></h1>
        <p className={styles.intro}>{signup ? (ar ? "ابدأ مغامرتك مع تيكو، مهمة واحدة كل مرة." : "Make room for your next discovery. One mission at a time.") : (ar ? "سجّل دخولك وكمّل من آخر خطوة وقفت عندها." : "Log in and pick up where your curiosity left off.")}</p>
        <form onSubmit={submit}>
          {signup && <label>{ar ? "الاسم" : "Your name"}<input name="name" autoComplete="name" placeholder={ar ? "تحب نناديك بإيه؟" : "What should we call you?"} required maxLength={100} disabled={pending || created} /></label>}
          <label>{ar ? "البريد الإلكتروني" : "Email address"}<input name="email" type="email" autoComplete="email" placeholder="you@example.com" dir="ltr" required disabled={pending || created} /></label>
          <div className={styles.passwordField}>
            <label htmlFor="account-password">{ar ? "كلمة المرور" : "Password"}</label>
            <div className={styles.passwordInput}>
              <input id="account-password" name="password" type={showPassword ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} placeholder={ar ? "اكتب كلمة المرور" : "Enter your password"} minLength={signup ? 6 : 1} required disabled={pending || created} />
              <button className={styles.revealPassword} type="button" aria-label={showPassword ? (ar ? "إخفاء كلمة المرور" : "Hide password") : (ar ? "إظهار كلمة المرور" : "Show password")} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} disabled={pending || created}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>
              </button>
            </div>
            {signup && <p className={styles.fieldHint}>{ar ? "٦ حروف أو أكتر." : "At least 6 characters."}</p>}
          </div>
          {message && <p className={created ? styles.success : styles.error} role="status" aria-live="polite">{message}</p>}
          <motion.button className={styles.submit} type="submit" disabled={pending || created} whileTap={reducedMotion ? undefined : { scale: 0.98 }}>
            {pending ? (ar ? "لحظة…" : "Please wait…") : signup ? (ar ? "إنشاء حساب" : "Create account") : (ar ? "تسجيل الدخول" : "Let’s go")}
            <span aria-hidden="true">{ar ? "←" : "→"}</span>
          </motion.button>
        </form>
        <div className={styles.switch}>
          <span>{signup ? (ar ? "عندك حساب؟" : "Already part of the adventure?") : (ar ? "أول مرة هنا؟" : "New to TICO?")}</span>{" "}
          <Link href={`/${locale}/${signup ? "login" : "signup"}`}>{signup ? (ar ? "سجّل دخولك" : "Log in") : (ar ? "اعمل حساب" : "Create an account")}</Link>
        </div>
        <div className={styles.reassurance}><span aria-hidden="true">{ "{ }" }</span><p>{ar ? "مش لازم تعرف كل الإجابات. المهم تكون جاهز تجرّب." : "You don’t need all the answers. Just a little curiosity."}</p></div>
      </section>
      <p className={styles.formFooter}>© 2026 TICO <span aria-hidden="true">·</span> {ar ? "صُنع للتعلّم والاكتشاف" : "Made for learning, built for discovery"}</p>
    </div>
  </main>;
}
