"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { playCue } from "@/lib/sound/cues";
import type { Locale } from "@/i18n/config";

import { ChallengeMap, type ChallengeNode, type ChallengeStage } from "./challenge-map";
import styles from "./challenge-map.module.css";

/**
 * The map, driven by a student's actual progress.
 *
 * `ChallengeMap` is presentation only and says so — it never infers what is open. This
 * decides that, launches a lesson when a node is picked, and handles the moment after a
 * mission when something new has opened up.
 */

export type MapStage = ChallengeStage & { worldSlug: string; slugs: Record<string, string> };

export function ChallengeMapView({
  locale,
  stages,
  unlocked,
  pending,
  banners = true,
  bannerTitle,
}: {
  locale: Locale;
  stages: readonly MapStage[];
  /** The node that just opened up, if the student arrived here from a finished mission. */
  unlocked?: { nodeId: string; label: string } | null;
  /** A world that has no map artwork yet, named rather than quietly dropped. */
  pending?: string | null;
  /** Painted stage banners. A world page has already named the world in its hero. */
  banners?: boolean;
  /** What the painted banner says, when the world's own name would only repeat the page. */
  bannerTitle?: string;
}) {
  const ar = locale === "ar-EG";
  const router = useRouter();
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState<string | null>(null);
  const announced = useRef(false);

  // Bring the new node into view once, and say so — a two-note chime and two beats of
  // movement on the stop itself, then still. `docs/design.md` section 11 rules out a
  // looping pulse, not the moment of arrival.
  useEffect(() => {
    if (!unlocked || announced.current) return;
    announced.current = true;
    const node = document.querySelector(`[data-node="${unlocked.nodeId}"]`);
    node?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    // After the scroll has begun, so the sound belongs to the stop being looked at.
    const id = window.setTimeout(() => playCue("unlock"), reduced ? 0 : 260);
    return () => window.clearTimeout(id);
  }, [unlocked, reduced]);

  function select(node: ChallengeNode, stage: ChallengeStage) {
    const mapStage = stages.find((s) => s.id === stage.id);
    const slug = mapStage?.slugs[node.id];
    if (!mapStage || !slug) return;
    setBusy(node.id);
    // Straight into the lesson: `/play/` claims the student's mission and redirects.
    router.push(`/${locale}/worlds/${mapStage.worldSlug}/play/${slug}`);
  }

  return (
    <>
      {unlocked && (
        <motion.p
          className={styles.unlockBanner}
          role="status"
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <span aria-hidden="true">🔓</span>
          {ar ? `فتحت مهمة جديدة: ${unlocked.label}` : `New mission unlocked: ${unlocked.label}`}
        </motion.p>
      )}

      <ChallengeMap
        locale={locale}
        stages={stages}
        onSelect={select}
        banners={banners}
        bannerTitle={bannerTitle}
        unlockedId={unlocked?.nodeId}
        emptyMessage={ar ? "مفيش مهام لسه." : "No missions yet."}
      />

      {busy && (
        <p className={styles.launching} role="status">
          {ar ? "بنجهّز المهمة…" : "Getting the mission ready…"}
        </p>
      )}

      {pending && (
        <p className={styles.pendingWorld}>
          {ar
            ? `${pending} لسه مالهاش رسمة على الخريطة، بس مهامها شغالة من صفحة العالم.`
            : `${pending} has no map artwork yet — its missions are playable from the world page.`}
        </p>
      )}
    </>
  );
}
