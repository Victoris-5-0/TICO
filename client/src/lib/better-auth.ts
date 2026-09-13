import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { nextCookies } from 'better-auth/next-js';

import { db } from '@/lib/db';

const guestPlugin = () => ({
  id: 'guest',
  endpoints: {
    signInGuest: createAuthEndpoint(
      '/sign-in/guest',
      { method: 'POST' },
      async (ctx) => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const email = `guest-${id}@guest.tico.local`;
        const user = await ctx.context.internalAdapter.createUser(
          {
            email,
            name: 'Guest',
            emailVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { method: 'anonymous' }
        );
        const session = await ctx.context.internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        return ctx.json({ token: session.token, user });
      }
    ),
  },
});

export const auth = betterAuth({
  appName: 'TICO',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: 'postgresql' }),
  user: {
    fields: { image: 'avatarUrl' },
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'STUDENT' },
      xp: { type: 'number', required: false, defaultValue: 0 },
      streak: { type: 'number', required: false, defaultValue: 0 },
      bio: { type: 'string', required: false },
    },
  },
  session: {
    modelName: 'authSession',
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  account: {
    modelName: 'authAccount',
    accountLinking: { disableImplicitLinking: true },
    encryptOAuthTokens: true,
  },
  verification: { modelName: 'authVerification' },
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: 'select_account',
    },
  },
  plugins: [guestPlugin(), nextCookies()],
});
