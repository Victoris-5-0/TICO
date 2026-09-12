/**
 * Who this page is about.
 *
 * Reuses the avatar and the fields onboarding already collected rather than inventing a
 * second identity: the learner chose that character on their first screen, and seeing it
 * again is what makes the dashboard theirs instead of a report about them.
 *
 * `learnerPreference` and `gender` are shown as they were given — they steer which
 * companion appears and how lines are phrased, and are never an authorisation role. The
 * comment on the Prisma field says so and it is worth repeating where they are rendered.
 */

import Image from "next/image";

import type { Analysis } from "@/services/analysis.service";

import styles from "./analysis.module.css";

const AVATAR_FALLBACK = "/assets/characters/tico/tico-neutral.webp";

function bandLabel(band: string | null, ar: boolean): string | null {
  if (!band) return null;
  const labels: Record<string, [string, string]> = {
    STRUGGLING: ["لسه بيتعوّد", "Finding their feet"],
    ON_LEVEL: ["ماشي كويس", "On track"],
    READY_TO_STRETCH: ["جاهز لتحدي أكبر", "Ready to stretch"],
  };
  const pair = labels[band];
  return pair ? (ar ? pair[0] : pair[1]) : null;
}

function ageLabel(band: string | null, ar: boolean): string | null {
  if (!band) return null;
  if (band === "UNDER_13") return ar ? "أقل من ١٣" : "Under 13";
  if (band === "TEEN") return ar ? "١٣–١٧" : "13–17";
  return ar ? "١٨+" : "18+";
}

export function LearnerIdentity({
  profile,
  totals,
  locale,
}: {
  profile: Analysis["profile"];
  totals: Analysis["totals"];
  locale: string;
}) {
  const ar = locale.startsWith("ar");

  // Tika for a girl, TICO otherwise — the same rule onboarding used when the companion
  // was chosen, so the two screens do not disagree about who is travelling with them.
  const companion = profile.gender === "FEMALE" ? (ar ? "تيكا" : "Tika") : ar ? "تيكو" : "Tico";

  const band = bandLabel(profile.skillBand, ar);
  const age = ageLabel(profile.ageBand, ar);

  const since = profile.onboardingCompletedAt
    ? new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", { month: "long", year: "numeric" })
        .format(profile.onboardingCompletedAt)
    : null;

  return (
    <section className={styles.identity} data-tour="identity">
      <Image
        className={styles.identityAvatar}
        src={profile.avatarUrl || AVATAR_FALLBACK}
        alt=""
        width={96}
        height={96}
      />

      <div className={styles.identityBody}>
        <h2 className={styles.identityName}>
          {profile.name || (ar ? "متعلّم" : "Learner")}
        </h2>

        <div className={styles.chips}>
          {band && <span className={`${styles.chip} ${styles.chipBand}`}>{band}</span>}
          {age && <span className={styles.chip}>{age}</span>}
          <span className={styles.chip}>
            {ar ? `رفيقك: ${companion}` : `Companion: ${companion}`}
          </span>
          {since && (
            <span className={styles.chip}>
              {ar ? `من ${since}` : `Since ${since}`}
            </span>
          )}
        </div>

        {/* One sentence of standing, counted rather than described. It is the summary a
            teacher would write, and every figure in it is a row count. */}
        <p className={styles.identityLine}>
          {ar
            ? `خلّصت ${totals.conceptsComplete} مفهوم، وصلّحت ${totals.tagsOvercome} غلطة كنت بتعملها، على مدار ${totals.submissions} محاولة.`
            : `${totals.conceptsComplete} concepts finished and ${totals.tagsOvercome} recurring mistakes fixed, across ${totals.submissions} attempts.`}
        </p>
      </div>
    </section>
  );
}
