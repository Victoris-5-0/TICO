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
    const lesson = await curriculumService.getLessonById(id, user?.id);

    if (!lesson) {
      return NextResponse.json(
        { error: { message: 'Lesson not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: lesson,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('GET /api/v1/lessons/[id] error:', message);
    return NextResponse.json(
      { error: { message: 'Failed to fetch lesson' } },
      { status: 500 }
    );
  }
}
