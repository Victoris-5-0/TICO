import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { sessionService } from '@/services/session.service';
import { SessionOutcome, Phase } from '@prisma/client';

const UpdateSessionSchema = z.object({
  outcome: z.enum(['IN_PROGRESS', 'SOLVED', 'ABANDONED', 'TIMED_OUT']).optional(),
  phase: z.enum(['ENCOUNTER', 'EXPLORE', 'DISCOVER', 'UNDERSTAND', 'GUIDED_CODING', 'ADAPT_REMIX', 'INDEPENDENT']).optional(),
}).refine((data) => data.outcome !== undefined || data.phase !== undefined, {
  message: 'Must provide either outcome or phase to update',
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const session = await sessionService.getSessionById(id, user.id);

    if (!session) {
      return NextResponse.json(
        { error: { message: 'Session not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: session,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const token = await getAuthToken();
    const body = await req.json();

    const parseResult = UpdateSessionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    let updatedSession = null;

    if (parseResult.data.phase) {
      updatedSession = await sessionService.updateSessionPhase(
        id,
        user.id,
        parseResult.data.phase as Phase,
        token
      );
    }

    if (parseResult.data.outcome) {
      updatedSession = await sessionService.updateSessionState(
        id,
        user.id,
        parseResult.data.outcome as SessionOutcome,
        token
      );
    }

    return NextResponse.json({
      data: updatedSession,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
