import { db } from '@/lib/db';

export class ProgressService {
  /**
   * Updates user progress when a lesson is completed.
   */
  async markLessonCompleted(userId: string, lessonId: string) {
    // 1. Use atomic upsert to create or update progress
    const progress = await db.userProgress.upsert({
      where: {
        userId_lessonId: {
          userId,
          lessonId,
        },
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
      create: {
        userId,
        lessonId,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Note: AI mastery refresh should be triggered asynchronously
    // outside of this transactional boundary as per architecture docs.

    return progress;
  }
}

export const progressService = new ProgressService();
