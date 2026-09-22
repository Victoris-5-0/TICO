"use client";

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

import { startLessonMissionAction } from "@/actions/mission";
import { playCue } from "@/lib/sound/cues";
import type { Locale } from "@/i18n/config";

import styles from "./lesson-loading-overlay.module.css";

const subscribeToPortal = () => () => {};

function getPortalSnapshot(): HTMLElement | null {
  return document.getElementById("tico-loading-portal") ?? (typeof document !== "undefined" ? document.body : null);
}

function getServerSnapshot(): HTMLElement | null {
  return null;
}

export type LessonLoadingOverlayProps = {
  locale: Locale;
  worldSlug: string;
  lessonSlug: string;
  lessonTitle: string;
  worldTitle?: string;
  livePreview?: boolean;
  durationMs?: number; // 5000ms - 8000ms (default: 6000ms)
  onCancel?: () => void;
  onComplete?: (missionId: string) => void;
};

export function LessonLoadingOverlay({
  locale,
  worldSlug,
  lessonSlug,
  lessonTitle,
  worldTitle,
  livePreview = false,
  durationMs = 6000,
  onCancel,
  onComplete,
}: LessonLoadingOverlayProps) {
  const isArabic = locale === "ar-EG";
  const router = useRouter();
  const reduced = useReducedMotion();

  const [progress, setProgress] = useState(0);
  const [resolvedMissionId, setResolvedMissionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authRedirect, setAuthRedirect] = useState<string | null>(null);
  const portalElement = useSyncExternalStore(subscribeToPortal, getPortalSnapshot, getServerSnapshot);

  const startTimestamp = useRef<number | null>(null);
  const completedRef = useRef<boolean>(false);

  // Mount tracking and full website blur class toggle
  useEffect(() => {
    // Activates full website blur via globals.css:
    // body.tico-overlay-open > *:not(#tico-loading-portal) { filter: blur(12px) ... }
    document.body.classList.add("tico-overlay-open");
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.classList.remove("tico-overlay-open");
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Background mission resolution
  useEffect(() => {
    let active = true;

    async function fetchMission() {
      try {
        const result = await startLessonMissionAction({
          worldSlug, lessonSlug,
          forceRegenerate: livePreview,
          requireLive: livePreview,
        });
        if (!active) return;
        if (result.success && result.missionId) {
          setResolvedMissionId(result.missionId);
        } else if (result.error === "unauthenticated") {
          const returnPath = `/${locale}/worlds/${worldSlug}/play/${lessonSlug}${livePreview ? "?live=1" : ""}`;
          setAuthRedirect(`/${locale}/login?redirect=${encodeURIComponent(returnPath)}`);
        } else if (result.error === "live-not-ready") {
          setErrorMessage(isArabic
            ? "المهمة المباشرة لسه مش متاحة على السيرفر. تقدر تلعب المهمات الجاهزة دلوقتي."
            : "Live missions are not available on the server yet. You can play the ready missions now.");
        } else if (result.error === "live-unavailable") {
          setErrorMessage(isArabic
            ? "التوليد المباشر مش متاح دلوقتي. جرّب تاني بعد شوية."
            : "Live generation is unavailable right now. Please try again shortly.");
        } else if (result.error === "no-mission") {
          setErrorMessage(
            isArabic
              ? "مفيش مهمة جاهزة دلوقتي. جرّب تاني بعد شوية."
              : "No mission is ready right now. Please try again shortly."
          );
        } else {
          // Graceful fallback to lesson slug so student can continue
          if (livePreview) {
            setErrorMessage(isArabic ? "تعذّر توليد المهمة المباشرة." : "Could not generate a live mission.");
          } else {
            setResolvedMissionId(lessonSlug);
          }
        }
      } catch {
        if (!active) return;
        if (livePreview) {
          setErrorMessage(isArabic ? "تعذّر توليد المهمة المباشرة." : "Could not generate a live mission.");
        } else {
          setResolvedMissionId(lessonSlug);
        }
      }
    }

    fetchMission();
    return () => {
      active = false;
    };
  }, [worldSlug, lessonSlug, locale, isArabic, livePreview]);

  const handleFinish = useCallback(
    (missionId: string) => {
      if (completedRef.current) return;
      completedRef.current = true;

      playCue("success");

      if (onComplete) {
        onComplete(missionId);
        return;
      }

      const target = `/${locale}/worlds/${worldSlug}/missions/${missionId}?lesson=${lessonSlug}${livePreview ? "&preview=1" : ""}`;
      router.push(target);
    },
    [locale, worldSlug, lessonSlug, livePreview, onComplete, router],
  );

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(`/${locale}/worlds/${worldSlug}`);
    }
  }, [onCancel, router, locale, worldSlug]);

  // 5-8 seconds mock timer progress
  useEffect(() => {
    let frameId: number;

    if (startTimestamp.current === null) {
      startTimestamp.current = Date.now();
    }
    const start = startTimestamp.current;

    function tick() {
      const elapsed = Date.now() - start;
      const ratio = Math.min(elapsed / durationMs, 1);

      // Smooth easing curve
      let percent: number;
      if (ratio < 0.35) {
        percent = (ratio / 0.35) * 40;
      } else if (ratio < 0.8) {
        percent = 40 + ((ratio - 0.35) / 0.45) * 45;
      } else if (ratio < 1) {
        percent = 85 + ((ratio - 0.8) / 0.2) * 14;
      } else {
        percent = 100;
      }

      // If finished mocking before network resolution, hold at 95% unless error/redirect
      if (percent >= 95 && !resolvedMissionId && !errorMessage && !authRedirect) {
        setProgress(95);
        frameId = requestAnimationFrame(tick);
        return;
      }

      const rounded = Math.round(percent);
      setProgress(rounded);

      if (percent < 100) {
        frameId = requestAnimationFrame(tick);
      } else {
        if (authRedirect) {
          router.push(authRedirect);
          return;
        }
        if (errorMessage) {
          return;
        }
        const targetId = resolvedMissionId || lessonSlug;
        const timeoutId = window.setTimeout(() => {
          handleFinish(targetId);
        }, 400);
        return () => window.clearTimeout(timeoutId);
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [durationMs, resolvedMissionId, errorMessage, authRedirect, lessonSlug, handleFinish, router]);

  // Escape key support
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCancel]);

  const isReady = progress >= 100;

  // Status message based on percentage
  let statusText = isArabic
    ? "تحليل المفاهيم السابقة وإعداد التحدي..."
    : "Analyzing your pace and setting difficulty...";
  if (progress >= 35 && progress < 70) {
    statusText = isArabic
      ? "تيكو بيكتب كود بايثون وحالات الاختبار..."
      : "TICO is generating Python code and test cases...";
  } else if (progress >= 70 && progress < 100) {
    statusText = isArabic
      ? "فحص الأكواد والتأكد من الجاهزية..."
      : "Validating assertions and checking sandbox...";
  } else if (isReady) {
    statusText = isArabic ? "المهمة جاهزة! جاري الدخول..." : "Mission ready! Entering workspace...";
  }

  if (!portalElement) return null;

  return createPortal(
    <AnimatePresence>
      <div
        className={styles.overlayBackdrop}
        dir={isArabic ? "rtl" : "ltr"}
        role="dialog"
        aria-modal="true"
        aria-label={isArabic ? "جاري توليد الدرس بالذكاء الاصطناعي" : "Generating lesson by AI"}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleCancel();
          }
        }}
      >
        <motion.div
          className={styles.modalCard}
          initial={reduced ? false : { opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* TICO Icon */}
          <motion.div
            className={styles.ticoWrapper}
            animate={reduced ? undefined : { y: [0, -6, 0] }}
            transition={
              reduced
                ? undefined
                : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
            }
          >
            <Image
              className={styles.ticoImg}
              src="/assets/worlds-map/tico.png"
              alt="TICO"
              width={90}
              height={96}
              priority
            />
          </motion.div>

          {/* AI Generation Indicator Pill */}
          <div className={styles.aiIndicator}>
            <span className={styles.aiPulseDot} aria-hidden="true" />
            <span>{isArabic ? "جاري توليد الدرس بالذكاء الاصطناعي..." : "Generating lesson by AI..."}</span>
          </div>

          {/* World Badge */}
          {worldTitle && (
            <span className={styles.metaBadge}>
              <span aria-hidden="true">📍</span>
              <span>{worldTitle}</span>
            </span>
          )}

          {/* Lesson Title */}
          <h2 className={styles.lessonTitle}>{lessonTitle}</h2>

          {/* Status Message or Error */}
          {errorMessage ? (
            <p className={styles.errorMessage} role="alert">
              {errorMessage}
            </p>
          ) : (
            <p className={styles.statusText} role="status">
              {statusText}
            </p>
          )}

          {/* Clean Solid Orange Progress Bar (No Gradient) */}
          <div className={styles.progressTrack}>
            <progress
              className={styles.srOnly}
              value={progress}
              max="100"
              aria-label={isArabic ? "نسبة التجهيز" : "Preparation progress"}
            >
              {progress}%
            </progress>
            <div
              className={`${styles.progressFill} ${isReady ? styles.progressFillComplete : ""}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className={styles.progressFooter}>
            <span>{isArabic ? "توليد بواسطة الذكاء الاصطناعي" : "Generated by AI"}</span>
            <span className={styles.percentLabel}>{progress}%</span>
          </div>

          {/* Phones only — see the stylesheet. */}
          <p className={styles.deviceHint} role="note">
            <span aria-hidden="true">💻 </span>
            {isArabic
              ? "الدرس ده أحسن على كمبيوتر أو تابلت. لو تقدر، افتحه هناك."
              : "This lesson works best on a desktop or tablet. Open it there if you can."}
          </p>

          {/* Actions */}
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={handleCancel}
            >
              {errorMessage
                ? (isArabic ? "رجوع" : "Back")
                : (isArabic ? "إلغاء" : "Cancel")}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    portalElement,
  );
}
