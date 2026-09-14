"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/actions/auth";
import type { Locale } from "@/i18n/config";
import styles from "./user-profile-menu.module.css";

export interface HeaderUser {
  id: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  xp?: number;
  streak?: number;
}

const DEFAULT_AVATAR = "/assets/characters/tico/tico-neutral.webp";

export function UserProfileMenu({
  user,
  locale,
}: {
  user: HeaderUser;
  locale: Locale;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const ar = locale === "ar-EG";

  const displayName = user.name?.trim() || (ar ? "طالب" : "Student");
  const avatarSrc = user.avatarUrl || DEFAULT_AVATAR;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const router = useRouter();

  const handleSignOut = () => {
    startTransition(async () => {
      await signOutAction();
      router.push(`/${locale}/login`);
      router.refresh();
    });
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={ar ? `ملف ${displayName} الشخصي` : `${displayName}'s profile`}
      >
        <div className={styles.avatarWrapper}>
          <Image
            src={avatarSrc}
            alt={displayName}
            fill
            sizes="32px"
            className={styles.avatarImage}
          />
        </div>
        <span className={styles.userName}>{displayName}</span>
        <span
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className={styles.menu} role="menu">
          <div className={styles.header}>
            <div className={styles.menuAvatar}>
              <Image
                src={avatarSrc}
                alt={displayName}
                fill
                sizes="44px"
                className={styles.avatarImage}
              />
            </div>
            <div className={styles.userDetails}>
              <span className={styles.userFullName}>{displayName}</span>
              {user.email && (
                <span className={styles.userEmail}>{user.email}</span>
              )}
            </div>
          </div>

          <div className={styles.stats}>
            <div className={styles.statItem}>
              <span>⚡</span>
              <span>{user.xp ?? 0} XP</span>
            </div>
            <div className={styles.statItem}>
              <span>🔥</span>
              <span>
                {user.streak ?? 0} {ar ? "يوم" : "days"}
              </span>
            </div>
          </div>

          <div className={styles.links}>
            <Link
              href={`/${locale}/progress`}
              className={styles.menuLink}
              onClick={() => setIsOpen(false)}
            >
              <span>📊</span>
              <span>{ar ? "تحليل التعلّم" : "Learning Analysis"}</span>
            </Link>
            <Link
              href={`/${locale}/learn`}
              className={styles.menuLink}
              onClick={() => setIsOpen(false)}
            >
              <span>🗺️</span>
              <span>{ar ? "خريطة التعلم" : "Learning Map"}</span>
            </Link>
            <Link
              href={`/${locale}#worlds`}
              className={styles.menuLink}
              onClick={() => setIsOpen(false)}
            >
              <span>🧭</span>
              <span>{ar ? "العوالم والتحديات" : "Worlds & Challenges"}</span>
            </Link>
          </div>

          <button
            type="button"
            className={styles.signOutButton}
            onClick={handleSignOut}
            disabled={pending}
          >
            <span>🚪</span>
            <span>
              {pending
                ? ar
                  ? "جارٍ الخروج…"
                  : "Signing out…"
                : ar
                ? "تسجيل الخروج"
                : "Sign out"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
