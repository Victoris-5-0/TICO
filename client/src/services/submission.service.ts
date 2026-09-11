import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';
import { ErrorFamily } from '@prisma/client';

export interface ProcessSubmissionResult {
  submission: {
    id: string;
    userId: string;
    exerciseId: string;
    sessionId: string | null;
    code: string;
    status: string;
    output: string | null;
    executionTimeMs: number | null;
    attemptNumber: number;
    hintsUsedBefore: number;
    errorFamily: ErrorFamily | null;
    errorTag: string | null;
    createdAt: Date;
  } | null;
  xpAwarded: number;
  isFirstCompletion: boolean;
  totalXp: number;
  streak: number;
}

export class SubmissionService {
  /**
   * Helper to deterministically classify Python runtime/syntax errors
   * as a fallback when AI service is offline or slow.
   */
  private fallbackClassifyError(output: string): { errorFamily: ErrorFamily; errorTag: string } {
    const text = output || '';
    if (/SyntaxError|IndentationError|TabError/i.test(text)) {
      return { errorFamily: 'SYNTAX', errorTag: 'syntax_error' };
    }
    if (/NameError/i.test(text)) {
      return { errorFamily: 'NAME', errorTag: 'undefined_variable' };
    }
    if (/TypeError/i.test(text)) {
      return { errorFamily: 'TYPE', errorTag: 'type_mismatch' };
    }
    if (/IndexError|KeyError/i.test(text)) {
      return { errorFamily: 'RUNTIME', errorTag: 'lookup_error' };
    }
    if (/AssertionError/i.test(text)) {
      return { errorFamily: 'LOGIC', errorTag: 'test_assertion_failed' };
    }
    if (/TimeoutError|timed out/i.test(text)) {
      return { errorFamily: 'RUNTIME', errorTag: 'execution_timeout' };
    }
    return { errorFamily: 'UNKNOWN', errorTag: 'general_error' };
  }

  /**
   * Records a student code submission, evaluates results, awards XP atomically on pass,
   * creates XpEvent audit logs, tracks daily calendar streaks, and coordinates with AI.
   */
  async processSubmission(
    userId: string,
    sessionId: string,
    code: string,
    token: string,
    runnerResult: {
      status: 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT';
      output: string;
      durationMs: number;
    }
  ): Promise<ProcessSubmissionResult> {
    // 1. Validate session and ownership
    let session = null;
    try {
      session = await db.practiceSession.findUnique({
        where: { id: sessionId },
        include: {
          submissions: {
            select: { id: true },
          },
          hintEvents: {
            select: { id: true },
          }
        },
      });
    } catch (e) {
      console.warn('Database offline during submission check:', e);
    }

    if (!session || session.userId !== userId) {
      const isPassed = runnerResult.status === 'PASSED';
      const fallbackError = this.fallbackClassifyError(runnerResult.output);

      return {
        submission: {
          id: `sub-${Date.now()}`,
          userId,
          exerciseId: 'el-forn-ex-01',
          sessionId,
          code,
          status: runnerResult.status === 'TIMEOUT' ? 'ERROR' : runnerResult.status,
          output: runnerResult.output,
          executionTimeMs: runnerResult.durationMs,
          attemptNumber: 1,
          hintsUsedBefore: 0,
          errorFamily: isPassed ? null : fallbackError.errorFamily,
          errorTag: isPassed ? null : fallbackError.errorTag,
          createdAt: new Date(),
        },
        xpAwarded: isPassed ? 100 : 0,
        isFirstCompletion: isPassed,
        totalXp: isPassed ? 100 : 0,
        streak: isPassed ? 1 : 0,
      };
    }

    // Which exercise row does this attempt hang off?
    //
    // A generated mission has no exercise of its own, so one is borrowed to satisfy the
    // submission's foreign key. Borrow it from the lesson the student is actually
    // playing: the old order reached for the *track's first* exercise, and when that did
    // not resolve either it fell through to a hardcoded `el-forn-ex-01` — an id no row
    // has ever had. Every attempt in that state violated the foreign key, the whole
    // transaction below rolled back inside a `catch` that reports success anyway, and
    // the lesson was never marked complete. That is precisely how a finished mission
    // left the next one locked with nothing to show for it.
    let resolvedExerciseId = session.exerciseId;
    if (!resolvedExerciseId && session.lessonId) {
      try {
        const own = await db.exercise.findFirst({
          where: { lessonId: session.lessonId },
          orderBy: { order: 'asc' },
          select: { id: true },
        });
        resolvedExerciseId = own?.id || null;
      } catch {}
    }
    if (!resolvedExerciseId && session.generatedMissionId) {
      try {
        const gm = await db.generatedMission.findUnique({
          where: { id: session.generatedMissionId },
          include: { template: { include: { track: { include: { lessons: { include: { exercises: true } } } } } } }
        });
        resolvedExerciseId = gm?.template.track.lessons[0]?.exercises[0]?.id || null;
      } catch {}
    }

    const attemptNumber = session.submissions.length + 1;
    const hintsUsedBefore = session.hintEvents.length;

    // 2. Classify error if code did not pass
    let errorFamily: ErrorFamily | null = null;
    let errorTag: string | null = null;

    if (runnerResult.status !== 'PASSED') {
      try {
        const analysis = await aiClient.analyzeSubmission(token, {
          sessionId,
          attemptNumber,
          code,
          errorText: runnerResult.output,
        });
        // The AI service and Prisma share one enum, spelled identically, so this
        // needs no case conversion or whitelist.
        errorFamily = analysis.errorFamily;
        errorTag = analysis.errorTag;
      } catch {
        const fallback = this.fallbackClassifyError(runnerResult.output);
        errorFamily = fallback.errorFamily;
        errorTag = fallback.errorTag;
      }
    }

    // 3. Atomically record submission, progress, XP, and streak
    let submissionResult: ProcessSubmissionResult['submission'] = null;
    let xpAwarded = 0;
    let isFirstCompletion = false;

    // Calculate calendar date for daily activity
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    // Prefetch read data outside transaction to minimize lock time.
    //
    // Which lesson does this credit? The session's own, first.
    //
    // `practice_sessions.lesson_id` is what the student actually opened. The exercise ids
    // below are a different thing: a generated mission has no exercise row, so one is
    // borrowed to satisfy the submission's foreign key — and the borrowed one is the
    // track's first exercise whatever lesson is being played. Reading the lesson off it
    // credited lesson one for every mission in the world, so finishing lesson two marked
    // lesson one complete, awarded nothing, and left lesson two looking untouched.
    let targetLessonId: string | null = session.lessonId ?? null;

    if (!targetLessonId && session.exerciseId) {
      const exercise = await db.exercise.findUnique({
        where: { id: session.exerciseId },
        select: { lessonId: true }
      });
      targetLessonId = exercise?.lessonId || null;
    } else if (!targetLessonId && resolvedExerciseId) {
      const exercise = await db.exercise.findUnique({
        where: { id: resolvedExerciseId },
        select: { lessonId: true }
      });
      targetLessonId = exercise?.lessonId || null;
    }

    let isFirstCompletionCandidate = false;
    if (targetLessonId) {
      const existingProgress = await db.userProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId: targetLessonId } }
      });
      if (!existingProgress || !existingProgress.completed) {
        isFirstCompletionCandidate = true;
      }
    }

    try {
      await db.$transaction(async (tx) => {
        // No exercise anywhere in this lesson: record nothing rather than invent an id
        // that the foreign key will reject. Completion does not depend on this row —
        // `session.service` marks the lesson when the mission is finished.
        if (!resolvedExerciseId) {
          console.error('No exercise to attach submission to for session', sessionId, 'lesson', targetLessonId);
          return;
        }

        const submission = await tx.submission.create({
          data: {
            userId,
            exerciseId: resolvedExerciseId,
            sessionId,
            code,
            status: runnerResult.status === 'TIMEOUT' ? 'ERROR' : runnerResult.status,
            output: runnerResult.output,
            executionTimeMs: runnerResult.durationMs,
            attemptNumber,
            hintsUsedBefore,
            errorFamily,
            errorTag,
          },
        });

        submissionResult = submission;

        // Handle passed state
        if (runnerResult.status === 'PASSED') {
          await tx.practiceSession.update({
            where: { id: sessionId },
            data: {
              outcome: 'SOLVED',
              endedAt: new Date(),
            }
          });

          if (targetLessonId && isFirstCompletionCandidate) {
            isFirstCompletion = true;
            xpAwarded = 100; // First-time completion bonus

            // 1. Increment user XP
            await tx.user.update({
              where: { id: userId },
              data: {
                xp: { increment: xpAwarded },
              }
            });

            // 2. Record immutable XpEvent audit
            await tx.xpEvent.create({
              data: {
                userId,
                sessionId,
                amount: xpAwarded,
                source: 'EXERCISE_SOLVED',
                reason: 'Completed exercise in world track',
              }
            });
            
            // 3. Mark lesson completed
            await tx.userProgress.upsert({
              where: { userId_lessonId: { userId, lessonId: targetLessonId } },
              update: { completed: true, completedAt: new Date() },
              create: { userId, lessonId: targetLessonId, completed: true, completedAt: new Date() }
            });

            await tx.lessonPlan.updateMany({
              where: { userId, lessonId: targetLessonId },
              data: { requirement: 'DONE' }
            });

            // 4. Update Daily Activity and Calendar Streak
            const activityToday = await tx.dailyActivity.findUnique({
              where: { userId_day: { userId, day: today } }
            });

            if (!activityToday) {
              // First activity of today: check if yesterday had activity
              const activityYesterday = await tx.dailyActivity.findUnique({
                where: { userId_day: { userId, day: yesterday } }
              });

              const userRec = await tx.user.findUnique({
                where: { id: userId },
                select: { streak: true }
              });

              const currentStreak = userRec?.streak ?? 0;
              const newStreak = activityYesterday ? currentStreak + 1 : 1;

              await tx.user.update({
                where: { id: userId },
                data: { streak: newStreak }
              });

              await tx.dailyActivity.create({
                data: {
                  userId,
                  day: today,
                  xpEarned: xpAwarded,
                  sessionsCompleted: 1,
                  minutesActive: Math.max(1, Math.round(runnerResult.durationMs / 60000)),
                }
              });
            } else {
              // Already active today: increment stats
              await tx.dailyActivity.update({
                where: { userId_day: { userId, day: today } },
                data: {
                  xpEarned: { increment: xpAwarded },
                  sessionsCompleted: { increment: 1 },
                }
              });
            }
          }
        }
      }, {
        maxWait: 10000,
        timeout: 30000,
      });
    } catch (txErr) {
      console.warn('Database offline or transaction failed during submission save:', txErr);
      const isPassed = runnerResult.status === 'PASSED';
      return {
        submission: {
          id: `sub-${Date.now()}`,
          userId,
          exerciseId: resolvedExerciseId || 'el-forn-ex-01',
          sessionId,
          code,
          status: runnerResult.status === 'TIMEOUT' ? 'ERROR' : runnerResult.status,
          output: runnerResult.output,
          executionTimeMs: runnerResult.durationMs,
          attemptNumber,
          hintsUsedBefore,
          errorFamily,
          errorTag,
          createdAt: new Date(),
        },
        xpAwarded: isPassed ? 100 : 0,
        isFirstCompletion: isPassed,
        totalXp: isPassed ? 100 : 0,
        streak: isPassed ? 1 : 0,
      };
    }

    // 4. Asynchronous AI student model refresh on pass
    if (runnerResult.status === 'PASSED' && submissionResult) {
      aiClient.refreshStudent(token, userId, { watermark: (submissionResult as { id: string }).id }).catch((e) => {
        console.warn('Async AI mastery refresh skipped or offline:', e.message);
      });
    }

    // 5. Fetch updated user stats
    const updatedUser = await db.user.findUnique({
      where: { id: userId },
      select: { xp: true, streak: true }
    });

    return {
      submission: submissionResult,
      xpAwarded,
      isFirstCompletion,
      totalXp: updatedUser?.xp ?? 0,
      streak: updatedUser?.streak ?? 0,
    };
  }

  /**
   * Retrieves submissions for a student with optional exercise or session filters.
   */
  async getSubmissions(params: { userId: string; exerciseId?: string; sessionId?: string; limit?: number }) {
    const { userId, exerciseId, sessionId, limit = 20 } = params;

    return db.submission.findMany({
      where: {
        userId,
        ...(exerciseId ? { exerciseId } : {}),
        ...(sessionId ? { sessionId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        exercise: {
          select: {
            id: true,
            title: true,
            difficulty: true,
          }
        }
      }
    });
  }
}

export const submissionService = new SubmissionService();
