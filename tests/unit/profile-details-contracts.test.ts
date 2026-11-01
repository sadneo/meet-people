import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { ProfileDetailsSchema, PublicProfileDetailsSchema, SaveProfileDetailsSchema, ProfileDetailsErrorSchema, profileLanguageKey, profileLanguageFoldRanges, profileLanguageFoldExceptions, profileLanguageWhitespace } from '../../shared/profile-details'
import { SaveAccountSchema } from '../../shared/account'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'

const facts = { education: 'School', occupation: '', languages: ['English', 'Español'], visibility: { education: true, occupation: false, languages: false } }
it('strictly separates owner snapshots, writes and public facts from legacy accounts', () => {
  expect(ProfileDetailsSchema.parse({ revision: 0, facts })).toEqual({ revision: 0, facts })
  expect(SaveProfileDetailsSchema.parse({ expectedRevision: 0, facts })).toEqual({ expectedRevision: 0, facts })
  for (const key of ['id', 'user_id', 'actorId', 'revision']) expect(SaveProfileDetailsSchema.safeParse({ expectedRevision: 0, facts, [key]: 'other' }).success).toBe(false)
  expect(PublicProfileDetailsSchema.parse({ education: 'School' })).toEqual({ education: 'School' })
  for (const key of ['revision', 'visibility', 'birthdate', 'facts', 'user_id']) expect(PublicProfileDetailsSchema.safeParse({ [key]: facts }).success).toBe(false)
  const account = accountFixture({ username: 'synthetic', display_name: 'Synthetic', bio: null, avatar_url: null, ...requiredPreferences })
  expect(SaveAccountSchema.safeParse(account).success).toBe(true)
  expect(SaveAccountSchema.safeParse({ ...account, profileDetails: facts }).success).toBe(false)
})
it('validates complete atomic values/visibility, length bounds, unique languages and safe revisions', () => {
  const write = (patch: object) => SaveProfileDetailsSchema.safeParse({ expectedRevision: 0, facts: { ...facts, ...patch } }).success
  expect(write({ education: 'x'.repeat(120), occupation: 'x'.repeat(120), languages: Array.from({ length: 12 }, (_, i) => `${i}${'x'.repeat(58)}`) })).toBe(true)
  for (const patch of [
    { education: 'x'.repeat(121) }, { occupation: 'x'.repeat(121) }, { education: null },
    { languages: Array(13).fill('English') }, { languages: ['x'.repeat(61)] }, { languages: [' '] },
    { languages: ['English', 'english'] }, { languages: ['English', ' English '] },
    { visibility: { education: true } }, { visibility: { ...facts.visibility, languages: 'yes' } },
    { visibility: { ...facts.visibility, other: true } }, { extra: true },
  ]) expect(write(patch)).toBe(false)
  for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, '0', null]) expect(SaveProfileDetailsSchema.safeParse({ expectedRevision, facts }).success).toBe(false)
  expect(ProfileDetailsSchema.safeParse({ revision: Number.MAX_SAFE_INTEGER, facts }).success).toBe(true)
  expect(write({ education: '😀'.repeat(120) })).toBe(true)
  expect(write({ education: '😀'.repeat(121) })).toBe(false)
  expect(write({ languages: [' Français ', '日本語'] })).toBe(true)
  expect(ProfileDetailsErrorSchema.parse({ code: 'conflict', error: 'Reload your details.' }).code).toBe('conflict')
})
it('keeps SQL a source-only candidate with actor-bound CAS, private storage and explicit ACLs', () => {
  // Static assertions are NOT SQL execution, RLS, installation or concurrency evidence.
  const sql = readFileSync('supabase/schema-sources/profile-details-migration.sql', 'utf8')
  expect(sql).toContain('REVIEW CANDIDATE ONLY')
  expect(sql).toContain('auth.uid()')
  expect(sql).toContain("errcode='28000'")
  expect(sql).toContain("errcode='PD409'")
  expect(sql).toContain("current_setting('transaction_isolation') <> 'read committed'")
  expect(sql).toContain("errcode='25001'")
  expect(sql).toContain("current_setting('server_encoding') <> 'UTF8'")
  expect(sql).toContain('(label collate "C") = any(seen)')
  expect(sql).not.toMatch(/\blower\(|regexp_replace\(/)
  expect(sql).toContain("set search_path = ''")
  expect(sql).toContain('enable row level security')
  expect(sql).toContain('from public, anon, authenticated')
  expect(sql).toContain('revision = expected_revision')
  expect(sql).toContain('return public.get_profile_details()')
  expect(sql).not.toMatch(/\b(?:save_account|save_matchmaking_profile|http|embedding|service_role)\s*\(/i)
  expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete)\b/i)
  expect(sql.trim().endsWith('commit;')).toBe(true)
  for (const path of ['supabase/schema-sources/dev-account-reconciliation.sql', 'supabase/migrations/20261013120000_accounts.sql', 'supabase/migrations/20261018160000_account_profile_identity.sql']) {
    expect(readFileSync(path, 'utf8')).not.toContain('public.profile_details')
  }
})

// This exact corpus also appears as candidate SQL assertions. SQL is NOT executed here.
export const profileLanguageKeyCorpus = [
  ['\uFEFF English\u00A0', 'english'], ['\u00A0\uFEFF', ''], ['I', 'i'], ['i', 'i'],
  ['İ', 'i\u0307'], ['ı', 'ı'], ['ΟΣ', 'οσ'], ['ος', 'οσ'], ['οσ', 'οσ'],
  ['FRANÇAIS', 'français'], ['РУССКИЙ', 'русский'], ['日本語', '日本語'],
  ['𐐀𐐨😀', '𐐨𐐨😀'], ['Straße', 'strasse'], ['STRASSE', 'strasse'],
  ['é', 'é'], ['e\u0301', 'e\u0301'], ['\u0085English\u0085', '\u0085english\u0085'],
  ['\u200BEnglish\u200B', '\u200Benglish\u200B'], ['Ꭰꭰ', 'Ꭰꭰ'],
]
it('uses the pinned comparison policy, preserves labels and pairs the SQL corpus/data exactly', () => {
  const sql = readFileSync('supabase/schema-sources/profile-details-migration.sql', 'utf8')
  const sqlCorpus = JSON.parse(sql.match(/key_corpus constant jsonb := '([^']+)'/)![1])
  expect(sqlCorpus).toEqual(profileLanguageKeyCorpus)
  expect(JSON.parse(sql.match(/fold_ranges constant jsonb := '([^']+)'/)![1])).toEqual(profileLanguageFoldRanges)
  expect(JSON.parse(sql.match(/fold_exceptions constant jsonb := '([^']+)'/)![1])).toEqual(profileLanguageFoldExceptions)
  expect(JSON.parse(sql.match(/whitespace_points constant jsonb := '([^']+)'/)![1])).toEqual(profileLanguageWhitespace)
  for (const [input, key] of profileLanguageKeyCorpus) expect(profileLanguageKey(input)).toBe(key)
  const labels = ['\uFEFF Français\u00A0', '日本語', '𐐀😀']
  expect(SaveProfileDetailsSchema.parse({ expectedRevision: 0, facts: { ...facts, languages: labels } }).facts.languages).toEqual(labels)
  for (const pair of [['English', '\uFEFFENGLISH\u00A0'], ['ΟΣ', 'ος'], ['I', 'i'], ['Straße', 'STRASSE']]) {
    expect(SaveProfileDetailsSchema.safeParse({ expectedRevision: 0, facts: { ...facts, languages: pair } }).success).toBe(false)
  }
  expect(SaveProfileDetailsSchema.safeParse({ expectedRevision: 0, facts: { ...facts, languages: ['I', 'İ', 'ı'] } }).success).toBe(true)
})
it('rejects NUL and unpaired UTF-16 in every owner/public fact string', () => {
  for (const value of ['\u0000', 'a\u0000b', '\uD800', '\uDC00', '\uD800x', 'x\uDC00']) {
    for (const field of ['education', 'occupation', 'languages']) {
      const patch = { [field]: field === 'languages' ? [value] : value }
      expect(SaveProfileDetailsSchema.safeParse({ expectedRevision: 0, facts: { ...facts, ...patch } }).success).toBe(false)
      expect(ProfileDetailsSchema.safeParse({ revision: 0, facts: { ...facts, ...patch } }).success).toBe(false)
      expect(PublicProfileDetailsSchema.safeParse(patch).success).toBe(false)
    }
  }
})
