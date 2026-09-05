import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { sessionService } from '@/services/session.service';

const CreateSessionSchema = z.object({
  exerciseId: z.string().min(1, 'exerciseId is required'),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const parseResult = CreateSessionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const session = await sessionService.startOrGetActiveSession(
      user.id,
      parseResult.data.exerciseId
    );

    return NextResponse.json({
      data: session,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json(
      { error: { message } },
      { status }
    );
  }
}
