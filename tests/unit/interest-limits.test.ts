import { expect, it } from 'vitest';
import { interestAdditionProblem, interestSelectionProblem, interestCounts } from '../../shared/interests';
import { SaveAccountSchema, completedAccountChapters, AccountSchema } from '../../shared/account';
import { accountFixture, requiredPreferences } from './complete-profile-fixture';

const account = accountFixture({ username: 'interest-fixture', display_name: 'Fixture', bio: null, avatar_url: null, ...requiredPreferences });
it.each([
  ['Coffee', 'Art', 'Music'],
  ['Coffee', 'Art', 'Music', 'Outdoors', 'Gaming'],
  ['Coffee', 'Art', 'Music', 'Custom one', 'Custom two'],
])('accepts provided choices with up to two custom interests: %j', (...interests) => {
  expect(interestSelectionProblem(interests)).toBe('');
  expect(SaveAccountSchema.safeParse({ ...account, profile: { ...account.profile, interests } }).success).toBe(true);
});
it.each([
  ['Coffee', 'Art', 'Music', 'Food', 'Gaming', 'Movies'],
  ['Coffee', 'Art', 'Custom one', 'Custom two', 'Custom three'],
  ['Coffee', 'Custom one', 'Custom two'],
  ['Coffee', 'Coffee', 'Art'],
])('rejects excess interests and custom substitutions for the provided minimum: %j', (...interests) => {
  expect(interestSelectionProblem(interests)).not.toBe('');
  const value = { ...account, profile: { ...account.profile, interests } };
  expect(SaveAccountSchema.safeParse(value).success).toBe(false);
  expect(completedAccountChapters(value)).toEqual([0]);
});
it('permits partial onboarding drafts but never reads old saved labels as corrupt data', () => {
  expect(SaveAccountSchema.safeParse({ ...account, completed: [0], profile: { ...account.profile, interests: [] } }).success).toBe(true);
  const old = { ...account, profile: { ...account.profile, interests: ['Coffee', 'Art', 'Music', 'Food', 'Gaming', 'Movies'] } };
  expect(AccountSchema.safeParse(old).success).toBe(true);
  expect(SaveAccountSchema.safeParse(old).success).toBe(false);
});
it('bounds additions while leaving all five slots available for provided choices', () => {
  expect(interestAdditionProblem('Custom three', ['Coffee', 'Art', 'Custom one', 'Custom two'])).toContain('2 custom');
  expect(interestAdditionProblem('Music', ['Coffee', 'Art', 'Custom one', 'Custom two'])).toBe('');
  expect(interestAdditionProblem('Outdoors', ['Coffee', 'Art', 'Music', 'Custom one', 'Custom two'])).toContain('5 interests');
  expect(interestAdditionProblem('Coffee', ['Coffee', 'Art', 'Music'])).toContain('already selected');
  expect(interestCounts(['Coffee', 'Art', 'Music', 'Custom one', 'Custom two'])).toEqual({ provided: 3, custom: 2 });
});
