import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma otherwise opens `2 * CPUs + 1` connections per process. That is 13 on the
 * common development machine, and a Next dev server plus one utility script can exhaust
 * the shared Supabase pool. Keep the pool deliberately small and give a slow pooled
 * connection enough time to recover. Explicit URL settings still win.
 */
function pooledDatabaseUrl(raw = process.env.DATABASE_URL): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.port !== "6543") return raw;
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "5");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "10");
    return url.toString();
  } catch {
    return raw;
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: pooledDatabaseUrl(),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export default db;
