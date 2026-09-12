import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getAuthToken } from '@/lib/auth';
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

    // Read the phases through the AI service, like the player page does, so both routes
    // render the same mission. A missing token only costs that hop — `getPhasedMission`
    // falls back to the stored row.
    let token = '';
    try {
      token = await getAuthToken();
    } catch {
      // Not signed in for the service call; the stored row still answers.
    }

    const stored = await missionService.getPhasedMission(id, token);

    if (!stored) {
      return NextResponse.json({ error: { message: 'Mission not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: stored });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}
