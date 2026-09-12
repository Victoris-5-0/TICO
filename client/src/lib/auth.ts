import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from './better-auth';
import { db } from './db';

async function getBearerTokenFromHeader(): Promise<string | null> {
  try {
    const authHeader = (await headers()).get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7).trim() || null;
    }
  } catch {
    // Request headers are unavailable in build-time and non-request contexts.
  }
  return null;
}

/**
 * Returns the active Better Auth session in the small shape used by the AI
 * proxy routes. Deduped per-request via React cache.
 */
export const getSession = cache(async () => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    return {
      user: session.user,
      access_token: session.session.token,
    };
  } catch {
    return null;
  }
});

export async function getAuthToken(): Promise<string> {
  const headerToken = await getBearerTokenFromHeader();
  if (headerToken) return headerToken;

  const session = await getSession();
  if (!session?.access_token) throw new Error('Unauthorized');
  return session.access_token;
}

/** Resolve either a request Bearer token or the signed Better Auth cookie. Deduped per-request. */
export const getCurrentUser = cache(async () => {
  try {
    const bearerToken = await getBearerTokenFromHeader();
    if (bearerToken) {
      const session = await db.authSession.findUnique({
        where: { token: bearerToken },
        select: { expiresAt: true, user: true },
      });
      return session && session.expiresAt > new Date() ? session.user : null;
    }

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;

    const u = session.user as Record<string, unknown>;
    return {
      id: String(u.id),
      name: (u.name as string | null) ?? null,
      email: (u.email as string | null) ?? null,
      avatarUrl: (u.avatarUrl as string | null) ?? (u.image as string | null) ?? null,
      role: (u.role as 'STUDENT' | 'TEACHER' | 'ADMIN') ?? 'STUDENT',
      bio: (u.bio as string | null) ?? null,
      xp: typeof u.xp === 'number' ? u.xp : 0,
      streak: typeof u.streak === 'number' ? u.streak : 0,
      createdAt: u.createdAt ? new Date(u.createdAt as string | number | Date) : new Date(),
      updatedAt: u.updatedAt ? new Date(u.updatedAt as string | number | Date) : new Date(),
    };
  } catch {
    return null;
  }
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
