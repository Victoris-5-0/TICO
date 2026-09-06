import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, getAuthToken } from '@/lib/auth';
import { sessionService } from '@/services/session.service';

const CreateSessionSchema = z.object({
  exerciseId: z.string().optional().nullable(),
  generatedMissionId: z.string().optional().nullable(),
  lessonId: z.string().optional().nullable(),
}).refine((data) => data.exerciseId || data.generatedMissionId || data.lessonId, {
  message: 'At least one of exerciseId, generatedMissionId, or lessonId must be provided',
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const token = await getAuthToken();
    const body = await req.json();

    const parseResult = CreateSessionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const session = await sessionService.startOrGetActiveSession({
      userId: user.id,
      exerciseId: parseResult.data.exerciseId,
      generatedMissionId: parseResult.data.generatedMissionId,
      lessonId: parseResult.data.lessonId,
      token,
    });

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
