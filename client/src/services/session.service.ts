import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';
import { Phase, SessionOutcome, SessionKind } from '@prisma/client';
import { Phase as AiPhase, SessionOutcome as AiOutcome } from '@/lib/ai/types';

export interface StartSessionParams {
  userId: string;
  exerciseId?: string | null;
  generatedMissionId?: string | null;
  lessonId?: string | null;
  token?: string | null;
}

export class SessionService {
  /**
   * Starts a new practice session or returns the currently active one.
   * Supports both authored Exercise rows and AI-generated missions.
   */
  async startOrGetActiveSession(params: StartSessionParams | string, legacyExerciseId?: string) {
    // Handle backwards-compatible signature: (userId, exerciseId)
    const normalized: StartSessionParams = typeof params === 'string'
      ? { userId: params, exerciseId: legacyExerciseId }
      : params;

    const { userId, exerciseId, generatedMissionId, lessonId, token } = normalized;

    // Check for an existing IN_PROGRESS session
    try {
      const existing = await db.practiceSession.findFirst({
        where: {
          userId,
          outcome: 'IN_PROGRESS',
          ...(generatedMissionId ? { generatedMissionId } : {}),
          ...(exerciseId ? { exerciseId } : {}),
        },
        include: {
          _count: {
            select: {
              submissions: true,
              hintEvents: true,
            }
          },
          exercise: true,
          generatedMission: true,
        }
      });

      if (existing) {
        return {
          ...existing,
          attemptNumber: existing._count.submissions + 1,
          hintsUsed: existing._count.hintEvents,
        };
      }
    } catch (e) {
      console.warn('Database offline while checking existing session:', e instanceof Error ? e.message : e);
    }

    // Determine lesson / level ID for AI session creation
    let targetLessonId = lessonId || null;
    if (!targetLessonId && exerciseId) {
      try {
        const ex = await db.exercise.findUnique({
          where: { id: exerciseId },
          select: { lessonId: true }
        });
        targetLessonId = ex?.lessonId || null;
      } catch {}
    }

    // 1. Try opening session with AI Backend if token and levelId are available
    let aiSessionId: string | null = null;
    if (token && targetLessonId) {
      try {
        const aiSession = await aiClient.createSession(token, {
          levelId: targetLessonId,
          generatedMissionId: generatedMissionId || undefined,
        });
        aiSessionId = aiSession.id;
      } catch (err) {
        console.warn('AI createSession skipped or offline, creating local session:', err instanceof Error ? err.message : err);
      }
    }

    // 2. Persist PracticeSession in PostgreSQL.
    //
    // `upsert`, not `create`. When the AI backend answered it has ALREADY written this
    // row and committed it — `POST /v1/sessions` owns `practice_sessions` — so creating
    // it again is a duplicate primary key. That threw a unique-constraint error into the
    // catch below, which logged "Database offline" and returned a fabricated session
    // with a hardcoded exercise id. The better the backend worked, the more reliably the
    // client fell back to fake data.
    //
    // The update half only touches columns the backend does not own, so the two writers
    // cannot disagree about the same field.
    try {
      const session = await db.practiceSession.upsert({
        where: { id: aiSessionId ?? '__never__' },
        update: {
          exerciseId: exerciseId || null,
          generatedMissionId: generatedMissionId || null,
        },
        create: {
          ...(aiSessionId ? { id: aiSessionId } : {}),
          userId,
          exerciseId: exerciseId || null,
          generatedMissionId: generatedMissionId || null,
          kind: SessionKind.LESSON,
          // A session starts at the first phase. The AI backend opens at ENCOUNTER, and
          // this used to say EXPLORE, so a locally-created session began one phase ahead
          // of an AI-created one for the same mission.
          phase: Phase.ENCOUNTER,
          outcome: SessionOutcome.IN_PROGRESS,
          startedAt: new Date(),
        },
        include: {
          exercise: true,
          generatedMission: true,
        }
      });

      return {
        ...session,
        attemptNumber: 1,
        hintsUsed: 0,
      };
    } catch (err) {
      // Say what actually happened. This used to claim the database was offline for any
      // failure at all, including the unique-constraint error it caused itself.
      console.warn('Could not persist practice session, using in-memory fallback:', err instanceof Error ? err.message : err);
      return {
        id: aiSessionId || 'session-dev-explore-01',
        // Not a hardcoded 'ex-bakery-01'. Inventing an exercise id sends every later
        // write against this session to the wrong row.
        userId,
        exerciseId: exerciseId || null,
        generatedMissionId: generatedMissionId || null,
        kind: SessionKind.LESSON,
        phase: Phase.ENCOUNTER,
        outcome: SessionOutcome.IN_PROGRESS,
        hintsUsed: 0,
        timeSpentMs: 0,
        startedAt: new Date(),
        endedAt: null,
        attemptNumber: 1,
      };
    }
  }

  /**
   * Starts a fresh practice session unconditionally.
   */
  async startPracticeSession(params: StartSessionParams | string, legacyExerciseId?: string) {
    return this.startOrGetActiveSession(params, legacyExerciseId);
  }

  /**
   * Retrieves a practice session with all related evidence (submissions, hint events).
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
        generatedMission: true,
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
   * Advances the pedagogical phase in the 7-phase loop
   * (ENCOUNTER -> EXPLORE -> DISCOVER -> UNDERSTAND -> GUIDED_CODING -> ADAPT_REMIX -> INDEPENDENT).
   */
  async updateSessionPhase(sessionId: string, userId: string, phase: Phase, token?: string) {
    const session = await db.practiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    // Call AI service if token is available
    if (token) {
      try {
        await aiClient.updateSessionPhase(token, sessionId, { phase: phase as AiPhase });
      } catch (err) {
        console.warn('AI updateSessionPhase skipped or offline:', err instanceof Error ? err.message : err);
      }
    }

    return db.practiceSession.update({
      where: { id: sessionId },
      data: { phase },
    });
  }

  /**
   * Updates session outcome (e.g. ABANDONED or SOLVED) and optionally syncs with AI service.
   */
  async updateSessionState(
    sessionId: string,
    userId: string,
    outcome: SessionOutcome,
    token?: string
  ) {
    const session = await db.practiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    const timeSpentMs = session.startedAt
      ? Date.now() - session.startedAt.getTime()
      : 0;

    // Call AI backend closeSession endpoint if closing
    if (token && outcome !== 'IN_PROGRESS') {
      try {
        await aiClient.closeSession(token, sessionId, {
          outcome: outcome as AiOutcome,
          timeSpentMs,
        });
      } catch (err) {
        console.warn('AI closeSession skipped or offline:', err instanceof Error ? err.message : err);
      }
    }

    return db.practiceSession.update({
      where: { id: sessionId },
      data: {
        outcome,
        endedAt: outcome !== 'IN_PROGRESS' ? new Date() : null,
        timeSpentMs,
      },
    });
  }

  /**
   * Completes a practice session.
   */
  async completePracticeSession(sessionId: string, userId: string, token?: string) {
    return this.updateSessionState(sessionId, userId, SessionOutcome.SOLVED, token);
  }

  /**
   * Generates a pedagogical session debrief analyzing attempts, hints, and errors.
   */
  async getSessionDebrief(sessionId: string, userId: string, token?: string) {
    const session = await db.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        exercise: true,
        generatedMission: true,
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
        const aiDebrief = await aiClient.getSessionDebrief(token, sessionId);
        return aiDebrief;
      } catch (err) {
        console.warn('AI getSessionDebrief fallback:', err instanceof Error ? err.message : err);
      }
    }

    // Deterministic fallback
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
        ? 'إتقان استثنائي! حللت المهمة بأعلى كفاءة وبدون أي تلميحات. استمر يا بطل!'
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
