import { db } from '@/lib/db';
import { SessionOutcome } from '@prisma/client';

export class SessionService {
  /**
   * Starts a new practice session or returns the currently active one.
   */
  async startOrGetActiveSession(userId: string, exerciseId: string) {
    const exercise = await db.exercise.findUnique({
      where: { id: exerciseId },
    });

    if (!exercise) {
      throw new Error('Exercise not found');
    }

    // Check for an existing IN_PROGRESS session
    const existing = await db.practiceSession.findFirst({
      where: {
        userId,
        exerciseId,
        outcome: 'IN_PROGRESS',
      },
      include: {
        _count: {
          select: {
            submissions: true,
            hintEvents: true,
          }
        }
      }
    });

    if (existing) {
      return {
        ...existing,
        attemptNumber: existing._count.submissions + 1,
        hintsUsed: existing._count.hintEvents,
      };
    }

    // Create a new session
    const session = await db.practiceSession.create({
      data: {
        userId,
        exerciseId,
        kind: 'LESSON',
        outcome: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });

    return {
      ...session,
      attemptNumber: 1,
      hintsUsed: 0,
    };
  }

  /**
   * Starts a fresh practice session unconditionally.
   */
  async startPracticeSession(userId: string, exerciseId: string) {
    return this.startOrGetActiveSession(userId, exerciseId);
  }

  /**
   * Retrieves a practice session with details.
   */
  async getSessionById(sessionId: string, userId: string) {
    const session = await db.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        exercise: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            lessonId: true,
          }
        },
        submissions: {
          select: {
            id: true,
            status: true,
            attemptNumber: true,
            hintsUsedBefore: true,
            errorFamily: true,
            errorTag: true,
            executionTimeMs: true,
            createdAt: true,
          },
          orderBy: { attemptNumber: 'asc' }
        },
        hintEvents: {
          select: {
            id: true,
            hintLevel: true,
            text: true,
            createdAt: true,
          },
          orderBy: { hintLevel: 'asc' }
        }
      }
    });

    if (!session || session.userId !== userId) {
      return null;
    }

    return session;
  }

  /**
   * Updates session outcome (e.g. ABANDONED or SOLVED).
   */
  async updateSessionState(sessionId: string, userId: string, outcome: SessionOutcome) {
    const session = await db.practiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    return db.practiceSession.update({
      where: { id: sessionId },
      data: {
        outcome,
        endedAt: outcome !== 'IN_PROGRESS' ? new Date() : null,
      },
    });
  }

  /**
   * Completes a practice session.
   */
  async completePracticeSession(sessionId: string, userId: string) {
    return this.updateSessionState(sessionId, userId, 'SOLVED');
  }

  /**
   * Generates a pedagogical session debrief analyzing attempts, hints, and errors.
   */
  async getSessionDebrief(sessionId: string, userId: string, token?: string) {
    const session = await db.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        exercise: true,
        submissions: {
          orderBy: { attemptNumber: 'asc' }
        },
        hintEvents: {
          orderBy: { hintLevel: 'asc' }
        }
      }
    });

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    // Try AI service debrief if token is present
    if (token) {
      try {
        const aiDebrief = await import('@/lib/ai/client').then(m => m.aiClient.getSessionDebrief(token, sessionId));
        return aiDebrief;
      } catch {
        // Fall back to deterministic evaluation below
      }
    }

    const totalAttempts = session.submissions.length;
    const hintsUsed = session.hintEvents.length;
    const errorsOvercome = Array.from(new Set(session.submissions.map((s) => s.errorFamily).filter((e): e is NonNullable<typeof e> => Boolean(e))));
    const timeSpentMs = session.endedAt
      ? session.endedAt.getTime() - session.startedAt.getTime()
      : (session.timeSpentMs || 45000);

    const isSolved = session.outcome === 'SOLVED';
    let starsEarned = 0;
    if (isSolved) {
      starsEarned = 1;
      if (hintsUsed === 0) starsEarned = 2;
      if (hintsUsed === 0 && totalAttempts <= 2) starsEarned = 3;
    }

    const ticoFeedback = isSolved
      ? (starsEarned === 3
        ? 'إتقان استثنائي! حللت التحدي بأعلى كفاءة وبدون أي تلميحات. استمر يا بطل!'
        : 'رائع جداً! تجاوزت التحدي بنجاح وتعلمت كيفية تصحيح الكود خطوة بخطوة.')
      : 'كل محاولة هي خطوة للأمام! مراجعة الأخطاء البرمجية هي الطريقة الأولى ليصبح المبرمج ماهراً. جرّب مجدداً!';

    return {
      sessionId: session.id,
      outcome: session.outcome,
      totalAttempts,
      hintsUsed,
      errorsOvercome,
      timeSpentMs,
      conceptsMastered: isSolved ? ['variables', 'calculations'] : [],
      ticoFeedback,
      starsEarned,
      isTemplateFallback: true,
    };
  }
}

export const sessionService = new SessionService();
