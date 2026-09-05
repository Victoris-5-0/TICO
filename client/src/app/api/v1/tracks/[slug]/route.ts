import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { curriculumService } from '@/services/curriculum.service';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const user = await getCurrentUser();
    const track = await curriculumService.getTrackBySlug(slug, user?.id);

    if (!track) {
      return NextResponse.json(
        { error: { message: 'Track not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: track,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('GET /api/v1/tracks/[slug] error:', message);
    return NextResponse.json(
      { error: { message: 'Failed to fetch track details' } },
      { status: 500 }
    );
  }
}
