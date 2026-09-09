import test from 'node:test';
import assert from 'node:assert/strict';
import { accountDestination, OnboardingSchema } from './entry';

test('new users enter localized onboarding and returning users enter learning', () => {
  assert.equal(accountDestination('en', true), '/en/onboarding');
  assert.equal(accountDestination('ar-EG', false), '/ar-EG/learn');
});

test('setup validates coarse age bands and mode, trims names, and rejects invalid locale', () => {
  const valid = { name: '  Learner  ', ageBand: 'TEEN', mode: 'LEARNER', locale: 'en', gender: 'MALE', avatarUrl: '/assets/characters/tico/tico-neutral.webp' };
  const parsed = OnboardingSchema.parse(valid);
  assert.equal(parsed.name, 'Learner');
  assert.equal(parsed.gender, 'MALE');
  assert.equal(parsed.avatarUrl, '/assets/characters/tico/tico-neutral.webp');

  const defaultGender = OnboardingSchema.parse({ name: 'Learner', ageBand: 'TEEN', mode: 'LEARNER', locale: 'en' });
  assert.equal(defaultGender.gender, 'PREFER_NOT_TO_SAY');

  for (const override of [
    { name: ' ' },
    { name: 'a'.repeat(81) },
    { ageBand: '12' },
    { mode: 'ADMIN' },
    { locale: '//example.com' },
    { gender: 'INVALID_GENDER' },
  ]) {
    assert.equal(OnboardingSchema.safeParse({ ...valid, ...override }).success, false);
  }
});
