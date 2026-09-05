import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { sessionService } from '@/services/session.service';
import { SessionOutcome } from '@prisma/client';

const UpdateSessionSchema = z.object({
  outcome: z.enum(['IN_PROGRESS', 'SOLVED', 'ABANDONED', 'TIMED_OUT']),
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
    const body = await req.json();

    const parseResult = UpdateSessionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const updated = await sessionService.updateSessionState(
      id,
      user.id,
      parseResult.data.outcome as SessionOutcome
    );

    return NextResponse.json({
      data: updated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
