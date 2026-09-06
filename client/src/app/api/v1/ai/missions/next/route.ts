import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthToken } from '@/lib/auth';
import { missionService } from '@/services/mission.service';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const token = await getAuthToken();
    const body = await req.json();

    if (!body.lessonId) {
      return NextResponse.json({ error: { message: 'lessonId is required' } }, { status: 400 });
    }

    const mission = await missionService.getNextMission(
      user.id,
      body.lessonId,
      token,
      {
        forceRegenerate: body.forceRegenerate,
        worldManifestVersion: body.worldManifestVersion,
      }
    );

    return NextResponse.json({ data: mission });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const token = await getAuthToken();
    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get('lessonId');

    if (!lessonId) {
      return NextResponse.json({ error: { message: 'lessonId is required' } }, { status: 400 });
    }

    const forceRegenerate = searchParams.get('forceRegenerate') === 'true';
    const worldManifestVersion = searchParams.get('worldManifestVersion') || undefined;

    const mission = await missionService.getNextMission(
      user.id,
      lessonId,
      token,
      {
        forceRegenerate,
        worldManifestVersion,
      }
    );

    return NextResponse.json({ data: mission });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

