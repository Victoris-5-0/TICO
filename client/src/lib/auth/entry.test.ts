import test from 'node:test';
import assert from 'node:assert/strict';
import { accountDestination, OnboardingSchema, provisionGoogleAccount } from './entry';

const identity = { id: 'verified-subject', email: 'example@example.test', user_metadata: {} };

test('new identities are marked before provisioning, then enter localized onboarding', async () => {
  const calls: string[] = [];
  const required = await provisionGoogleAccount(identity, {
    exists: async () => false,
    markOnboarding: async () => { calls.push('mark'); },
    createIfMissing: async user => { assert.equal(user.id, identity.id); calls.push('create'); },
  });
  assert.deepEqual(calls, ['mark', 'create']);
  assert.equal(accountDestination('en', required), '/en/onboarding');
});

test('returning accounts bypass onboarding without overwriting their profile', async () => {
  const unexpected = async () => { assert.fail('Returning profile must not be mutated'); };
  assert.equal(await provisionGoogleAccount(identity, { exists: async () => true, markOnboarding: unexpected, createIfMissing: unexpected }), false);
});

test('interrupted onboarding resumes on the next sign-in', async () => {
  const required = await provisionGoogleAccount({ ...identity, user_metadata: { onboarding_required: true } }, {
    exists: async () => true, markOnboarding: async () => {}, createIfMissing: async () => {},
  });
  assert.equal(accountDestination('ar-EG', required), '/ar-EG/onboarding');
});

test('provisioning failures do not produce a successful login destination', async () => {
  await assert.rejects(provisionGoogleAccount(identity, { exists: async () => false, markOnboarding: async () => {}, createIfMissing: async () => { throw new Error('offline'); } }), /offline/);
});

test('missing email is rejected before any provisioning', async () => {
  let touched = false;
  await assert.rejects(provisionGoogleAccount({ ...identity, email: undefined }, { exists: async () => { touched = true; return false; }, markOnboarding: async () => {}, createIfMissing: async () => {} }));
  assert.equal(touched, false);
});

test('setup validates coarse age bands and mode, trims names, and rejects invalid locale', () => {
  const valid = { name: '  Learner  ', ageBand: 'TEEN', mode: 'LEARNER', locale: 'en' };
  assert.equal(OnboardingSchema.parse(valid).name, 'Learner');
  for (const override of [{ name: ' ' }, { name: 'a'.repeat(81) }, { ageBand: '12' }, { mode: 'ADMIN' }, { locale: '//example.com' }]) assert.equal(OnboardingSchema.safeParse({ ...valid, ...override }).success, false);
});

test('a failed onboarding marker write stops account provisioning', async () => {
  let created = false;
  await assert.rejects(provisionGoogleAccount(identity, {
    exists: async () => false,
    markOnboarding: async () => { throw new Error('marker unavailable'); },
    createIfMissing: async () => { created = true; },
  }), /marker unavailable/);
  assert.equal(created, false);
});
