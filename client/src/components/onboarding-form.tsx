"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "motion/react";
import { completeOnboarding } from "@/actions/onboarding";
import { EgyptianIdCard } from "@/components/egyptian-id-card";
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
  const [direction, setDirection] = useState(1);
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
      if (s >= 1 && s <= 4) {
        setDirection(s > step ? 1 : -1);
        setStep(s);
      } else {
        setDirection(-1);
        setStep(1);
      }
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [step]);

  function goToStep(target: number) {
    setDirection(target > step ? 1 : -1);
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
      subtitle: ar ? "بياناتك هتظهر في بطاقة هويتك البرمجية المصرية." : "Your details will form your official Egyptian Coder ID.",
    },
    {
      title: ar ? "مين هيكون رفيقك في مصر؟" : "Who will be your companion?",
      subtitle: ar
        ? "اختار تيكو أو تيكا علشان يرافقك في رحلتك البرمجية."
        : "Choose Tico or Tika to accompany you on your learning journey.",
    },
    {
      title: ar ? "اختار صورتك لبطاقة الهوية!" : "Pick your ID photo!",
      subtitle: ar
        ? "الصورة اللي هتعتمد رسميًا على بطاقتك البرمجية."
        : "The photo that will appear on your official Coder ID.",
    },
    {
      title: ar ? "ما هو مسارك في البرمجة؟" : "What is your coding path?",
      subtitle: ar
        ? "اختار أسلوب التعلم اللي يناسب طموحك وخبرتك."
        : "Choose the learning path that matches your ambition.",
    },
  ];

  // Motion variants for step slide transitions
  const stepVariants: Variants = {
    enter: (dir: number) => ({
      x: reduced ? 0 : dir * (ar ? -28 : 28),
      opacity: 0,
      scale: 0.98,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.24,
        ease: [0.22, 1, 0.36, 1] as const,
      },
    },
    exit: (dir: number) => ({
      x: reduced ? 0 : dir * (ar ? 28 : -28),
      opacity: 0,
      scale: 0.98,
      transition: {
        duration: 0.16,
        ease: [0.4, 0, 1, 1] as const,
      },
    }),
  };

  return (
    <main className={styles.onboardingPage}>
      <div className={styles.onboardingTop}>
        <Link
          prefetch={false}
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
          <span className={styles.srOnly}>{ar ? "الرفيق" : "Companion"}</span>
        </li>
        <li data-active={step >= 3} aria-current={step === 3 ? "step" : undefined}>
          <span className={styles.srOnly}>{ar ? "الصورة الرمزية" : "Avatar"}</span>
        </li>
        <li data-active={step >= 4} aria-current={step === 4 ? "step" : undefined}>
          <span className={styles.srOnly}>{ar ? "المسار" : "Path"}</span>
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
            <motion.div
              className={styles.previewSuccessWrapper}
              role="status"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <h2 className={styles.previewSuccessTitle}>
                {ar ? "تم اعتماد وإصدار بطاقة الهوية بنجاح! 🇪🇬" : "Your Egyptian Coder ID is officially issued! 🇪🇬"}
              </h2>
              <p className={styles.previewSuccessDesc}>
                {ar
                  ? "دي معاينة حية لشكل بطاقتك وتجربة التسجيل. بياناتك جاهزة للمغامرة القادمة في عالم بايثون!"
                  : "This is a live preview of your Egyptian Coder ID and onboarding flow. No account details were stored in preview."}
              </p>
              <div className={styles.previewActionRow}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setPreviewDone(false);
                    goToStep(1);
                  }}
                >
                  {ar ? "تعديل البيانات" : "Edit details"}
                </button>
                <Link prefetch={false} className={styles.primary} href={`/${locale}/login`}>
                  {ar ? "كمّل باستخدام Google" : "Continue with Google"}
                </Link>
              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className={styles.stepContent}
              >
                {/* STEP 1: Name & Age (DROPDOWN REPLACED WITH CLICKABLE BUTTONS) */}
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
                          placeholder={ar ? "اسمك الكامل" : "Your full name"}
                          autoComplete="given-name"
                          required
                          maxLength={80}
                          enterKeyHint="next"
                        />
                      </label>

                      <div>
                        <span
                          id="ageband-label"
                          style={{
                            display: "block",
                            marginBottom: "14px",
                            fontSize: "clamp(18px,1.57vw,22.5px)",
                            fontWeight: 600,
                          }}
                        >
                          {ar ? "الفئة العمرية" : "Age group"}
                        </span>
                        {/* Accessible Clickable Option Buttons instead of dropdown */}
                        <div
                          role="radiogroup"
                          aria-labelledby="ageband-label"
                          className={styles.ageBandGrid}
                        >
                          {[
                            {
                              val: "UNDER_13",
                              title: ar ? "أقل من ١٣ سنة" : "Under 13",
                              sub: ar ? "مستكشف ناشئ" : "Junior Explorer",
                              icon: "🌱",
                            },
                            {
                              val: "TEEN",
                              title: ar ? "١٣ إلى ١٧ سنة" : "13–17 years",
                              sub: ar ? "مبرمج صاعد" : "Rising Coder",
                              icon: "⚡",
                            },
                            {
                              val: "ADULT",
                              title: ar ? "١٨ سنة أو أكبر" : "18 or older",
                              sub: ar ? "محترف واعد" : "Master Scribe",
                              icon: "🏛️",
                            },
                          ].map((item) => {
                            const isSelected = ageBand === item.val;
                            return (
                              <motion.label
                                key={item.val}
                                className={styles.ageBandChoice}
                                data-selected={isSelected}
                                whileHover={reduced ? {} : { y: -2, scale: 1.02 }}
                                whileTap={reduced ? {} : { scale: 0.98 }}
                                transition={{ type: "spring", stiffness: 420, damping: 26 }}
                              >
                                <input
                                  type="radio"
                                  name="ageBand"
                                  value={item.val}
                                  checked={isSelected}
                                  onChange={() => setAgeBand(item.val)}
                                  required
                                />
                                <span className={styles.ageBandIcon} aria-hidden="true">
                                  {item.icon}
                                </span>
                                <span className={styles.ageBandTitle}>{item.title}</span>
                                <span className={styles.ageBandSub}>{item.sub}</span>
                                {isSelected && (
                                  <motion.span
                                    className={styles.ageCheckBadge}
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                  >
                                    ✓
                                  </motion.span>
                                )}
                              </motion.label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className={styles.primary}
                      disabled={!displayName.trim() || !ageBand}
                      style={{ opacity: !displayName.trim() || !ageBand ? 0.6 : 1 }}
                    >
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
                        ].map((item) => {
                          const isSelected = gender === item.val;
                          return (
                            <motion.label
                              key={item.val}
                              className={styles.genderChoice}
                              data-selected={isSelected}
                              whileHover={reduced ? {} : { y: -3, scale: 1.02 }}
                              whileTap={reduced ? {} : { scale: 0.98 }}
                              transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            >
                              <input
                                type="radio"
                                name="gender"
                                value={item.val}
                                checked={isSelected}
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
                              {isSelected && (
                                <motion.span
                                  className={styles.ageCheckBadge}
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                >
                                  ✓
                                </motion.span>
                              )}
                            </motion.label>
                          );
                        })}
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

                {/* STEP 3: Avatar / PFP for Egyptian ID */}
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
                            {displayName || (ar ? "طالب بايثون" : "Python Student")}
                          </span>
                          <span className={styles.avatarPreviewLabel}>
                            {ar ? "هذه الصورة ستعتمد على بطاقتك الشخصية 🪪" : "This photo will appear on your ID card 🪪"}
                          </span>
                        </div>
                      </div>

                      <div className={styles.avatarGrid}>
                        {avatarOptions.map((opt) => {
                          const isSelected = selectedAvatar === opt.src;
                          return (
                            <motion.label
                              key={opt.id}
                              className={styles.avatarOption}
                              data-selected={isSelected}
                              title={ar ? opt.nameAr : opt.nameEn}
                              whileHover={reduced ? {} : { scale: 1.06 }}
                              whileTap={reduced ? {} : { scale: 0.95 }}
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
                            </motion.label>
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
                        {[
                          {
                            val: "LEARNER",
                            title: ar ? "متعلّم بايثون" : "Python Learner",
                            desc: ar
                              ? "رحلة ممتعة وتفاعلية مع إرشادات تيكو وشروحات تدريجية تناسب المبتدئين."
                              : "Step-by-step interactive journey with Tico's hints and guided missions.",
                            icon: "📜",
                          },
                          {
                            val: "CHALLENGER",
                            title: ar ? "متحدّي خوارزميات" : "Code Challenger",
                            desc: ar
                              ? "مباشرة للتحديات والمهمات البرمجية الشيقة بدون مساعدة زائدة للمحترفين."
                              : "Dive directly into tricky coding challenges with minimal guidance.",
                            icon: "⚔️",
                          },
                        ].map((item) => {
                          const isSelected = mode === item.val;
                          return (
                            <motion.label
                              key={item.val}
                              className={styles.richChoice}
                              data-selected={isSelected}
                              whileHover={reduced ? {} : { y: -3, scale: 1.02 }}
                              whileTap={reduced ? {} : { scale: 0.98 }}
                              transition={{ type: "spring", stiffness: 420, damping: 25 }}
                            >
                              <input
                                type="radio"
                                name="mode"
                                value={item.val}
                                checked={isSelected}
                                onChange={() => setMode(item.val)}
                              />
                              <span className={styles.richChoiceIcon} aria-hidden="true">
                                {item.icon}
                              </span>
                              <span className={styles.richChoiceTitle}>{item.title}</span>
                              <p className={styles.richChoiceDesc}>{item.desc}</p>
                              {isSelected && (
                                <motion.span
                                  className={styles.richChoiceCheck}
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                >
                                  ✓
                                </motion.span>
                              )}
                            </motion.label>
                          );
                        })}
                      </div>
                    </fieldset>

                    {error && (
                      <p className={styles.error} role="alert">
                        {error === "unauthorized" ? (
                          <Link prefetch={false} href={`/${locale}/login`}>
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
                            ? "جاري الحفظ…"
                            : "Saving…"
                          : ar
                          ? "ابدأ التعلم"
                          : "Start Learning"}
                      </button>
                    </div>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </section>

        {/* Right Column: Egyptian Programmer ID that progressively fills in */}
        <aside className={styles.idCardColumn} aria-label={ar ? "معاينة بطاقة الهوية" : "Egyptian Coder ID Preview"}>
          <div className={styles.idCardStickyWrapper}>
            <EgyptianIdCard
              name={displayName}
              ageBand={ageBand}
              gender={gender}
              avatarUrl={selectedAvatar}
              mode={mode}
              step={step}
              locale={locale}
              isCompleted={previewDone}
            />
          </div>
        </aside>
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
