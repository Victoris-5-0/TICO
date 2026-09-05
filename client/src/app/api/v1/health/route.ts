import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiClient } from '@/lib/ai/client';

export async function GET() {
  const startTime = Date.now();

  let databaseOk = false;
  let databaseLatencyMs = 0;
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1;`;
    databaseLatencyMs = Date.now() - dbStart;
    databaseOk = true;
  } catch (error) {
    console.error('Health check database error:', error);
  }

  const aiHealth = await aiClient.checkHealth();

  const isHealthy = databaseOk; // DB is critical, AI degradation is tracked
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    totalLatencyMs: Date.now() - startTime,
    dependencies: {
      database: {
        status: databaseOk ? 'up' : 'down',
        latencyMs: databaseLatencyMs,
      },
      aiBackend: {
        status: aiHealth.reachable ? 'up' : 'down',
        latencyMs: aiHealth.latencyMs,
      }
    }
  }, { status: statusCode });
}
