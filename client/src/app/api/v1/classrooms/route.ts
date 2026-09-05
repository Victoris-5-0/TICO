import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { classroomService } from '@/services/classroom.service';

const CreateClassroomSchema = z.object({
  name: z.string().min(1, 'Classroom name is required'),
  trackId: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const classrooms = await classroomService.getClassroomsForTeacher(user.id);

    return NextResponse.json({
      data: classrooms,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const parseResult = CreateClassroomSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid payload', details: parseResult.error.flatten() } },
        { status: 400 }
      );
    }

    const classroom = await classroomService.createClassroom(
      user.id,
      parseResult.data.name,
      parseResult.data.trackId
    );

    return NextResponse.json({
      data: classroom,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
