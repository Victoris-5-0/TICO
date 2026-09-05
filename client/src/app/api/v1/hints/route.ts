import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { hintService } from '@/services/hint.service';

const HintRequestSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  exerciseId: z.string().min(1, 'exerciseId is required'),
  codeExcerpt: z.string().default(''),
  lastResult: z.enum(['PASSED', 'FAILED', 'ERROR', 'TIMEOUT']).nullable().default(null),
  locale: z.string().default('ar-EG'),
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

    const { sessionId, exerciseId, codeExcerpt, lastResult, locale } = parseResult.data;

    const result = await hintService.requestHint({
      userId: user.id,
      sessionId,
      exerciseId,
      codeExcerpt,
      lastResult,
      locale,
      token,
    });

    return NextResponse.json({
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    console.error('POST /api/v1/hints error:', message);
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}
