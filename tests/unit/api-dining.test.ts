// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createDiningRouter } from '../../api/dining'
import { campusDate, DiningMenuSchema } from '../../shared/dining'
import locationsFixture from '../fixtures/dining/nutrislice-locations.json'
import weekFixture from '../fixtures/dining/nutrislice-week.json'
import { normalizeNutrisliceWeek, parseNutrisliceLocations } from '../../supabase/functions/_shared/nutrislice-menus'

let server: Server | undefined
afterEach(async () => { if (server) await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined })

const menu = {
  id: 'a0000000-0000-4000-8000-000000000001', source: 'nutrislice_sbu',
  location_slug: 'east-side-dining', location_name: 'East Side Dining', menu_slug: 'lunch', menu_name: 'Lunch',
  menu_date: '2026-11-06', source_url: 'https://stonybrook.nutrislice.com/menu/', items: [], notices: [], last_synced_at: '2026-11-06T12:00:00Z',
}

async function setup(options: { data?: unknown; error?: unknown; verified?: boolean; configured?: boolean; throws?: boolean; verifyThrows?: boolean } = {}) {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
    limit: vi.fn(async () => { if (options.throws) throw new Error('private database detail'); return { data: options.data ?? [menu], error: options.error ?? null } }),
  }
  const from = vi.fn(() => query)
  const verify = vi.fn(async () => { if (options.verifyThrows) throw new Error('private authentication detail'); return options.verified === false ? null : { id: 'owner' } })
  const app = express()
  app.use('/api/dining', createDiningRouter(options.configured === false ? null : { from } as never, { verify }))
  server = await new Promise<Server>(resolve => { const current = app.listen(0, '127.0.0.1', () => resolve(current)) })
  const call = (parameters = '?date=2026-11-06', token = 'session') => fetch(`http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/dining${parameters}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { call, from, query, verify }
}

it('reads only the requested date after verifying the session, without exposing storage metadata', async () => {
  const { call, query, verify, from } = await setup({ data: [{ ...menu, external_id: 'private metadata', created_at: 'ignored' }] })
  const response = await call()
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ date: '2026-11-06', menus: [menu] })
  expect(verify).toHaveBeenCalledWith('session')
  expect(from).toHaveBeenCalledWith('dining_menus')
  expect(query.eq).toHaveBeenCalledExactlyOnceWith('menu_date', '2026-11-06')
})
it('rejects missing and invalid sessions before reading menus', async () => {
  const { call, from, verify } = await setup({ verified: false })
  expect((await call(undefined, '')).status).toBe(401)
  expect(verify).not.toHaveBeenCalled()
  expect((await call()).status).toBe(401)
  expect(from).not.toHaveBeenCalled()
})
it('validates actual calendar dates and rejects additional database selectors', async () => {
  const { call, from } = await setup()
  for (const query of ['', '?date=2026-02-30', '?date=0000-01-01', '?date=not-a-date', '?date=2026-11-06&owner=other', '?date=2026-11-06&date=2026-11-07']) expect((await call(query)).status).toBe(400)
  expect(from).not.toHaveBeenCalled()
})
it('returns unpublished days as empty data', async () => {
  const { call } = await setup({ data: [] })
  expect(await (await call()).json()).toEqual({ date: '2026-11-06', menus: [] })
})
it.each([
  { error: { message: 'secret table error' } }, { configured: false }, { throws: true }, { verifyThrows: true },
  { data: [{ ...menu, items: [{ name: 'incomplete record' }] }] }, { data: Array.from({ length: 501 }, () => menu) },
])('keeps unavailable, invalid or truncated results distinct from empty menus: %j', async options => {
  const { call } = await setup(options)
  const response = await call()
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Food menus are unavailable. Try again in a moment.' })
})
it('uses the campus day across device timezones and daylight saving changes', () => {
  expect(campusDate(new Date('2026-11-07T01:00:00Z'))).toBe('2026-11-06')
  expect(campusDate(new Date('2026-03-08T04:30:00Z'))).toBe('2026-03-07')
  expect(campusDate(new Date('2026-03-09T04:30:00Z'))).toBe('2026-03-09')
})

it('serves captured scraper output without dropping published nutrition or labels', async () => {
  const location = parseNutrisliceLocations(locationsFixture)[0]
  const imported = normalizeNutrisliceWeek(weekFixture, location, location.menus[0], new Date('2026-11-03T15:00:00Z'))[2]
  const stored = { ...imported, id: menu.id, last_synced_at: '2026-11-03T15:00:00+00:00' }
  const { call } = await setup({ data: [stored] })
  const response = await call('?date=2026-11-03')
  expect(response.status).toBe(200)
  expect((await response.json()).menus).toEqual([DiningMenuSchema.parse(stored)])
})
