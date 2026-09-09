import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';

import { db } from '@/lib/db';

export const auth = betterAuth({
  appName: 'TICO',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: 'postgresql' }),
  user: {
    fields: { image: 'avatarUrl' },
  },
  session: { modelName: 'authSession' },
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
  plugins: [nextCookies()],
});
