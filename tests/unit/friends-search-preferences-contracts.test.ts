import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { FriendsPreferencesSchema, FriendsSearchPreferencesSchema, SaveFriendsSearchPreferencesSchema } from '../../shared/friends-search-preferences'

const preferences = { ageMin: 18, ageMax: 99, radiusMiles: 1, goals: [' Board games\nstrategy '], searchArea: { source: 'home', resolvedLocationRef: null } }
it('requires explicit bounded integer choices, preserving custom goals and separating modes/profile facts', () => {
  expect(FriendsPreferencesSchema.parse(preferences)).toEqual(preferences)
  expect(FriendsPreferencesSchema.parse({ ...preferences, ageMax: 18, radiusMiles: 100 })).toMatchObject({ ageMin: 18, ageMax: 18, radiusMiles: 100 })
  for (const patch of [{ ageMin: 17 }, { ageMax: 100 }, { ageMin: 20, ageMax: 19 }, { ageMin: 18.5 }, { radiusMiles: 0 }, { radiusMiles: 101 }, { radiusMiles: NaN }, { goals: [''] }, { goals: ['\uFEFF'] }, { goals: ['x'.repeat(121)] }, { goals: Array.from({ length: 21 }, (_, i) => `${i}`) }, { goals: ['Same', 'Same'] }, { goals: ['\uD800'] }, { goals: ['\u0000'] }, { mode: 'dating' }, { interests: [] }, { availability: [] }, { birthdate: '2000-01-01' }]) expect(FriendsPreferencesSchema.safeParse({ ...preferences, ...patch }).success).toBe(false)
  expect(FriendsPreferencesSchema.safeParse({ ...preferences, goals: ['😀'.repeat(120)] }).success).toBe(true)
  expect(FriendsPreferencesSchema.parse({ ...preferences, goals: ['Goal', ' goal '] }).goals).toEqual(['Goal', ' goal '])
})
it('guards reusable disposable acceptance source without treating it as SQL execution', () => {
  const sql = readFileSync('tests/integration/sql/friends-search-preferences.sql', 'utf8')
  for (const required of ['ACCEPTANCE SOURCE ONLY', 'pebble_friends_preferences_disposable', 'public.friends_preferences_disposable_marker', 'pebble.friends_preferences_test_target', 'set local plpgsql.check_asserts = on', 'has_any_column_privilege', "sqlstate 'FP409'", "sqlstate '25001'", 'begin isolation level repeatable read', 'begin isolation level serializable']) expect(sql).toContain(required)
  expect(sql.indexOf('current_database()')).toBeLessThan(sql.indexOf('insert into auth.users'))
  expect(sql).not.toMatch(/^\s*(?:commit\s*;|\\(?:i|ir|connect)\b)/im)
  expect(sql.trim().endsWith('rollback;')).toBe(true)
})
it('accepts unresolved selections without inventing geography, but never accepts caller coordinates or IDs', () => {
  expect(FriendsPreferencesSchema.parse({ ...preferences, searchArea: { source: 'temporary', areaLabel: ' Exact custom campus ', resolvedLocationRef: null } }).searchArea).toEqual({ source: 'temporary', areaLabel: ' Exact custom campus ', resolvedLocationRef: null })
  for (const searchArea of [{ source: 'home', latitude: 40, resolvedLocationRef: null }, { source: 'home', areaLabel: 'Overwrite home', resolvedLocationRef: null }, { source: 'temporary', areaLabel: ' ', resolvedLocationRef: null }, { source: 'temporary', areaLabel: 'Area', resolvedLocationRef: 'not-a-uuid' }]) expect(FriendsPreferencesSchema.safeParse({ ...preferences, searchArea }).success).toBe(false)
  const write = { expectedRevision: 0, preferences }
  for (const key of ['id', 'user_id', 'actorId', 'revision']) expect(SaveFriendsSearchPreferencesSchema.safeParse({ ...write, [key]: 'other' }).success).toBe(false)
  expect(FriendsSearchPreferencesSchema.parse({ revision: 0, preferences: null })).toEqual({ revision: 0, preferences: null })
  expect(FriendsSearchPreferencesSchema.safeParse({ revision: 0, preferences }).success).toBe(false)
  expect(FriendsSearchPreferencesSchema.safeParse({ revision: 1, preferences: null }).success).toBe(false)
  expect(SaveFriendsSearchPreferencesSchema.safeParse({ ...write, expectedRevision: Number.MAX_SAFE_INTEGER }).success).toBe(false)
})
it('authors private CAS/location-reference SQL only, not SQL execution evidence', () => {
  const sql = readFileSync('supabase/schema-sources/friends-search-preferences-migration.sql', 'utf8')
  for (const text of ['REVIEW CANDIDATE ONLY', "errcode='FP409'", "errcode='28000'", "errcode='25001'", "set search_path = ''", 'enable row level security', 'from public, anon, authenticated', 'revision = expected_revision', 'for share', 'return public.get_friends_search_preferences()']) expect(sql).toContain(text)
  expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)\b/i)
  expect(sql).not.toMatch(/(?:create or replace|alter function).*\b(?:join_queue|get_queue_match|save_account)\b/i)
  expect(sql).not.toMatch(/\b(?:get_gemini_embedding|http|save_matchmaking_profile|save_account)\s*\(/i)
  expect(sql.trim().endsWith('commit;')).toBe(true)
  // Paired format corpus, not PostgreSQL regex execution evidence.
  const pattern = new RegExp(sql.match(/!~ '([^']+)'/)![1])
  for (const [value, valid] of [
    ['00000000-0000-0000-0000-000000000000', true], ['ffffffff-ffff-ffff-ffff-ffffffffffff', true],
    ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', false], ['B0000000-0000-4000-8000-000000000001', true],
    ['b0000000-0000-9000-8000-000000000001', false], ['b0000000-0000-4000-7000-000000000001', false],
    ['b0000000000040008000000000000001', false], ['b0000000-0000-4000-8000-000000000001\n', false],
  ] as const) {
    expect(value.length === 36 && pattern.test(value)).toBe(valid)
    expect(FriendsPreferencesSchema.safeParse({ ...preferences, searchArea: { source: 'home', resolvedLocationRef: value } }).success).toBe(valid)
  }
})
