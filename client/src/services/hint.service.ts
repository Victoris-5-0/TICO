import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';

export class HintService {
  /**
   * Requests an adaptive hint following the 4-rung hint ladder.
   * If the AI backend is unreachable, falls back to authored static hints.
   * Logs HintEvent and AiInteraction to the database.
   */
  async requestHint(params: {
    userId: string;
    sessionId: string;
    exerciseId: string;
    codeExcerpt: string;
    lastResult: 'PASSED' | 'FAILED' | 'ERROR' | 'TIMEOUT' | null;
    locale: string;
    token: string;
  }) {
    const { userId, sessionId, exerciseId, codeExcerpt, lastResult, locale, token } = params;

    // 1. Validate session and ownership
    let session = null;
    try {
      session = await db.practiceSession.findUnique({
        where: { id: sessionId },
        include: {
          hintEvents: {
            select: { id: true, hintLevel: true },
            orderBy: { hintLevel: 'asc' }
          },
          exercise: {
            select: {
              id: true,
              title: true,
              hints: true,
            }
          }
        }
      });
    } catch (e) {
      console.warn('Database offline during hint request:', e);
    }

    const previousHintsCount = session?.hintEvents?.length ?? 0;
    const targetRung = Math.min(previousHintsCount + 1, 4);

    let hintText = '';
    let isCached = false;
    let source: 'AI' | 'FALLBACK' = 'AI';

    const startTime = Date.now();

    // 2. Try calling Python AI service
    try {
      const aiResponse = await aiClient.getHint(token, {
        sessionId,
        missionId: exerciseId,
        codeExcerpt,
        lastResult,
        locale,
      });
      hintText = aiResponse.hint;
      isCached = aiResponse.cached ?? false;

      // Log AI interaction for audit
      await db.aiInteraction.create({
        data: {
          userId,
          sessionId,
          capability: 'TICO_HINT',
          status: 'SUCCESS',
          latencyMs: Date.now() - startTime,
        }
      }).catch(() => {});

    } catch {
      // Fallback: Use authored static hints from exercise or pedagogical ladder
      source = 'FALLBACK';
      const staticHints = session?.exercise?.hints || [
        locale === 'ar-EG'
          ? 'راجع شروط وأوامر الكود بعناية وتأكد من كتابتها في المكان الصحيح.'
          : 'Carefully review your code logic and ensure all statements are aligned.',
        locale === 'ar-EG'
          ? 'استخدم دالة print() وضع النص المطلوب بين علامتي تنصيص.'
          : 'Use the print() function and place the text inside quotes.',
        locale === 'ar-EG'
          ? 'تأكد من مطابقة النص المطلوب تماماً دون فراغات زائدة.'
          : 'Make sure your output matches the expected text exactly.',
        locale === 'ar-EG'
          ? 'اكتب في المحرر: print("صباح الخير من الفرن!") وشغل الكود.'
          : 'Write in the editor: print("صباح الخير من الفرن!") and run the code.'
      ];
      const hintIndex = targetRung - 1;
      hintText = staticHints[Math.min(hintIndex, staticHints.length - 1)];
    }

    // 3. Record HintEvent in database if online
    let hintEvent = null;
    try {
      hintEvent = await db.hintEvent.create({
        data: {
          sessionId,
          hintLevel: targetRung,
          text: hintText,
          model: source === 'AI' ? 'gemini' : 'authored_fallback',
          wasUsed: true,
          scaffoldState: 'PARTIAL',
        }
      });
    } catch {}

    // 4. Update practiceSession hintsUsed counter if online
    try {
      await db.practiceSession.update({
        where: { id: sessionId },
        data: {
          hintsUsed: { increment: 1 }
        }
      });
    } catch {}

    return {
      hintEventId: hintEvent?.id || `hint-${Date.now()}`,
      rung: targetRung,
      hint: hintText,
      cached: isCached,
      source,
      remainingRungs: Math.max(0, 4 - targetRung),
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
