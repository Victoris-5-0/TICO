import test from 'node:test';
import assert from 'node:assert/strict';
import { AiClient, AiServiceError } from './client';

test('chat calls the versioned SSE endpoint with a bearer session and exact request body', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url),'https://ai.example.invalid/v1/tico/messages');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'),'Bearer test-session-token');
    assert.ok(headers.get('X-Request-ID'));
    assert.equal(init?.method,'POST');
    assert.deepEqual(JSON.parse(String(init?.body)),{sessionId:'owned-session',message:'What is a variable?'});
    assert.ok(init?.signal);
    return new Response('data: {"delta":"Hello","done":true}\n\n',{headers:{'Content-Type':'text/event-stream'}});
  });
  const previous = process.env.AI_SERVICE_URL;
  process.env.AI_SERVICE_URL = 'https://ai.example.invalid/';
  try {
    const result = await new AiClient().streamTicoMessage('test-session-token',{sessionId:'owned-session',message:'What is a variable?'});
    assert.equal(result.headers.get('Content-Type'),'text/event-stream');
    assert.match(await result.text(),/Hello/);
  } finally {
    if(previous===undefined) delete process.env.AI_SERVICE_URL; else process.env.AI_SERVICE_URL=previous;
  }
});

test('an unconfigured chat fails before making a network request', async () => {
  const previous = process.env.AI_SERVICE_URL;
  const fallback = process.env.AI_BACKEND_URL;
  delete process.env.AI_SERVICE_URL;
  delete process.env.AI_BACKEND_URL;
  try {
    await assert.rejects(new AiClient().streamTicoMessage('token',{sessionId:'s',message:'Hi'}),
      (error: unknown) => error instanceof AiServiceError && error.code==='NOT_CONFIGURED');
  } finally {
    if(previous!==undefined) process.env.AI_SERVICE_URL=previous;
    if(fallback!==undefined) process.env.AI_BACKEND_URL=fallback;
  }
});
