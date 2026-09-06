import { headers } from 'next/headers';
import { createClient } from './supabase/server';
import { db } from './db';
import { User } from '@prisma/client';

/**
 * Extracts Bearer token from incoming request headers if present.
 */
async function getBearerTokenFromHeader(): Promise<string | null> {
  try {
    const headerList = await headers();
    const authHeader = headerList.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
  } catch {
    // headers() might not be available in non-request contexts
  }
  return null;
}

/**
 * Retrieves the currently authenticated user session from Supabase.
 * Returns null if not authenticated or if Supabase is unconfigured.
 */
export async function getSession() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  try {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      return null;
    }
    
    return session;
  } catch (error) {
    console.warn('Supabase getSession encountered an error:', error);
    return null;
  }
}

/**
 * Returns the active Bearer token for AI / backend requests.
 * In development, provides a fallback dev token if no session is active.
 */
export async function getAuthToken(): Promise<string> {
  const headerToken = await getBearerTokenFromHeader();
  if (headerToken) {
    return headerToken;
  }

  const session = await getSession();
  if (session?.access_token) {
    return session.access_token;
  }
  return 'dev-bearer-token-tico-platform';
}

/**
 * Retrieves the fully populated user object from the database.
 * Supports Supabase session, HTTP Bearer tokens, or local dev mock explorer.
 */
export async function getCurrentUser() {
  const bearerToken = await getBearerTokenFromHeader();
  const session = await getSession();
  
  const tokenUserId = session?.user?.id;
  const tokenEmail = session?.user?.email;

  if (tokenUserId || tokenEmail) {
    try {
      const user = await db.user.findFirst({
        where: {
          OR: [
            ...(tokenUserId ? [{ id: tokenUserId }] : []),
            ...(tokenEmail ? [{ email: tokenEmail }] : [])
          ]
        }
      });
      if (user) return user;

      // First-time sign-in Just-In-Time (JIT) provisioning
      if (tokenEmail) {
        const metadata = (session?.user as { user_metadata?: Record<string, string> })?.user_metadata || {};
        const newUser = await db.user.create({
          data: {
            id: tokenUserId || undefined,
            email: tokenEmail,
            name: metadata.full_name || metadata.name || tokenEmail.split('@')[0],
            avatarUrl: metadata.avatar_url || '/assets/characters/tico/tico-neutral.webp',
            role: 'STUDENT',
            bio: null,
            xp: 0,
            streak: 0,
          }
        });
        return newUser;
      }
    } catch (e) {
      console.warn('Database error while finding/provisioning user by session:', e);
    }
  }

  // If a bearer token was provided in header, check if it maps to a user ID or email
  if (bearerToken && bearerToken !== 'dev-bearer-token-tico-platform') {
    try {
      const user = await db.user.findFirst({
        where: {
          OR: [
            { id: bearerToken },
            { email: bearerToken }
          ]
        }
      });
      if (user) return user;
    } catch {
      // Database offline or query failed
    }
  }

  // Fallback for local development or prototype testing
  if (process.env.NODE_ENV !== 'production') {
    try {
      const fallbackUser = await db.user.findFirst({
        where: { role: 'STUDENT' },
        orderBy: { createdAt: 'asc' }
      });
      if (fallbackUser) return fallbackUser;
    } catch {
      // In-memory dev user when database is offline or unmigrated
    }

    const fallbackDevUser: User = {
      id: 'dev-student-id-01',
      email: 'student@tico.dev',
      role: 'STUDENT',
      name: 'Adham (Dev Explorer)',
      bio: null,
      avatarUrl: '/assets/characters/tico/tico-neutral.webp',
      xp: 450,
      streak: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return fallbackDevUser;
  }
  
  return null;
}

/**
 * Ensures the request is authenticated.
 * Throws an error if no valid user is found.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
