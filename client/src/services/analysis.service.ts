/**
 * Everything the service already knows about a learner, gathered in one read.
 *
 * WHY THIS EXISTS. The AI backend computes a great deal per submission and per session —
 * an error family, an open-vocabulary tag, a mastery score, a hint rung, whether the same
 * mistake stopped happening — and almost none of it reaches a screen. A child sees stars
 * and one sentence; a teacher sees nothing at all.
 *
 * Nothing here calls a model. Every figure below is counted from rows that already exist,
 * which is the same rule the debrief follows: numbers are counted in Python (or here, in
 * SQL), never generated, because a wrong number in front of a learner is worse than no
 * number.
 *
 * `misconception` is the reason this page is worth reading rather than skimming. A tag says
 * *what* went wrong; the sentence says *why the student thought it was right*, which is the
 * only thing on here a teacher can act on. It was returned by the analyze endpoint and
 * dropped for want of a column until 2026-09-12.
 */

import { db } from "@/lib/db";

/** Mirrors `ai-backend/app/rules/progression.py`. Three stops, six if they are struggling. */
const BASE_STOPS = 3;
const MAX_STOPS = 6;
/** `ai-backend/app/rules/mastery.MASTERY_THRESHOLD`. One number, four callers. */
const MASTERY_THRESHOLD = 0.75;

export type ConceptRow = {
  conceptId: string;
  slug: string;
  nameAr: string | null;
  name: string;
  mastery: number;
  confidence: number;
  completed: number;
  stopsTotal: number;
  isComplete: boolean;
  /** The path grew past three because mastery was still short. */
  extended: boolean;
  lastSeenAt: Date | null;
};

export type TagRow = {
  tag: string;
  family: string | null;
  total: number;
  /** What the student believed that was wrong, the last time this tag was seen. */
  misconception: string | null;
  /** Appeared, then stopped. The thing a learner can be proud of. */
  overcome: boolean;
  lastSeenAt: Date;
};

export type SessionRow = {
  id: string;
  title: string | null;
  outcome: string;
  attempts: number;
  hints: number;
  timeSpentMs: number;
  startedAt: Date;
  endedAt: Date | null;
};

export type Analysis = {
  profile: {
    name: string | null;
    avatarUrl: string | null;
    ageBand: string | null;
    learnerPreference: string | null;
    gender: string | null;
    onboardingCompletedAt: Date | null;
    skillBand: string | null;
    /** 0 = fights the language, 1 = fights the thinking. Null until there is evidence. */
    syntaxVsLogic: number | null;
    hintDependency: number | null;
    locale: string | null;
  };
  concepts: ConceptRow[];
  tags: TagRow[];
  sessions: SessionRow[];
  totals: {
    submissions: number;
    passed: number;
    hints: number;
    /** Hints per submission. The honest version of "how much help did they need". */
    hintsPerAttempt: number;
    minutes: number;
    conceptsComplete: number;
    tagsOvercome: number;
  };
  /** Rungs 1-4, how many of each. Rung 4 climbing is the signal worth watching. */
  hintLadder: { rung: number; count: number }[];
  /** Per calendar day, so a streak is visible without inventing one. */
  activity: { day: string; submissions: number; passed: number }[];
  /** A contribution grid: every day of the last year, including the empty ones. */
  streak: {
    days: { day: string; count: number; passed: number }[];
    current: number;
    longest: number;
    activeDays: number;
  };
};

function requiredStops(mastery: number, completed: number): number {
  if (completed < BASE_STOPS) return BASE_STOPS;
  if (mastery >= MASTERY_THRESHOLD) return Math.max(BASE_STOPS, completed);
  return MAX_STOPS;
}

function isComplete(mastery: number, completed: number): boolean {
  if (completed >= MAX_STOPS) return true;
  return completed >= BASE_STOPS && mastery >= MASTERY_THRESHOLD;
}

/** A day key that does not shift with the reader's timezone mid-render. */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function getAnalysis(userId: string): Promise<Analysis> {
  const [profile, account, concepts, mastery, submissions, hintEvents, sessions] = await Promise.all([
    db.studentProfile.findUnique({ where: { userId } }),
    db.user.findUnique({ where: { id: userId }, select: { name: true, avatarUrl: true } }),
    db.concept.findMany({ orderBy: { sequenceOrder: "asc" } }),
    db.conceptMastery.findMany({ where: { userId } }),
    db.submission.findMany({
      where: { userId },
      select: {
        id: true, status: true, errorFamily: true, errorTag: true,
        misconception: true, attemptNumber: true, createdAt: true, sessionId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.hintEvent.findMany({
      where: { session: { userId } },
      select: { hintLevel: true, createdAt: true, sessionId: true },
    }),
    db.practiceSession.findMany({
      where: { userId },
      select: {
        id: true, outcome: true, timeSpentMs: true, startedAt: true, endedAt: true,
        generatedMission: { select: { content: true } },
        _count: { select: { submissions: true, hintEvents: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 12,
    }),
  ]);

  // ------------------------------------------------------------------ concepts
  const masteryBySlug = new Map(mastery.map((m) => [m.conceptId, m]));
  const conceptRows: ConceptRow[] = concepts.map((c) => {
    // `concept_mastery.concept_id` holds the slug, which is what the AI service writes.
    const row = masteryBySlug.get(c.slug) ?? masteryBySlug.get(c.id);
    const score = row?.mastery ?? 0;
    const completed = row?.evidenceCount ?? 0;
    return {
      conceptId: c.id,
      slug: c.slug,
      nameAr: c.nameAr,
      name: c.name,
      mastery: score,
      confidence: row?.confidence ?? 0,
      completed,
      stopsTotal: requiredStops(score, completed),
      isComplete: isComplete(score, completed),
      extended: requiredStops(score, completed) > BASE_STOPS,
      lastSeenAt: row?.lastSeenAt ?? null,
    };
  });

  // ---------------------------------------------------------------------- tags
  //
  // "Overcome" is the interesting one and it is not just "count > 0". A tag counts as
  // overcome when it stopped appearing: the learner has submitted since, and none of
  // those later submissions carried it. Without the "submitted since" part, every tag
  // from the most recent attempt would look overcome the moment they walked away.
  const tagged = submissions.filter((s) => s.errorTag);


  const byTag = new Map<
    string,
    { family: string | null; total: number; last: Date; misconception: string | null }
  >();
  for (const s of tagged) {
    const key = s.errorTag as string;
    const seen = byTag.get(key);
    if (seen) {
      seen.total += 1;
      seen.last = s.createdAt;
      // Submissions are read oldest-first, so the last one wins — the most recent wording
      // of a misconception is the one that still describes how they are thinking.
      if (s.misconception) seen.misconception = s.misconception;
    } else {
      byTag.set(key, {
        family: s.errorFamily, total: 1, last: s.createdAt, misconception: s.misconception,
      });
    }
  }

  const tags: TagRow[] = [...byTag.entries()]
    .map(([tag, v]) => {
      const submittedSince = submissions.filter((s) => s.createdAt > v.last).length;
      return {
        tag,
        family: v.family,
        total: v.total,
        misconception: v.misconception,
        // Two clean submissions after the last sighting. One could be luck.
        overcome: submittedSince >= 2,
        lastSeenAt: v.last,
      };
    })
    .sort((a, b) => b.total - a.total);

  // --------------------------------------------------------------------- hints
  const ladder = [1, 2, 3, 4].map((rung) => ({
    rung,
    count: hintEvents.filter((h) => h.hintLevel === rung).length,
  }));

  // ------------------------------------------------------------------ activity
  const byDay = new Map<string, { submissions: number; passed: number }>();
  for (const s of submissions) {
    const key = dayKey(s.createdAt);
    const seen = byDay.get(key) ?? { submissions: 0, passed: 0 };
    seen.submissions += 1;
    if (s.status === "PASSED") seen.passed += 1;
    byDay.set(key, seen);
  }
  const activity = [...byDay.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14);

  // ------------------------------------------------------------------ sessions
  const sessionRows: SessionRow[] = sessions.map((s) => {
    const content = s.generatedMission?.content as { titleAr?: string } | null;
    return {
      id: s.id,
      title: content?.titleAr ?? null,
      outcome: s.outcome,
      attempts: s._count.submissions,
      hints: s._count.hintEvents,
      timeSpentMs: s.timeSpentMs,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    };
  });

  // ------------------------------------------------------------------- streak
  //
  // Every day in the window, not only the days with work — a grid with the gaps missing
  // is not a grid, and the gaps are the honest part.
  const WEEKS = 53;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start on the Saturday on or before the window opens. Saturday is the first day of the
  // week in Egypt, and a grid that starts on Sunday would put the weekend in the middle.
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7));

  const streakDays: { day: string; count: number; passed: number }[] = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    const found = byDay.get(key);
    streakDays.push({ day: key, count: found?.submissions ?? 0, passed: found?.passed ?? 0 });
  }

  // Counted backwards from today. Today being empty does not break a streak until the day
  // is over, so an afternoon with no work yet still shows yesterday's run.
  let current = 0;
  for (let i = streakDays.length - 1; i >= 0; i -= 1) {
    if (streakDays[i].count > 0) current += 1;
    else if (i < streakDays.length - 1) break;
  }

  let longest = 0;
  let run = 0;
  for (const d of streakDays) {
    run = d.count > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }

  const passed = submissions.filter((s) => s.status === "PASSED").length;
  const minutes = Math.round(
    sessions.reduce((total, s) => total + (s.timeSpentMs ?? 0), 0) / 60000,
  );

  return {
    profile: {
      name: account?.name ?? null,
      // The onboarding avatar is one of the cast — TICO, Tika, or a bakery customer.
      avatarUrl: account?.avatarUrl ?? null,
      ageBand: profile?.ageBand ?? null,
      learnerPreference: profile?.learnerPreference ?? null,
      gender: profile?.gender ?? null,
      onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
      skillBand: profile?.skillBand ?? null,
      syntaxVsLogic: profile?.syntaxVsLogic ?? null,
      hintDependency: profile?.hintDependency ?? null,
      locale: profile?.locale ?? null,
    },
    concepts: conceptRows,
    tags,
    sessions: sessionRows,
    totals: {
      submissions: submissions.length,
      passed,
      hints: hintEvents.length,
      hintsPerAttempt: submissions.length ? hintEvents.length / submissions.length : 0,
      minutes,
      conceptsComplete: conceptRows.filter((c) => c.isComplete).length,
      tagsOvercome: tags.filter((t) => t.overcome).length,
    },
    hintLadder: ladder,
    activity,
    streak: {
      days: streakDays,
      current,
      longest,
      activeDays: streakDays.filter((d) => d.count > 0).length,
    },
  };
}

/**
 * A one-line read of whether this learner fights the language or the thinking.
 *
 * Derived here rather than trusting `student_profiles.syntax_vs_logic`, which is seeded at
 * 0.5 and only moves when the student model runs. The families are the ground truth and
 * they are on every classified submission.
 */
export function syntaxVsLogicFromTags(tags: TagRow[]): { syntax: number; logic: number } {
  const SYNTAX = new Set(["SYNTAX", "NAME", "TYPE", "INCOMPLETE"]);
  let syntax = 0;
  let logic = 0;
  for (const t of tags) {
    if (!t.family) continue;
    if (SYNTAX.has(t.family)) syntax += t.total;
    else logic += t.total;
  }
  return { syntax, logic };
}
