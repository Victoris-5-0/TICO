import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { submissionService } from '@/services/submission.service';

const CreateSubmissionSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  code: z.string(),
  status: z.enum(['PASSED', 'FAILED', 'ERROR', 'TIMEOUT']),
  output: z.string().default(''),
  durationMs: z.number().nonnegative().default(0),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();
    const body = await req.json();

    const parseResult = CreateSubmissionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const { sessionId, code, status, output, durationMs } = parseResult.data;

    const result = await submissionService.processSubmission(
      user.id,
      sessionId,
      code,
      token,
      { status, output, durationMs }
    );

    return NextResponse.json({
      data: result,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    console.error('POST /api/v1/submissions error:', message);
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const exerciseId = searchParams.get('exerciseId') || undefined;
    const sessionId = searchParams.get('sessionId') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20;

    const submissions = await submissionService.getSubmissions({
      userId: user.id,
      exerciseId,
      sessionId,
      limit,
    });

    return NextResponse.json({
      data: submissions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const statusCode = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status: statusCode });
  }
}
