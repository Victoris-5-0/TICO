import { db } from '@/lib/db';

export class ProgressService {
  /**
   * Mark a lesson complete for a student, once.
   *
   * Completion is what opens the next mission on the map, so it has to be recorded by
   * whichever path reaches it — the passing submission, or the student closing out the
   * mission — without the two of them awarding the bonus twice.
   *
   * The flip of `completed` from false to true is the guard. `updateMany` reports how
   * many rows it changed, and Postgres re-evaluates the `completed: false` predicate
   * after taking the row lock, so of two concurrent callers exactly one can see a 1.
   */
  async completeLesson(
    userId: string,
    lessonId: string,
    options: { sessionId?: string | null; xp?: number } = {},
  ): Promise<{ firstCompletion: boolean; xpAwarded: number }> {
    const now = new Date();

    const flipped = await db.userProgress.updateMany({
      where: { userId, lessonId, completed: false },
      data: { completed: true, completedAt: now },
    });

    let firstCompletion = flipped.count > 0;

    if (!firstCompletion) {
      // No row yet is also a first completion; a row already marked complete is not.
      const existing = await db.userProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
        select: { completed: true },
      });
      if (!existing) {
        try {
          await db.userProgress.create({ data: { userId, lessonId, completed: true, completedAt: now } });
          firstCompletion = true;
        } catch {
          // Someone created it between the read and the write. Their completion counts.
        }
      }
    }

    if (!firstCompletion) return { firstCompletion: false, xpAwarded: 0 };

    const xpAwarded = options.xp ?? 100;
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { xp: { increment: xpAwarded } } }),
      db.xpEvent.create({
        data: {
          userId,
          sessionId: options.sessionId ?? null,
          amount: xpAwarded,
          source: 'EXERCISE_SOLVED',
          reason: 'Completed mission in world track',
        },
      }),
      db.lessonPlan.updateMany({ where: { userId, lessonId }, data: { requirement: 'DONE' } }),
    ]);

    return { firstCompletion: true, xpAwarded };
  }

  /** @deprecated Use `completeLesson`, which is idempotent and awards the bonus once. */
  async markLessonCompleted(userId: string, lessonId: string) {
    await this.completeLesson(userId, lessonId);
    return db.userProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
  }
}

export const progressService = new ProgressService();
