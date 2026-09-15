import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { aiClient, AiServiceError } from '@/lib/ai/client';
import { z } from 'zod';
import { getAnalysis } from '@/services/analysis.service';

const messageSchema = z.object({
  sessionId: z.string().trim().min(1).max(200).nullable().optional(),
  message: z.string().trim().min(1).max(2000),
  page: z.enum(['mission', 'landing', 'analysis']).default('mission'),
  locale: z.enum(['ar-EG', 'en']).default('ar-EG'),
  conversationId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
}).strict().refine(body => body.page !== 'mission' || Boolean(body.sessionId));

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.access_token) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const parsed = messageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: { message: 'A mission session and message are required' } }, { status: 400 });
    }

    // The TICO endpoint expects an SSE stream from the AI backend.
    // We proxy it using a ReadableStream and preserve the response headers.
    const body = parsed.data;
    let analysisSummary;
    if (body.page === 'analysis') {
      const analysis = await getAnalysis(session.user.id);
      analysisSummary = {
        submissions: analysis.totals.submissions,
        passed: analysis.totals.passed,
        hints: analysis.totals.hints,
        hintsPerAttempt: analysis.totals.hintsPerAttempt,
        minutes: analysis.totals.minutes,
        conceptsComplete: analysis.totals.conceptsComplete,
        tagsOvercome: analysis.totals.tagsOvercome,
        currentStreak: analysis.streak.current,
        longestStreak: analysis.streak.longest,
        activeDays: analysis.streak.activeDays,
      };
    }
    const aiResponse = await aiClient.streamTicoMessage(session.access_token, {
      ...body,
      ...(analysisSummary ? { analysisSummary } : {}),
    }, req.signal);

    if (!aiResponse.ok) {
      console.error('AI TICO Message Error:', aiResponse.status);
      return NextResponse.json({ error: { message: 'Failed to stream TICO message' } }, { status: aiResponse.status });
    }

    // Forward the SSE response directly to the client
    return new NextResponse(aiResponse.body, {
      status: aiResponse.status,
      headers: {
        'Content-Type': aiResponse.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('AI TICO Stream Error:', message);
    return NextResponse.json({ error: { message: 'TICO is temporarily unavailable' } }, {
      status: error instanceof AiServiceError && error.code === 'NOT_CONFIGURED' ? 503 : 502,
    });
  }
}
