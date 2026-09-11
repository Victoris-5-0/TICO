import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { missionService } from '@/services/mission.service';

/**
 * One stored mission, all six phases.
 *
 * The player route renders this server-side and does not need the endpoint; it exists
 * for the client-side refetch after a remix twist and for anything that wants a
 * mission without a page around it. Enveloped as `{ data }` per docs/06.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const { id } = await params;
    const stored = await missionService.getPhasedMission(id);

    if (!stored) {
      return NextResponse.json({ error: { message: 'Mission not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: stored });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
