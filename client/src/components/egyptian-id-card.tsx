"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { Locale } from "@/i18n/config";
import styles from "./egyptian-id-card.module.css";

export interface EgyptianIdCardProps {
  name: string;
  ageBand: string;
  gender: string;
  avatarUrl?: string;
  mode: string;
  step: number;
  locale: Locale;
  isCompleted?: boolean;
}

export function EgyptianIdCard({
  name,
  ageBand,
  gender,
  avatarUrl,
  mode,
  step,
  locale,
  isCompleted = false,
}: EgyptianIdCardProps) {
  const ar = locale === "ar-EG";
  const reduced = useReducedMotion();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Localized field values
  const ageLabel = useMemo(() => {
    if (!ageBand) return "";
    if (ageBand === "UNDER_13") return ar ? "أقل من ١٣" : "Under 13";
    if (ageBand === "TEEN") return ar ? "١٣–١٧ سنة" : "13–17 yrs";
    return ar ? "١٨+ سنة" : "18+ (Adult)";
  }, [ageBand, ar]);

  const companionLabel = useMemo(() => {
    if (!gender && step < 2) return "";
    if (gender === "FEMALE") {
      return ar ? "تيكا 💫" : "Tika 💫";
    }
    return ar ? "تيكو ⚡" : "Tico ⚡";
  }, [gender, step, ar]);

  const modeLabel = useMemo(() => {
    if (!mode && step < 4) return "";
    if (mode === "CHALLENGER") {
      return ar ? "متحدّي خوارزميات" : "Code Challenger";
    }
    return ar ? "متعلّم بايثون" : "Python Learner";
  }, [mode, step, ar]);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  }

  function handleMouseLeave() {
    setMousePos({ x: 0, y: 0 });
  }

  return (
    <div className={styles.cardWrapper}>
      {/* 3D Scene Container */}
      <div
        className={styles.cardScene}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <motion.div
          className={styles.cardContainer}
          animate={
            reduced
              ? {}
              : {
                  rotateY: mousePos.x * 12,
                  rotateX: -mousePos.y * 10,
                }
          }
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
        >
          {/* Authentic Papyrus Egyptian Coder ID Background Image */}
          <Image
            src="/assets/auth/coder-id.webp"
            alt="TICO Egyptian Certified Coder ID"
            fill
            priority
            sizes="(max-width: 760px) 360px, 500px"
            className={styles.cardBackground}
          />

          {/* 1. Photo Frame Slot (PFP) */}
          <div
            className={styles.photoSlot}
            title={ar ? "صورة الهوية البرمجية" : "Coder ID Portrait"}
          >
            {avatarUrl ? (
              <motion.div
                key={avatarUrl}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 350, damping: 24 }}
                style={{ position: "relative", width: "100%", height: "100%" }}
              >
                <Image
                  src={avatarUrl}
                  alt={name || "Coder"}
                  fill
                  sizes="120px"
                  className={styles.photoImage}
                />
                <span className={styles.photoCheckBadge} aria-label="Verified">✓</span>
              </motion.div>
            ) : (
              <div className={styles.photoPlaceholder}>
                <svg
                  className={styles.photoPlaceholderIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className={styles.photoPlaceholderText}>
                  {ar ? "الصورة" : "Photo"}
                </span>
              </div>
            )}
          </div>

          {/* 2. Name Field (Overlaid above Name dashed line) */}
          <div className={`${styles.fieldContainer} ${styles.nameField}`}>
            <AnimatePresence mode="wait">
              {name.trim() ? (
                <motion.span
                  key={name.trim()}
                  className={`${styles.fieldValue} ${styles.nameValue}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {name.trim()}
                </motion.span>
              ) : (
                <span className={styles.fieldEmpty}>
                  {ar ? "اسمك هنا..." : "Your name..."}
                </span>
              )}
            </AnimatePresence>
          </div>

          {/* 3. Age Field (Overlaid above Age dashed line) */}
          <div className={`${styles.fieldContainer} ${styles.ageField}`}>
            <AnimatePresence mode="wait">
              {ageLabel ? (
                <motion.span
                  key={ageLabel}
                  className={`${styles.fieldValue} ${styles.ageValue}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {ageLabel}
                </motion.span>
              ) : (
                <span className={styles.fieldEmpty}>— — —</span>
              )}
            </AnimatePresence>
          </div>

          {/* 4. Companion Field (Overlaid above Companion dashed line) */}
          <div className={`${styles.fieldContainer} ${styles.companionField}`}>
            <AnimatePresence mode="wait">
              {step >= 2 && companionLabel ? (
                <motion.span
                  key={companionLabel}
                  className={`${styles.fieldValue} ${styles.companionValue}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {companionLabel}
                </motion.span>
              ) : (
                <span className={styles.fieldEmpty}>— — —</span>
              )}
            </AnimatePresence>
          </div>

          {/* 5. Path Field (Overlaid above Path dashed line) */}
          <div className={`${styles.fieldContainer} ${styles.pathField}`}>
            <AnimatePresence mode="wait">
              {step >= 4 && modeLabel ? (
                <motion.span
                  key={modeLabel}
                  className={`${styles.fieldValue} ${styles.pathValue}`}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {modeLabel}
                </motion.span>
              ) : (
                <span className={styles.fieldEmpty}>— — — — —</span>
              )}
            </AnimatePresence>
          </div>

          {/* 6. Gold Certified Seal Stamp on Completion */}
          <AnimatePresence>
            {isCompleted && (
              <motion.div
                className={styles.completionStamp}
                initial={{ scale: 2.6, opacity: 0, rotate: -32 }}
                animate={{ scale: 1, opacity: 1, rotate: -10 }}
                transition={{ type: "spring", stiffness: 420, damping: 20 }}
              >
                <svg
                  className={styles.goldSeal}
                  viewBox="0 0 100 100"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="50" cy="50" r="46" fill="#E9992F" stroke="#80550F" strokeWidth="3" />
                  <circle cx="50" cy="50" r="39" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="3,2" />
                  <circle cx="50" cy="50" r="35" fill="#DB5B31" />
                  <path
                    d="M36 50L45 59L65 39"
                    stroke="#FFFFFF"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text x="50" y="27" fill="#FFFFFF" fontSize="8.5" fontWeight="900" textAnchor="middle">
                    {ar ? "معتمد رسمياً" : "OFFICIALLY ISSUED"}
                  </text>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
