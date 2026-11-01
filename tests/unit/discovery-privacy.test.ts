// @vitest-environment node
import { expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { readFileSync } from 'node:fs'
import { createMatchmakingRouter, type UserContextTransport } from '../../api/matchmaking'
it('returns actionable queue consent/readiness denial rather than claiming enrollment', async () => {
  let reads = 0
  const transport = { verify: async () => ({ id: 'fa000000-0000-4000-8000-000000000001' }), actor: () => ({ join: async () => ({ data: null, error: { code: 'PF409' } }), status: async () => { reads++; throw new Error('No status success after denied join') } }) } as unknown as UserContextTransport
  const result = await new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    let status = 200
    const req = { method: 'POST', url: '/queue', query: {}, body: { mode: 'active' }, headers: { authorization: 'Bearer synthetic' } } as unknown as Request
    const res = { locals: {}, set() { return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data }); return this } } as unknown as Response
    createMatchmakingRouter(transport)(req, res, error => reject(error ?? new Error('Route miss')))
  })
  expect(result).toEqual({ status: 409, data: { code: 'unavailable', error: 'Complete your profile and enable discovery in Settings before joining.' } })
  expect(reads).toBe(0)
})
it('pins privacy source boundaries without treating source assertions as SQL execution', () => {
  const sql = readFileSync('supabase/schema-sources/discovery-privacy-migration.sql', 'utf8')
  expect(sql).toContain('Inherited raw privacy bypass')
  expect(sql).toContain('Inherited privacy sequence bypass')
  expect(sql).toContain("has_sequence_privilege(r::name,seq,'SELECT,USAGE,UPDATE')")
  expect(sql).toContain('before insert or update on public.queue_entries')
  expect(sql).toContain('before insert or update on public.event_interest')
  expect(sql).toContain("'public.get_queue_match()'")
  expect(sql).toContain('set search_path=pg_catalog,public,pg_temp')
  expect(sql).not.toContain("set search_path='pg_catalog,public'")
  expect(sql).not.toMatch(/delete from public\.(profiles|messages|conversations|connections)/i)
})
