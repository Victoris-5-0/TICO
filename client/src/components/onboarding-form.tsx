"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { completeOnboarding } from "@/actions/onboarding";
import type { Locale } from "@/i18n/config";
import styles from "./account-form.module.css";

const STATIC_AVATARS = [
  { id: "tico-neutral", nameEn: "Tico", nameAr: "تيكو", src: "/assets/characters/tico/tico-neutral.webp" },
  { id: "tika", nameEn: "Tika", nameAr: "تيكا", src: "/assets/characters/tico/tika.webp" },
  { id: "tico-celebrating", nameEn: "Tico Celebrating", nameAr: "تيكو الفرحان", src: "/assets/characters/tico/tico-celebrating.webp" },
  { id: "tico-thinking", nameEn: "Tico Thinking", nameAr: "تيكو المفكّر", src: "/assets/characters/tico/tico-thinking.webp" },
  { id: "tico-determined", nameEn: "Tico Champion", nameAr: "تيكو البطل", src: "/assets/characters/tico/tico-determined.webp" },
  { id: "omar", nameEn: "Omar", nameAr: "عمر", src: "/assets/bakery-v2/omar.webp" },
  { id: "salma", nameEn: "Salma", nameAr: "سلمى", src: "/assets/bakery-v2/salma.webp" },
  { id: "youssef", nameEn: "Youssef", nameAr: "يوسف", src: "/assets/bakery-v2/youssef.webp" },
  { id: "mariam", nameEn: "Mariam", nameAr: "مريم", src: "/assets/bakery-v2/mariam.webp" },
  { id: "farid", nameEn: "Farid", nameAr: "فريد", src: "/assets/bakery-v2/farid.webp" },
  { id: "dina", nameEn: "Dina", nameAr: "دينا", src: "/assets/bakery-v2/dina.webp" },
  { id: "hassan", nameEn: "Hassan", nameAr: "حسن", src: "/assets/bakery-v2/hassan.webp" },
  { id: "nour", nameEn: "Nour", nameAr: "نور", src: "/assets/bakery-v2/nour.webp" },
];

export function OnboardingForm({
  locale,
  name,
  initialAvatar,
  preview = false,
}: {
  locale: Locale;
  name: string;
  initialAvatar?: string;
  preview?: boolean;
}) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(name);
  const [ageBand, setAgeBand] = useState("");
  const [gender, setGender] = useState("MALE");
  const [selectedAvatar, setSelectedAvatar] = useState(
    initialAvatar || STATIC_AVATARS[0].src
  );
  const [mode, setMode] = useState("LEARNER");
  const [previewDone, setPreviewDone] = useState(false);

  const nameInput = useRef<HTMLInputElement>(null);

  const avatarOptions = [
    ...(initialAvatar
      ? [{ id: "google", nameEn: "Google Photo", nameAr: "صورتك الحالية", src: initialAvatar }]
      : []),
    ...STATIC_AVATARS,
  ];

  const [error, action, pending] = useActionState(
    async (_previous: string, form: FormData) => {
      if (preview) {
        setPreviewDone(true);
        return "";
      }
      const result = await completeOnboarding({
        name: form.get("name") || displayName,
        ageBand: form.get("ageBand") || ageBand,
        gender: form.get("gender") || gender,
        avatarUrl: form.get("avatarUrl") || selectedAvatar,
        mode: form.get("mode") || mode,
        locale,
      });
      return result.error;
    },
    ""
  );

  useEffect(() => {
    const back = (event: PopStateEvent) => {
      const s = Number(event.state?.onboardingStep);
      setStep(s >= 1 && s <= 4 ? s : 1);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  function goToStep(target: number) {
    window.history.pushState(
      { ...window.history.state, onboardingStep: target },
      "",
      window.location.href
    );
    setStep(target);
  }

  function handleStep1Submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!displayName.trim()) {
      nameInput.current?.focus();
      return;
    }
    if (!ageBand) return;
    goToStep(2);
  }

  const stepTitles = [
    {
      title: ar ? "خلّينا نتعرّف عليك!" : "Let’s Get to Know you!",
      subtitle: ar ? "احكيلنا شوية عن نفسك." : "Tell us a bit about yourself.",
    },
    {
      title: ar ? "مين هيكون رفيقك؟" : "Who will be your companion?",
      subtitle: ar
        ? "اختار تيكو أو تيكا علشان يرافقك في رحلتك البرمجية."
        : "Choose Tico or Tika to join you on your learning journey.",
    },
    {
      title: ar ? "اختار صورتك الرمزية (PFP)!" : "Pick your avatar (PFP)!",
      subtitle: ar
        ? "اختار الصورة اللي هتمثلك في عالم تيكو."
        : "Choose the avatar that represents you in TICO.",
    },
    {
      title: ar ? "إنت حابب تكون؟" : "You are?",
      subtitle: ar
        ? "اختار أسلوب التعلم اللي يناسبك."
        : "Choose the learning path that matches your style.",
    },
  ];

  return (
    <main className={styles.onboardingPage}>
      <div className={styles.onboardingTop}>
        <Link
          href={`/${locale}/login`}
          aria-label={ar ? "ارجع لتسجيل الدخول" : "Back to login"}
        >
          TICO
        </Link>
        <span role="status">
          {ar ? `الخطوة ${step} من ٤` : `Step ${step} of 4`}
        </span>
        <Link
          href={`/${ar ? "en" : "ar-EG"}/onboarding${preview ? "/preview" : ""}`}
          lang={ar ? "en" : "ar"}
        >
          {ar ? "English" : "العربية"}
        </Link>
      </div>

      <ol className={styles.progress} aria-label={ar ? "خطوات البداية" : "Setup progress"}>
        <li data-active={step >= 1} aria-current={step === 1 ? "step" : undefined}>
          <span className={styles.srOnly}>{ar ? "بياناتك" : "Your details"}</span>
        </li>
        <li data-active={step >= 2} aria-current={step === 2 ? "step" : undefined}>
          <span className={styles.srOnly}>{ar ? "الهوية" : "Gender"}</span>
        </li>
        <li data-active={step >= 3} aria-current={step === 3 ? "step" : undefined}>
          <span className={styles.srOnly}>{ar ? "الصورة الرمزية" : "Avatar"}</span>
        </li>
        <li data-active={step >= 4} aria-current={step === 4 ? "step" : undefined}>
          <span className={styles.srOnly}>{ar ? "طريقك" : "Your path"}</span>
        </li>
      </ol>

      <div className={styles.onboardingBody}>
        <section
          className={styles.onboardingContent}
          aria-labelledby="onboarding-title"
        >
          <header>
            <h1 id="onboarding-title">{stepTitles[step - 1].title}</h1>
            <p className={styles.subtitle}>{stepTitles[step - 1].subtitle}</p>
          </header>

          {previewDone ? (
            <div className={styles.previewComplete} role="status">
              <h2>{ar ? "جاهز للمغامرة!" : "Ready for your adventure!"}</h2>
              <p>
                {ar
                  ? "دي معاينة للتصميم. مفيش بيانات اتحفظت."
                  : "This is a design preview. No account details were saved."}
              </p>
              <Link className={styles.primary} href={`/${locale}/login`}>
                {ar ? "كمّل باستخدام Google" : "Continue with Google"}
              </Link>
            </div>
          ) : (
            <motion.div
              key={step}
              className={styles.stepContent}
              initial={reduced ? false : { opacity: 0, x: ar ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* STEP 1: Name & Age */}
              {step === 1 && (
                <form onSubmit={handleStep1Submit} className={styles.detailsForm}>
                  <div className={styles.fields}>
                    <label>
                      {ar ? "تحب نناديك بإيه؟" : "What would you like us to call you?"}
                      <input
                        ref={nameInput}
                        name="name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder={ar ? "اسمك" : "Your name"}
                        autoComplete="given-name"
                        required
                        maxLength={80}
                      />
                    </label>
                    <label>
                      {ar ? "الفئة العمرية" : "Age group"}
                      <select
                        name="ageBand"
                        value={ageBand}
                        onChange={(e) => setAgeBand(e.target.value)}
                        required
                      >
                        <option value="" disabled>
                          {ar ? "اختار فئتك العمرية" : "Choose your age group"}
                        </option>
                        <option value="UNDER_13">
                          {ar ? "أقل من ١٣ سنة" : "Under 13"}
                        </option>
                        <option value="TEEN">
                          {ar ? "من ١٣ إلى ١٧ سنة" : "13–17"}
                        </option>
                        <option value="ADULT">
                          {ar ? "١٨ سنة أو أكتر" : "18 or older"}
                        </option>
                      </select>
                    </label>
                  </div>
                  <button type="submit" className={styles.primary}>
                    {ar ? "التالي" : "Next"}
                  </button>
                </form>
              )}

              {/* STEP 2: Choose Tico or Tika */}
              {step === 2 && (
                <div className={styles.choiceForm}>
                  <fieldset className={styles.choices}>
                    <legend className={styles.srOnly}>
                      {ar ? "اختار تيكو أو تيكا" : "Choose Tico or Tika"}
                    </legend>
                    <div className={styles.genderGrid}>
                      {[
                        {
                          val: "MALE",
                          name: ar ? "تيكو" : "Tico",
                          sub: ar ? "ولد / شاب" : "Boy / Male",
                          img: "/assets/characters/tico/tico-neutral.webp",
                        },
                        {
                          val: "FEMALE",
                          name: ar ? "تيكا" : "Tika",
                          sub: ar ? "بنت / فتاة" : "Girl / Female",
                          img: "/assets/characters/tico/tika.webp",
                        },
                      ].map((item) => (
                        <label
                          key={item.val}
                          className={styles.genderChoice}
                          data-selected={gender === item.val}
                        >
                          <input
                            type="radio"
                            name="gender"
                            value={item.val}
                            checked={gender === item.val}
                            onChange={() => {
                              setGender(item.val);
                              if (
                                item.val === "FEMALE" &&
                                selectedAvatar === "/assets/characters/tico/tico-neutral.webp"
                              ) {
                                setSelectedAvatar("/assets/characters/tico/tika.webp");
                              } else if (
                                item.val === "MALE" &&
                                selectedAvatar === "/assets/characters/tico/tika.webp"
                              ) {
                                setSelectedAvatar("/assets/characters/tico/tico-neutral.webp");
                              }
                            }}
                          />
                          <div className={styles.characterArtWrapper}>
                            <Image
                              src={item.img}
                              alt={item.name}
                              fill
                              sizes="(max-width: 760px) 140px, 200px"
                              className={styles.characterArt}
                            />
                          </div>
                          <h3 className={styles.characterName}>{item.name}</h3>
                          <p className={styles.characterSubLabel}>{item.sub}</p>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className={styles.stepActions}>
                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={() => goToStep(1)}
                    >
                      {ar ? "رجوع" : "Back"}
                    </button>
                    <button
                      className={styles.primary}
                      type="button"
                      onClick={() => goToStep(3)}
                    >
                      {ar ? "التالي" : "Next"}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Avatar / PFP */}
              {step === 3 && (
                <div className={styles.choiceForm}>
                  <div className={styles.avatarPickerContainer}>
                    <div className={styles.avatarPreviewRow}>
                      <div className={styles.avatarPreviewCircle}>
                        <Image
                          src={selectedAvatar}
                          alt={displayName || "Student"}
                          fill
                          sizes="60px"
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                      <div className={styles.avatarPreviewInfo}>
                        <span className={styles.avatarPreviewName}>
                          {displayName || (ar ? "طالب" : "Student")}
                        </span>
                        <span className={styles.avatarPreviewLabel}>
                          {ar ? "صورتك الرمزية المختارة" : "Selected avatar"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.avatarGrid}>
                      {avatarOptions.map((opt) => {
                        const isSelected = selectedAvatar === opt.src;
                        return (
                          <label
                            key={opt.id}
                            className={styles.avatarOption}
                            data-selected={isSelected}
                            title={ar ? opt.nameAr : opt.nameEn}
                          >
                            <input
                              type="radio"
                              name="avatarUrl"
                              value={opt.src}
                              checked={isSelected}
                              onChange={() => setSelectedAvatar(opt.src)}
                            />
                            <div className={styles.avatarCircle}>
                              <Image
                                src={opt.src}
                                alt={ar ? opt.nameAr : opt.nameEn}
                                fill
                                sizes="48px"
                                style={{ objectFit: "cover" }}
                              />
                            </div>
                            <span className={styles.avatarNameTag}>
                              {ar ? opt.nameAr : opt.nameEn}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.stepActions}>
                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={() => goToStep(2)}
                    >
                      {ar ? "رجوع" : "Back"}
                    </button>
                    <button
                      className={styles.primary}
                      type="button"
                      onClick={() => goToStep(4)}
                    >
                      {ar ? "التالي" : "Next"}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Mode & Submission */}
              {step === 4 && (
                <form action={action} className={styles.choiceForm}>
                  <input type="hidden" name="name" value={displayName} />
                  <input type="hidden" name="ageBand" value={ageBand} />
                  <input type="hidden" name="gender" value={gender} />
                  <input type="hidden" name="avatarUrl" value={selectedAvatar} />

                  <fieldset disabled={pending} className={styles.choices}>
                    <legend className={styles.srOnly}>
                      {ar ? "إنت حابب تكون؟" : "You are?"}
                    </legend>
                    <div className={styles.choiceGrid}>
                      {(["LEARNER", "CHALLENGER"] as const).map((value) => (
                        <label
                          key={value}
                          className={styles.choice}
                          data-selected={mode === value}
                        >
                          <input
                            type="radio"
                            name="mode"
                            value={value}
                            checked={mode === value}
                            onChange={() => setMode(value)}
                          />
                          <span>
                            {value === "LEARNER"
                              ? ar
                                ? "متعلّم"
                                : "Learner"
                              : ar
                              ? "متحدّي"
                              : "Challenger"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {error && (
                    <p className={styles.error} role="alert">
                      {error === "unauthorized" ? (
                        <Link href={`/${locale}/login`}>
                          {ar
                            ? "سجّل دخولك تاني علشان تكمّل."
                            : "Sign in again to continue."}
                        </Link>
                      ) : ar ? (
                        "مقدرناش نحفظ بياناتك. جرّب تاني."
                      ) : (
                        "We couldn’t save your setup. Please try again."
                      )}
                    </p>
                  )}

                  <div className={styles.stepActions}>
                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={() => goToStep(3)}
                      disabled={pending}
                    >
                      {ar ? "رجوع" : "Back"}
                    </button>
                    <button className={styles.primary} disabled={pending}>
                      {pending
                        ? ar
                          ? "بنجهّز حسابك…"
                          : "Saving…"
                        : ar
                        ? "ابدأ التعلم الآن!"
                        : "Start Learning!"}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </section>

        <div className={styles.thinkingArt} aria-hidden="true">
          <Image
            src="/assets/auth/thinking-sheet.png"
            alt=""
            width={1500}
            height={1500}
            sizes="1500px"
            preload
          />
        </div>
      </div>

      {preview && (
        <p className={styles.previewNote}>
          {ar
            ? "معاينة التصميم · البيانات مش بتتحفظ"
            : "Design preview · Details are not saved"}
        </p>
      )}
    </main>
  );
}
