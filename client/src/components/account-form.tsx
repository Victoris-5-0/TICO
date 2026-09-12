"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import type { Locale } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import styles from "./account-form.module.css";

export function AccountForm({ locale, authFailed = false }: { locale: Locale; authFailed?: boolean }) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(authFailed);

  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function signIn() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    const callbackURL = `/${locale}/login`;
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      newUserCallbackURL: callbackURL,
      errorCallbackURL: `${callbackURL}?error=auth_failed`,
    });
    if (result.error) {
      console.error("Google sign-in failed:", result.error.message);
      setFailed(true);
      setPending(false);
    }
  }

  return <main className={styles.loginPage}>
    <div className={styles.window}>
      <header className={styles.windowBar}>
        <div className={styles.windowDots} aria-hidden="true"><i /><i /><i /></div>
        <Link className={styles.windowHome} href={`/${locale}`} aria-label={ar ? "تيكو — الرئيسية" : "TICO home"}>TICO</Link>
        <Link prefetch={false} href={`/${ar ? "en" : "ar-EG"}/login`} lang={ar ? "en" : "ar"}>{ar ? "English" : "العربية"}</Link>
      </header>
      <div className={styles.loginBody}>
        <section className={styles.loginContent} aria-labelledby="account-title">
          <p className={styles.eyebrow}>{ar ? "مغامرتك تبدأ هنا" : "YOUR ADVENTURE STARTS HERE"}</p>
          <h1 id="account-title">{ar ? "سجّل دخولك" : "Log In"}</h1>
          <p className={styles.intro}>{ar ? "أهلًا بيك في تيكو. تعلّم بايثون، حلّ التحديات، واكتشف عالم جديد مع كل سطر كود." : "A little curiosity. A little code. A whole new world waiting for you."}</p>
          <div className={styles.loginAction}>
            <motion.button className={styles.google} type="button" onClick={signIn} disabled={pending} aria-busy={pending} whileHover={reduced ? undefined : { y: -2 }} whileTap={reduced ? undefined : { scale: 0.98 }}>
              <Image src="/assets/auth/google.svg" alt="" width={32} height={32} />
              {pending ? (ar ? "جاري فتح Google…" : "Connecting to Google…") : (ar ? "كمّل باستخدام Google" : "Continue with Google")}
              <span aria-hidden="true">{ar ? "←" : "→"}</span>
            </motion.button>
            {failed && <p className={styles.error} role="alert">{ar ? "مقدرناش نسجّل دخولك. جرّب تاني." : "We couldn’t sign you in. Please try again."}</p>}
            <p className={styles.note}>{ar ? "أول مرة هنا؟ هنجهّز حسابك تلقائيًا." : "First time here? We’ll set up your account automatically."}</p>
          </div>
          <p className={styles.loginFootnote}>{ar ? "خطوة بخطوة. وعلى مهلك." : "One step at a time. At your own pace."}</p>
        </section>
        <aside className={styles.welcomeArt} aria-label={ar ? "انضم للمغامرة" : "Join the adventure"}>
          <Image src="/assets/auth/welcome.png" alt="" width={778} height={778} sizes="(max-width: 760px) 70vw, 55vw" preload />
          <p>{ar ? "انضم إلى " : "Join The "}<strong>{ar ? "المغامرة" : "Adventure"}</strong></p>
        </aside>
      </div>
    </div>
  </main>;
}
