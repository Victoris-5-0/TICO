import { db } from '@/lib/db';
import { aiClient, AiServiceError } from '@/lib/ai/client';
import type { HintRequest, HintResponse, Phase } from '@/lib/ai/types';

/** What the player gets back, whoever wrote the words. */
export interface HintResult {
  hintEventId: string;
  rung: number;
  hint: string;
  cached: boolean;
  source: 'AI' | 'FALLBACK';
  isFinal: boolean;
  nextStep: string | null;
  remainingRungs: number;
}

/**
 * The authored ladder, one rung each, for when the AI service cannot answer.
 *
 * Four entries because the ladder has four rungs, and they climb: orient, then question,
 * then name the idea, then walk to the fix. The last one still does not hand over a
 * runnable line — the fallback has to honour the same rule the model is held to, or the
 * promise that TICO never gives the answer is only true while the service is up.
 */
const FALLBACK_LADDER: Record<string, readonly string[]> = {
  'ar-EG': [
    'بص على السطر اللي فيه الفراغ، وفكر: إيه اللي المفروض يتحسب هنا؟',
    'ارجع للمطلوب في الخطوة الحالية: إيه القيمة أو القرار اللي محتاج يتغير؟',
    'قارن الكود بالمثال اللي اتشرح في المهمة، وراجع طريقة كتابة نفس الفكرة.',
    'راجع نتيجة التشغيل، وحدد أول فرق بينها وبين المطلوب في الخطوة الحالية.',
  ],
  en: [
    'Look at the line with the blank, and think: what is meant to be worked out here?',
    'Read this step again: which value or decision needs to change?',
    'Compare your code with the example explained in this mission and check how that idea is written.',
    'Check the run result and find the first difference from what this step asks for.',
  ],
};

/**
 * Exactly what this service touches, and nothing else.
 *
 * Written out rather than taking `PrismaClient` whole because the interesting property of
 * this class is *which writes it performs* — the double-write below is what broke the
 * ladder — and a four-method surface is a claim a test can check. The real `db` satisfies
 * it structurally, so production code passes nothing.
 */
export interface HintStore {
  practiceSession: {
    findUnique(args: unknown): Promise<{
      hintEvents: { hintLevel: number }[];
      exercise: { hints: string[] } | null;
      generatedMission?: { content: unknown } | null;
    } | null>;
    update(args: unknown): Promise<unknown>;
  };
  hintEvent: {
    create(args: unknown): Promise<{ id: string }>;
    findMany(args: unknown): Promise<unknown[]>;
  };
  $transaction(operations: unknown[]): Promise<unknown[]>;
}

export interface HintSource {
  getHint(token: string, req: HintRequest): Promise<HintResponse>;
}

export class HintService {
  constructor(
    private readonly store: HintStore = db as unknown as HintStore,
    private readonly ai: HintSource = aiClient,
  ) {}

  /**
   * Ask TICO for a hint.
   *
   * **The rung is the AI service's to decide, and `hint_events` is its table to write.**
   * Both of those were done here as well, and the two writers made the ladder climb
   * 1 → 3 → 5: the Python service records a row, this method recorded a second one, and
   * the next request counted three rows and jumped a rung. A student got the
   * walk-me-through hint on their second ask, and the rung shown to them was not the rung
   * the hint had been written for. `ai-backend/app/services/hints.py` says so in its own
   * docstring — "This service does, and the Next.js layer must not."
   *
   * So on the AI path this writes nothing: no `hint_events` row, no `hintsUsed`
   * increment, no `ai_interactions` row. The service already did all three inside the
   * request, and its `rung` is what gets displayed.
   *
   * The fallback path is the opposite. Nothing else has recorded anything, so it counts
   * the rung itself and writes the row — otherwise a mission played through an outage
   * has no hint evidence at all, and mastery reads as though the student needed no help.
   */
  async requestHint(params: {
    userId: string;
    sessionId: string;
    exerciseId: string;
    codeExcerpt: string;
    lastResult: 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT' | null;
    locale: string;
    token: string;
    /**
     * Which phase they are stuck in. The ladder differs: `GUIDED_CODING` starts at rung
     * 1, `ADAPT_REMIX` at rung 2 because they have already seen this code work, and the
     * first four phases have no ladder at all. Defaulting it here meant a remix hint was
     * always rationed as though it were the first time they had seen the code.
     */
    phase?: Phase;
    /** Which guided step, so a hint for step 2 does not talk about step 1. */
    guidedStep?: number | null;
    /** The actual failing message. `lastResult` says it failed; this says how. */
    errorText?: string | null;
  }): Promise<HintResult> {
    const {
      userId, sessionId, exerciseId, codeExcerpt, lastResult, locale, token,
      phase, guidedStep, errorText,
    } = params;

    // 1. Ask the service. It owns the rung, the ladder and the evidence.
    try {
      const ai = await this.ai.getHint(token, {
        sessionId,
        missionId: exerciseId,
        codeExcerpt,
        lastResult,
        locale,
        phase,
        guidedStep: guidedStep ?? null,
        errorText: errorText ?? null,
      });

      return {
        hintEventId: ai.hintEventId,
        // The service's rung, not a count taken here. These disagreed, and the one the
        // student saw was the wrong one.
        rung: Number(ai.rung),
        hint: ai.hint,
        cached: ai.cached ?? false,
        source: 'AI',
        isFinal: ai.isFinal,
        nextStep: ai.nextStep ?? null,
        remainingRungs: ai.remainingRungs,
      };
    } catch (err) {
      // A 409 means this phase has no ladder — phases 1 to 4 have no blank to be stuck
      // on. That is not an outage and an authored hint is not the answer to it, so it is
      // re-thrown for the caller to handle rather than papered over.
      if (err instanceof AiServiceError && [401, 403, 404, 409, 422].includes(err.status)) throw err;

      console.warn(
        'hint: AI service unavailable, using the authored ladder:',
        err instanceof Error ? err.message : err,
      );
      return this.authoredHint({ userId, sessionId, exerciseId, locale, phase, guidedStep });
    }
  }

  /**
   * The fallback. Counts the rung, picks the authored line, and records the event.
   *
   * This is the only path that writes `hint_events` from the client, and it writes for
   * the same reason the service does: without a row the ladder restarts at rung 1 on the
   * next ask, and the student is told to "look at the line with the blank" forever.
   */
  private async authoredHint(params: {
    userId: string;
    sessionId: string;
    exerciseId: string;
    locale: string;
    phase?: Phase;
    guidedStep?: number | null;
  }): Promise<HintResult> {
    const { sessionId, exerciseId, locale } = params;

    let shown = 0;
    let authored: string[] = [];
    try {
      const session = await this.store.practiceSession.findUnique({
        where: { id: sessionId },
        select: {
          hintEvents: { select: { hintLevel: true } },
          exercise: { select: { hints: true } },
          generatedMission: { select: { content: true } },
        },
      });
      // The highest rung already shown, not the number of rows. Counting rows is what
      // broke the ladder when two writers were recording; reading the ceiling is correct
      // whatever else has written.
      shown = session?.hintEvents.reduce((max, e) => Math.max(max, e.hintLevel), 0) ?? 0;
      authored = session?.exercise?.hints ?? [];
      const content = session?.generatedMission?.content as {
        phases?: { guided?: { steps?: { hintAr?: string }[] }; remix?: { newRequirementAr?: string } };
      } | undefined;
      const stepHint = params.phase === 'ADAPT_REMIX'
        ? content?.phases?.remix?.newRequirementAr
        : content?.phases?.guided?.steps?.[params.guidedStep ?? 0]?.hintAr;
      if (stepHint) authored = [stepHint];
    } catch (e) {
      console.warn('hint fallback: database unreachable, serving rung 1:', e);
    }

    const rung = Math.min(shown + 1, 4);
    const ladder = authored.length ? authored : (FALLBACK_LADDER[locale] ?? FALLBACK_LADDER.en);
    const hint = ladder[Math.min(rung - 1, ladder.length - 1)];

    let hintEventId: string | null = null;
    try {
      // One transaction: a row without the counter bump makes a student look as though
      // they needed fewer hints than they did, and mastery reads that number.
      const [event] = (await this.store.$transaction([
        this.store.hintEvent.create({
          data: {
            sessionId,
            hintLevel: rung,
            text: hint,
            model: 'authored_fallback',
            wasUsed: true,
            scaffoldState: 'PARTIAL',
          },
        }),
        this.store.practiceSession.update({
          where: { id: sessionId },
          data: { hintsUsed: { increment: 1 } },
        }),
      ])) as [{ id: string }, unknown];
      hintEventId = event.id;
    } catch (e) {
      console.warn(`hint fallback: could not record the event for ${exerciseId}:`, e);
    }

    return {
      hintEventId: hintEventId ?? `hint-${Date.now()}`,
      rung,
      hint,
      cached: false,
      source: 'FALLBACK',
      isFinal: rung >= 4,
      nextStep: rung >= 4 ? 'mini_practice' : null,
      remainingRungs: Math.max(0, 4 - rung),
    };
  }

  /**
   * Retrieves all hint events previously recorded for a session.
   */
  async getSessionHints(sessionId: string, userId: string) {
    const session = await db.practiceSession.findUnique({
      where: { id: sessionId },
      select: { userId: true }
    });

    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    return db.hintEvent.findMany({
      where: { sessionId },
      orderBy: { hintLevel: 'asc' }
    });
  }
}

export const hintService = new HintService();
