import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// These are SOURCE assertions only, never SQL/RLS/block-concurrency execution.
it('authors a private definer bilateral predicate and actor-bound compatibility helper', () => {
  const sql = readFileSync('docs/safety-contact-guards-migration.sql', 'utf8')
  for (const required of ['PARTIAL SAFETY CANDIDATE', 'public.safety_pair_allowed', 'security definer', "set search_path = ''", 'b.blocker_id = first_id and b.blocked_id = second_id', 'b.blocker_id = second_id and b.blocked_id = first_id', 'from public, anon, authenticated', 'actor is distinct from user1 and actor is distinct from user2']) expect(sql).toContain(required)
  expect(sql).toContain('rolbypassrls')
  expect(sql).toContain('relforcerowsecurity')
})
it('preserves membership authorization without pretending uncontrolled block races are closed', () => {
  const sql = readFileSync('docs/safety-contact-guards-migration.sql', 'utf8')
  for (const required of ["errcode='28000'", "errcode='25001'", 'actor is distinct from first_id and actor is distinct from second_id', 'public.safety_pair_allowed(first_id,second_id)', 'blocked-pair race remains incomplete']) expect(sql).toContain(required)
  expect(sql).not.toMatch(/\block\s+table\s+public\.blocks\b|pg_advisory/i)
  expect(sql).not.toMatch(/\b(?:get_gemini_embedding|http)\s*\(/i)
  expect(sql).not.toMatch(/\b(?:insert into|delete from)\s+public\.blocks/i)
  expect(sql).not.toMatch(/create (?:or replace )?function public\.(?:report|block_user|unblock)/i)
  expect(sql.trim().endsWith('commit;')).toBe(true)
})
it('rejects incompatible scalar signatures before replacement and matches the actual historical returns', () => {
  const sql = readFileSync('docs/safety-contact-guards-migration.sql', 'utf8')
  const historicalRead = readFileSync('supabase/migrations/20260925000008_messaging.sql', 'utf8')
  const historicalConnect = readFileSync('supabase/migrations/20260925000004_connection_logic.sql', 'utf8')
  expect(historicalRead).toMatch(/function mark_conversation_read\(conv_id bigint\)\s+returns int\b/)
  expect(sql).toMatch(/function public\.mark_conversation_read\(conv_id bigint\)\s+returns int\b/)
  expect(historicalConnect).toMatch(/function can_connect\(user1 uuid, user2 uuid\)\s+returns boolean\b/)
  for (const required of ['prorettype', 'proretset', 'proargmodes', 'proargnames', "'pg_catalog.int4'::regtype", "'pg_catalog.bool'::regtype", "errcode='42P13'"]) expect(sql).toContain(required)
  expect(sql.indexOf("errcode='42P13'")).toBeLessThan(sql.indexOf('create function public.safety_pair_allowed'))
  expect(sql).not.toMatch(/\bdrop\s+(?:function|table|schema)\b/i)
})
it('fails the entire blocklist closed without querying live metadata or inventing empty rows/names', () => {
  const sql = readFileSync('docs/safety-contact-guards-migration.sql', 'utf8')
  const getter = sql.split('create function public.get_owner_blocklist()')[1].split('end $$;')[0]
  expect(getter).toContain("errcode='28000'")
  expect(getter).toContain("errcode='PT503'")
  expect(getter).not.toMatch(/public\.(?:profiles|blocks)|display_name|jsonb_agg|return\s+/i)
})
it('provides guarded SQL acceptance source using real historical files, not positive-case stubs', () => {
  const sql = readFileSync('tests/safety-contact-guards.sql', 'utf8')
  for (const required of ['ACCEPTANCE SOURCE ONLY', 'pebble_safety_contact_disposable', 'public.safety_contact_disposable_marker', 'pebble.safety_contact_test_target', 'supabase/migrations/20260925000004_connection_logic.sql', 'supabase/migrations/20260925000008_messaging.sql', 'docs/safety-contact-guards-migration.sql', "sqlstate '42P13'", 'prorettype', 'safety_incompatible_mark_read_fixture', 'Hidden renamed target', 'read_at']) expect(sql).toContain(required)
  expect(sql.indexOf('current_database()')).toBeLessThan(sql.indexOf('create temporary table'))
  expect(sql).not.toMatch(/^\s*drop\b|\bdrop\s+function[^;]*cascade/im)
  expect(sql.trim().endsWith('rollback;')).toBe(true)
})
