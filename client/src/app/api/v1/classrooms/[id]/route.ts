import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { classroomService } from '@/services/classroom.service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const classroom = await classroomService.getClassroomDetails(id, user.id);

    if (!classroom) {
      return NextResponse.json(
        { error: { message: 'Classroom not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: classroom,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: { message } }, { status });
  }
}
