import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { AiServiceError } from '@/lib/ai/client';
import { hintService } from '@/services/hint.service';
import { db } from '@/lib/db';

/**
 * `phase` and `guidedStep` are forwarded, not defaulted here.
 *
 * The AI service rations help by phase — `GUIDED_CODING` starts at rung 1, `ADAPT_REMIX`
 * at rung 2 because the student has already seen this code work — and uses the step to
 * keep a hint about step 2 from talking about step 1. Neither was ever sent, so every
 * remix hint was rationed as a first encounter and every guided hint aimed at step 1.
 */
const HintRequestSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  exerciseId: z.string().min(1, 'exerciseId is required'),
  codeExcerpt: z.string().default(''),
  lastResult: z.enum(['PASSED', 'FAILED', 'ERROR', 'TIMEOUT']).nullable().default(null),
  locale: z.string().default('ar-EG'),
  phase: z
    .enum(['ENCOUNTER', 'EXPLORE', 'DISCOVER', 'UNDERSTAND', 'GUIDED_CODING', 'ADAPT_REMIX', 'INDEPENDENT'])
    .optional(),
  guidedStep: z.number().int().min(0).nullable().default(null),
  errorText: z.string().max(8000).nullable().default(null),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();
    const body = await req.json();

    const parseResult = HintRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const current = await db.practiceSession.findUnique({
      where: { id: parseResult.data.sessionId },
      select: { userId: true, exerciseId: true, generatedMissionId: true },
    });
    if (!current || current.userId !== user.id ||
        (current.generatedMissionId ?? current.exerciseId) !== parseResult.data.exerciseId) {
      return NextResponse.json({ error: { message: 'Mission session not found' } }, { status: 404 });
    }

    const result = await hintService.requestHint({
      userId: user.id,
      token,
      ...parseResult.data,
    });

    return NextResponse.json({
      data: result,
    });
  } catch (error: unknown) {
    // 409 is the AI service saying this phase has no ladder — the first four phases have
    // no blank to be stuck on. Passed through as a 409 so the player can offer chat
    // instead, rather than being reported as a server fault.
    if (error instanceof AiServiceError && [401, 403, 404, 409, 422].includes(error.status)) {
      return NextResponse.json({ error: { message: error.message, code: error.code } }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    console.error('POST /api/v1/hints error:', message);
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}
