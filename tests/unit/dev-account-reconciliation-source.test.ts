// Source assertions only; not SQL execution or concurrency evidence.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
const sql = readFileSync(resolve('supabase/schema-sources/dev-account-reconciliation.sql'), 'utf8')
it('keeps one account writer with compatibility delegates and internal primitives inaccessible to browser roles', () => {
  expect(sql).toContain('rename to reconciliation_identity_write')
  expect(sql).toContain('rename to reconciliation_profile_write')
  expect(sql).toContain('revoke all on function public.reconciliation_identity_write(jsonb), public.reconciliation_profile_write(jsonb) from public, anon, authenticated')
  for (const name of ['save_account_profile', 'save_matchmaking_profile']) {
    const body = sql.split(`create or replace function public.${name}(`)[1].split('end $$;')[0]
    expect(body).toContain('perform public.save_account(account)')
    expect(body.indexOf('profile-username-namespace')).toBeLessThan(body.indexOf('public.get_account()'))
  }
})
it('requires authenticated sequential completion, real minima and original profile validation in a single transaction', () => {
  expect(sql).toContain("errcode='28000'")
  expect(sql).toContain("errcode='25001'")
  expect(sql).toContain('n<old_n or n>old_n+1')
  expect(sql).toContain("count(distinct btrim(value #>> '{}'))")
  expect(sql).toContain("< 3 then return '[0]'")
  for (const field of ['birthdate', 'location_city', 'availability', 'intents', 'distance', 'group']) expect(sql).toContain(field)
  expect(sql).toContain('perform public.reconciliation_profile_write(p)')
  expect(sql.trim().endsWith('commit;')).toBe(true)
})
it('preserves labels on optional provider failure without fake vectors, trigger bypass or data deletion', () => {
  expect(sql).toContain('new.embedding:=public.get_gemini_embedding(new.text)')
  expect(sql).toContain('exception when others then new.embedding:=null')
  expect(sql.replace(/--[^\n]*/g, '')).not.toMatch(/disable trigger|drop table|delete from|truncate|service_role|vector\s*\[/i)
  expect(sql).toContain('enable row level security')
  expect(sql).toContain('RPC-only settings writes require separate ACL review')
})
