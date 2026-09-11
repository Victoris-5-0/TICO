/**
 * Credit lessons that were finished but never recorded.
 *
 *   pnpm exec tsx scripts/repair-progress.ts            # dry run
 *   pnpm exec tsx scripts/repair-progress.ts --write
 *
 * Completion used to be a side effect of a passing submission, and that write could
 * fail silently — `submission.service` borrowed a hardcoded exercise id that no row
 * has, so the whole transaction rolled back inside a `catch` that reported success.
 * Students finished missions, saw the debrief, and found the next one still locked.
 *
 * A session marked SOLVED is the evidence that the mission was finished: the player
 * only closes a session that way from the "finish mission" button, which appears once
 * every test passes. This walks those sessions and makes sure the lesson is credited.
 * It is idempotent — an already-credited lesson is left alone, bonus included.
 */

import "dotenv/config";

import { db } from "../src/lib/db";
import { progressService } from "../src/services/progress.service";

async function main() {
  const write = process.argv.includes("--write");

  const solved = await db.practiceSession.findMany({
    where: { outcome: "SOLVED", lessonId: { not: null } },
    orderBy: { startedAt: "asc" },
    select: { id: true, userId: true, lessonId: true, startedAt: true },
  });

  const credited = new Set(
    (await db.userProgress.findMany({ where: { completed: true }, select: { userId: true, lessonId: true } }))
      .map((row) => `${row.userId}:${row.lessonId}`),
  );

  const lessons = Object.fromEntries(
    (await db.lesson.findMany({ select: { id: true, slug: true } })).map((l) => [l.id, l.slug]),
  );

  const missing = solved.filter((s) => !credited.has(`${s.userId}:${s.lessonId}`));
  const seen = new Set<string>();

  console.log(`${solved.length} solved sessions · ${missing.length} not credited\n`);

  for (const session of missing) {
    const key = `${session.userId}:${session.lessonId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = `${session.userId}  ${lessons[session.lessonId!] ?? session.lessonId}`;
    if (!write) {
      console.log(`  would credit  ${label}  (session ${session.id}, ${session.startedAt.toISOString()})`);
      continue;
    }
    const result = await progressService.completeLesson(session.userId, session.lessonId!, { sessionId: session.id });
    console.log(`  credited      ${label}  +${result.xpAwarded} xp`);
  }

  if (!write && missing.length) console.log("\n  dry run — re-run with --write to apply.");
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(`repair failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
