import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { curriculumService } from '@/services/curriculum.service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const exercise = await curriculumService.getExerciseById(id, user?.id);

    if (!exercise) {
      return NextResponse.json(
        { error: { message: 'Exercise not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: exercise,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('GET /api/v1/exercises/[id] error:', message);
    return NextResponse.json(
      { error: { message: 'Failed to fetch exercise' } },
      { status: 500 }
    );
  }
}
