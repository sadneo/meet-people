import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { DetailedSettingsValuesSchema, DetailedSettingsSchema, SaveDetailedSettingsSchema, emptyDetailedSettings, effectiveDetailedSettings, mastersFromLegacySettings } from '../../shared/detailed-settings'
import { SaveAccountSchema } from '../../shared/account'
import { accountFixture, requiredPreferences } from './complete-profile-fixture'

const on = { messages: true, plans: true, matches: true, friendsDiscovery: true, datingDiscovery: true }
it('defaults new detailed choices off, never inferring consent from legacy or preview defaults', () => {
  expect(emptyDetailedSettings()).toEqual({ messages: false, plans: false, matches: false, friendsDiscovery: false, datingDiscovery: false })
  expect(DetailedSettingsSchema.parse({ revision: 0, settings: emptyDetailedSettings(), masters: { notifications: true, discoverable: true }, effective: emptyDetailedSettings() }).settings.datingDiscovery).toBe(false)
  expect(DetailedSettingsSchema.safeParse({ revision: 0, settings: on, masters: null, effective: emptyDetailedSettings() }).success).toBe(false)
})
it('applies persisted global masters to every category/mode and fails closed for unknown masters', () => {
  for (const notifications of [false, true]) for (const discoverable of [false, true]) {
    expect(effectiveDetailedSettings(on, { notifications, discoverable })).toEqual({ messages: notifications, plans: notifications, matches: notifications, friendsDiscovery: discoverable, datingDiscovery: discoverable })
  }
  expect(effectiveDetailedSettings(on, null)).toEqual(emptyDetailedSettings())
  expect(mastersFromLegacySettings({ notifications: true, availability: false, discoverable: false, location: true })).toEqual({ notifications: true, discoverable: false })
  for (const value of [null, {}, { notifications: true, discoverable: true }, { notifications: 'true', availability: true, discoverable: true, location: false }]) expect(mastersFromLegacySettings(value)).toBeNull()
  expect(DetailedSettingsSchema.safeParse({ revision: 1, settings: on, masters: null, effective: on }).success).toBe(false)
})
it('keeps strict complete atomic payloads separate from legacy settings and actor identity', () => {
  const write = { expectedRevision: 0, settings: on }
  expect(SaveDetailedSettingsSchema.parse(write)).toEqual(write)
  for (const patch of [{ id: 'other' }, { user_id: 'other' }, { masters: { notifications: true, discoverable: true } }, { effective: on }, { revision: 1 }, { downtime: true }]) expect(SaveDetailedSettingsSchema.safeParse({ ...write, ...patch }).success).toBe(false)
  for (const value of [null, {}, { ...on, plans: null }, { ...on, messages: 1 }, { ...on, availability: true }]) expect(DetailedSettingsValuesSchema.safeParse(value).success).toBe(false)
  for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER, '0']) expect(SaveDetailedSettingsSchema.safeParse({ ...write, expectedRevision }).success).toBe(false)
  const account = accountFixture({ username: 'synthetic', display_name: 'Synthetic', bio: null, avatar_url: null, ...requiredPreferences })
  expect(SaveAccountSchema.safeParse(account).success).toBe(true)
  expect(SaveAccountSchema.safeParse({ ...account, settings: { ...account.settings, ...on } }).success).toBe(false)
})
it('authors private Settings CAS and guarded acceptance source, not executed SQL evidence', () => {
  const sql = readFileSync('docs/detailed-settings-migration.sql', 'utf8')
  for (const required of ['REVIEW CANDIDATE ONLY', "errcode='DS409'", "errcode='28000'", "errcode='25001'", "set search_path = ''", 'public.account_settings', 'enable row level security', 'from public, anon, authenticated', 'revision = expected_revision']) expect(sql).toContain(required)
  expect(sql).not.toMatch(/\b(?:update|insert into|delete from)\s+public\.(?:account_settings|profiles|queue_entries)\b/i)
  expect(sql).not.toMatch(/(?:create or replace|alter function).*\b(?:save_account|get_account|join_queue|leave_queue)\b/i)
  expect(sql.trim().endsWith('commit;')).toBe(true)
  const acceptance = readFileSync('tests/integration/sql/detailed-settings.sql', 'utf8')
  for (const guard of ['ACCEPTANCE SOURCE ONLY', 'pebble_detailed_settings_disposable', 'public.detailed_settings_disposable_marker', 'pebble.detailed_settings_test_target', 'has_any_column_privilege']) expect(acceptance).toContain(guard)
  expect(acceptance.indexOf('current_database()')).toBeLessThan(acceptance.indexOf('insert into auth.users'))
  expect(acceptance.trim().endsWith('rollback;')).toBe(true)
})
