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
 * proxy routes. The token is opaque and is validated against PostgreSQL.
 */
export async function getSession() {
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
}

export async function getAuthToken(): Promise<string> {
  const headerToken = await getBearerTokenFromHeader();
  if (headerToken) return headerToken;

  const session = await getSession();
  if (!session?.access_token) throw new Error('Unauthorized');
  return session.access_token;
}

/** Resolve either a request Bearer token or the signed Better Auth cookie. */
export async function getCurrentUser() {
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
    return db.user.findUnique({ where: { id: session.user.id } });
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}
