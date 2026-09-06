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
    const session = await db.practiceSession.findUnique({
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

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    let resolvedExerciseId = session.exerciseId;
    if (!resolvedExerciseId && session.generatedMissionId) {
      const gm = await db.generatedMission.findUnique({
        where: { id: session.generatedMissionId },
        include: { template: { include: { track: { include: { lessons: { include: { exercises: true } } } } } } }
      });
      resolvedExerciseId = gm?.template.track.lessons[0]?.exercises[0]?.id || null;
    }

    if (!resolvedExerciseId) {
      throw new Error('Session is not associated with an exercise or valid template');
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

    // Prefetch read data outside transaction to minimize lock time
    let targetLessonId: string | null = null;
    if (session.exerciseId) {
      const exercise = await db.exercise.findUnique({
        where: { id: session.exerciseId },
        select: { lessonId: true }
      });
      targetLessonId = exercise?.lessonId || null;
    } else if (resolvedExerciseId) {
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

    await db.$transaction(async (tx) => {
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
