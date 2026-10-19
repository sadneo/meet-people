import { expect, it } from 'vitest'
import { DatingProfileSchema, DatingSearchSchema, SaveDatingAggregateSchema, adultOn, datingCampusDate, emptyDatingProfile, datingTargets, reciprocalDatingTargets, validDatingTransition, datingEffectiveEnabled, type DatingProfile } from '../shared/dating'

const woman: DatingProfile = { ...emptyDatingProfile(), gender: 'Woman', sexuality: 'Straight', intent: 'Long-term relationship', style: 'Monogamy' }
const man = { ...woman, gender: 'Man' }
it('preserves exact Unicode/custom identities and zero height remainder, with visibility separate from consent', () => {
  const value = { ...woman, gender: '  Legacy\nidentity 🪨 ', sexuality: 'Custom label', heightInches: 5 * 12 + 0, visibility: { gender: true, sexuality: true, height: true } }
  expect(DatingProfileSchema.parse(value)).toEqual(value)
  expect(value.enabled).toBe(false)
  for (const heightInches of [null, 24, 60, 107]) expect(DatingProfileSchema.parse({ ...woman, heightInches }).heightInches).toBe(heightInches)
  for (const heightInches of [-1, 0, 23, 24.5, 108, 120, '60']) expect(DatingProfileSchema.safeParse({ ...woman, heightInches }).success).toBe(false)
  for (const extra of [{ bio: 'global' }, { birthdate: '2000-01-01' }, { interests: [] }, { user_id: 'other' }]) expect(DatingProfileSchema.safeParse({ ...woman, ...extra }).success).toBe(false)
  expect(DatingProfileSchema.safeParse({ ...woman, gender: '\ud800' }).success).toBe(false)
})
it('resolves only clear mappings, requires exact reciprocal admission and invalidates clarification on identity changes', () => {
  expect(datingTargets(woman)).toEqual(['Man']); expect(datingTargets(man)).toEqual(['Woman'])
  expect(reciprocalDatingTargets(woman, man)).toBe(true)
  expect(datingTargets({ ...woman, sexuality: 'Lesbian' })).toEqual(['Woman'])
  expect(datingTargets({ ...man, sexuality: 'Gay' })).toEqual(['Man'])
  for (const sexuality of ['Bisexual', 'Pansexual', 'Asexual', 'Queer', 'Questioning', 'Other', 'legacy']) expect(datingTargets({ ...woman, sexuality })).toBeNull()
  const custom = { ...woman, gender: 'Legacy identity', sexuality: 'Queer', clarifiedTargets: ['Man'] }
  expect(reciprocalDatingTargets(custom, man)).toBe(false) // no automatic Other/binary coercion
  expect(reciprocalDatingTargets(custom, { ...man, sexuality: 'Queer', clarifiedTargets: ['Legacy identity'] })).toBe(true)
  expect(validDatingTransition(custom, { ...custom, sexuality: 'Questioning' })).toBe(false)
  expect(validDatingTransition(custom, { ...custom, sexuality: 'Questioning', clarifiedTargets: [] })).toBe(true)
  expect(DatingProfileSchema.safeParse({ ...woman, clarifiedTargets: ['Woman'] }).success).toBe(false)
})
it('allows initial clarification but preserves invalidation for existing full and partial identities', () => {
  const next = { ...woman, sexuality: 'Queer', clarifiedTargets: ['Man'] }
  expect(validDatingTransition(null, next)).toBe(true)
  expect(validDatingTransition(emptyDatingProfile(), next)).toBe(true) // includes a persisted empty draft
  for (const previous of [{ ...emptyDatingProfile(), gender: 'Woman' }, { ...emptyDatingProfile(), sexuality: 'Queer' }, woman]) {
    expect(validDatingTransition(previous, next)).toBe(false)
    expect(validDatingTransition(previous, { ...next, clarifiedTargets: [] })).toBe(true)
  }
  expect(validDatingTransition(next, { ...next, intent: 'Something casual' })).toBe(true)
  expect(validDatingTransition(next, { ...next, gender: 'Legacy identity' })).toBe(false)
})
it('uses an explicit valid campus calendar date and authoritative nonfuture DOB for the exact adult boundary', () => {
  expect(adultOn('2008-10-19', '2026-10-19')).toBe(true)
  expect(adultOn('2008-10-20', '2026-10-19')).toBe(false)
  for (const dob of [null, '', '2008-02-30', '1900-02-29', '2027-01-01', '2000-01-01\n', '2000-01-01T00:00:00Z']) expect(adultOn(dob, '2026-10-19')).toBe(false)
  expect(adultOn('2008-02-29', '2026-02-28')).toBe(false)
  expect(adultOn('2008-02-29', '2026-03-01')).toBe(true)
  expect(adultOn('2000-01-01', '2026-02-30')).toBe(false)
})
it.each([
  ['2026-01-15T04:59:59Z', '2026-01-14', '2008-01-15', false],
  ['2026-01-15T05:00:00Z', '2026-01-15', '2008-01-15', true],
  ['2026-07-15T03:59:59Z', '2026-07-14', '2008-07-15', false],
  ['2026-07-15T04:00:00Z', '2026-07-15', '2008-07-15', true],
] as const)('uses America/New_York at fixed winter/summer instant %s', (instant, date, dob, adult) => {
  expect(datingCampusDate(new Date(instant))).toBe(date)
  expect(adultOn(dob, datingCampusDate(new Date(instant))!)).toBe(adult)
  expect(adultOn(dob, instant.slice(0, 10))).toBe(true) // UTC would admit early in the preceding-campus-day cases
})
it('keeps independent bounded search drafts unresolved rather than inventing geography; incomplete drafts cannot enable', () => {
  const search = { ageMin: 18, ageMax: 99, radiusMiles: 1, searchArea: { source: 'temporary', areaLabel: 'Campus', resolvedLocationRef: null } }
  expect(DatingSearchSchema.parse(search)).toEqual(search)
  expect(DatingSearchSchema.safeParse({ ...search, goals: [] }).success).toBe(false)
  expect(DatingSearchSchema.safeParse({ ...search, ageMin: 30, ageMax: 20 }).success).toBe(false)
  expect(SaveDatingAggregateSchema.safeParse({ expectedProfileRevision: 0, expectedSearchRevision: 0, profile: emptyDatingProfile(), search: null }).success).toBe(true)
  expect(SaveDatingAggregateSchema.safeParse({ expectedProfileRevision: 0, expectedSearchRevision: 0, profile: { ...woman, enabled: true }, search }).success).toBe(false)
  expect(datingEffectiveEnabled({ ...woman, enabled: true }, search, true)).toBe(false)
  expect(DatingProfileSchema.safeParse({ ...emptyDatingProfile(), enabled: true }).success).toBe(false)
})
