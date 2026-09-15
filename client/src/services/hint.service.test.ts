import test from 'node:test';
import assert from 'node:assert/strict';

import { AiServiceError } from '@/lib/ai/client';
import { HintService, type HintSource, type HintStore } from './hint.service';

/**
 * The ladder has to climb 1, 2, 3, 4.
 *
 * It climbed 1, 3, 5 for a while, because the AI service records a `hint_events` row and
 * this layer recorded a second one for the same ask. The next request counted three rows
 * and skipped a rung, so a student got the walk-me-through hint on their second ask —
 * and the rung displayed to them was not the rung the hint had been written for.
 *
 * `ai-backend/app/services/hints.py` states the rule in its own docstring: "This service
 * does, and the Next.js layer must not." These tests are that rule, checked.
 */

/** Every write recorded rather than performed, so the test can assert on the set. */
function fakeStore(shownRungs: number[] = [1, 2]) {
  const writes: string[] = [];
  const store: HintStore = {
    practiceSession: {
      findUnique: async () => ({
        hintEvents: shownRungs.map((hintLevel) => ({ hintLevel })),
        exercise: { hints: ['authored one', 'authored two', 'authored three', 'authored four'] },
      }),
      update: async () => {
        writes.push('practiceSession.update');
        return {};
      },
    },
    hintEvent: {
      create: async () => {
        writes.push('hintEvent.create');
        return { id: 'local-event' };
      },
      findMany: async () => [],
    },
    $transaction: async (operations) => Promise.all(operations as Promise<unknown>[]),
  };
  return { store, writes };
}

const ASK = {
  userId: 'u1',
  sessionId: 's1',
  exerciseId: 'm1',
  codeExcerpt: 'total = ___',
  lastResult: 'FAILED' as const,
  locale: 'ar-EG',
  token: 'tok',
};

test('an outage uses the replayed mission current step hint', async () => {
  const { store } = fakeStore();
  store.practiceSession.findUnique = async () => ({
    hintEvents: [], exercise: null,
    generatedMission: { content: { phases: { guided: { steps: [
      { hintAr: 'first step' }, { hintAr: 'current replayed step' },
    ] } } } },
  });
  const ai: HintSource = { getHint: async () => { throw new Error('offline'); } };
  const result = await new HintService(store, ai).requestHint({ ...ASK, phase: 'GUIDED_CODING', guidedStep: 1 });
  assert.equal(result.hint, 'current replayed step');
});

test('a mismatched mission is not disguised as an AI outage', async () => {
  const { store, writes } = fakeStore();
  const ai: HintSource = { getHint: async () => {
    throw new AiServiceError('wrong mission', 'not_found', 'req', false, 404);
  } };
  await assert.rejects(new HintService(store, ai).requestHint(ASK), /wrong mission/);
  assert.deepEqual(writes, []);
});

test('the service rung is displayed, and nothing is written locally', async () => {
  const { store, writes } = fakeStore();
  const ai: HintSource = {
    getHint: async () => ({
      rung: 3,
      hint: 'TICO says something',
      isFinal: false,
      nextStep: null,
      remainingRungs: 1,
      hintEventId: 'server-event',
      cached: true,
    }),
  };

  const result = await new HintService(store, ai).requestHint(ASK);

  // The rung the hint was written for — not a count taken here.
  assert.equal(result.rung, 3);
  assert.equal(result.hintEventId, 'server-event');
  assert.equal(result.source, 'AI');
  assert.equal(result.cached, true);

  // The whole bug, in one assertion.
  assert.deepEqual(writes, []);
});

test('phase and guided step reach the service', async () => {
  const { store } = fakeStore();
  let sent: Record<string, unknown> = {};
  const ai: HintSource = {
    getHint: async (_token, req) => {
      sent = req as unknown as Record<string, unknown>;
      return { rung: 2, hint: 'x', isFinal: false, nextStep: null, remainingRungs: 2, hintEventId: 'e', cached: false };
    },
  };

  await new HintService(store, ai).requestHint({
    ...ASK,
    phase: 'ADAPT_REMIX',
    guidedStep: 2,
    errorText: 'NameError',
  });

  // The ladder starts a rung higher in the remix, and a hint for step 2 must not talk
  // about step 1. Neither is possible if these do not arrive.
  assert.equal(sent.phase, 'ADAPT_REMIX');
  assert.equal(sent.guidedStep, 2);
  assert.equal(sent.errorText, 'NameError');
});

test('an unreachable service falls back to the authored ladder and records it', async () => {
  const { store, writes } = fakeStore([1, 2]);
  const ai: HintSource = {
    getHint: async () => {
      throw new Error('ECONNREFUSED');
    },
  };

  const result = await new HintService(store, ai).requestHint(ASK);

  // Rung 3 because the highest rung already shown was 2. Reading the ceiling rather than
  // counting rows is what keeps this right no matter who else has written.
  assert.equal(result.rung, 3);
  assert.equal(result.source, 'FALLBACK');
  assert.equal(result.hint, 'authored three');

  // Nothing else recorded this one, so the fallback must — otherwise the ladder restarts
  // at rung 1 on the next ask, and mastery reads as though no help was needed.
  assert.deepEqual(writes.sort(), ['hintEvent.create', 'practiceSession.update']);
});

test('the fallback ladder stops at rung 4 rather than running off the end', async () => {
  const { store } = fakeStore([1, 2, 3, 4]);
  const ai: HintSource = {
    getHint: async () => {
      throw new Error('down');
    },
  };

  const result = await new HintService(store, ai).requestHint(ASK);
  assert.equal(result.rung, 4);
  assert.equal(result.isFinal, true);
  // After the last rung the student goes to a mini-practice, never to the answer.
  assert.equal(result.nextStep, 'mini_practice');
  assert.equal(result.remainingRungs, 0);
});

test('a phase with no ladder is re-thrown rather than answered with an authored hint', async () => {
  const { store, writes } = fakeStore();
  const ai: HintSource = {
    getHint: async () => {
      throw new AiServiceError('ENCOUNTER has no hint ladder', 'conflict', 'req-1', false, 409);
    },
  };

  await assert.rejects(
    () => new HintService(store, ai).requestHint({ ...ASK, phase: 'ENCOUNTER' }),
    /no hint ladder/,
  );
  // A phase with no blank to be stuck on has no hint. Serving one anyway would answer a
  // question the student did not ask.
  assert.deepEqual(writes, []);
});
