import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { classroomService } from '@/services/classroom.service';

const JoinClassroomSchema = z.object({
  joinCode: z.string().min(3, 'Valid joinCode is required'),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const parseResult = JoinClassroomSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const result = await classroomService.joinClassroom(user.id, parseResult.data.joinCode);

    return NextResponse.json({
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: { message } }, { status });
  }
}
