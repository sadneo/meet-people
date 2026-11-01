import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const candidate = readFileSync('supabase/candidates/account-profile-matching-migration.sql', 'utf8')
const legacy = readFileSync('supabase/migrations/20261008220000_matchmaking_profile_rpcs.sql', 'utf8')
function body(source: string, name: string) {
  const start = source.indexOf(`function public.${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = source.slice(start)
  const opening = rest.indexOf('as $$')
  expect(opening).toBeGreaterThanOrEqual(0)
  return rest.slice(opening + 5, rest.indexOf('$$;', opening + 5))
}

it('candidate legacy replacement preserves validation, trimming, persistence and provider-trigger path byte-for-byte outside reviewed additions', () => {
  const replacement = body(candidate, 'save_matchmaking_profile')
    .replace('  canonical_username text;\n', '')
    .replace("  if current_setting('transaction_isolation') <> 'read committed' then\n    raise exception 'Profile writes require READ COMMITTED isolation' using errcode='25001'; end if;\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile-username-namespace',0));\n", '')
    .replace("  -- Check the effective username, not a stale username supplied by an old client.\n  select username into canonical_username from public.account_profiles where id=actor;\n  if found then username_in := canonical_username; end if;\n  if exists(select 1 from public.account_profiles where username=username_in and id<>actor) then\n    raise exception 'Username already exists' using errcode='23505'; end if;\n", '')
  expect(replacement).toBe(body(legacy, 'save_matchmaking_profile'))
})

it('both RPCs take the identical namespace lock before actor locks and before writes, and reject unsupported isolation first', () => {
  for (const name of ['save_account_profile', 'save_matchmaking_profile']) {
    const text = body(candidate, name)
    const namespace = text.indexOf("pg_catalog.hashtextextended('profile-username-namespace',0)")
    const isolation = text.indexOf("current_setting('transaction_isolation') <> 'read committed'")
    const actorLock = text.indexOf(name === 'save_account_profile' ? "'account-profile:'" : "'matchmaking-profile:'")
    expect(isolation).toBeGreaterThanOrEqual(0)
    expect(namespace).toBeGreaterThan(isolation)
    expect(actorLock).toBeGreaterThan(namespace)
    expect(text.indexOf('insert into public.')).toBeGreaterThan(actorLock)
  }
})

it('ownership checks are symmetric, use unchanged equality, and project the legacy effective username before checking', () => {
  expect(body(candidate, 'save_account_profile')).toContain("from public.profiles where username=btrim(profile_in->>'username') and id<>actor")
  const text = body(candidate, 'save_matchmaking_profile')
  expect(text.indexOf('username_in := canonical_username')).toBeLessThan(text.indexOf('where username=username_in and id<>actor'))
  expect(text).toContain('from public.account_profiles where username=username_in and id<>actor')
  expect(candidate).not.toMatch(/\b(?:citext|lower\(|drop index|drop constraint)\b/i)
})

it('candidate preserves legacy ACLs and fails installation rather than silently retaining or revoking browser direct-write bypasses', () => {
  expect(candidate).toContain('create or replace function public.save_matchmaking_profile')
  expect(candidate).toContain("has_table_privilege(browser_role::name,'public.profiles','INSERT,UPDATE,DELETE')")
  expect(candidate).toContain("has_any_column_privilege(browser_role::name,'public.profiles','INSERT')")
  expect(candidate).toContain("has_any_column_privilege(browser_role::name,'public.profiles','UPDATE')")
  expect(candidate).not.toMatch(/(?:grant|revoke) [^;]* on public\.profiles /i)
  expect(candidate).not.toContain('create table public.username')
})
