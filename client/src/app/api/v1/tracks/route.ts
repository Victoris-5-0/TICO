import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { curriculumService } from '@/services/curriculum.service';

export async function GET() {
  try {
    const user = await getCurrentUser();
    const tracks = await curriculumService.getTracks(user?.id);

    return NextResponse.json({
      data: tracks,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('GET /api/v1/tracks error:', message);
    return NextResponse.json(
      { error: { message: 'Failed to fetch tracks' } },
      { status: 500 }
    );
  }
}
