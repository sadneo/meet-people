// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventsRouter, distanceMiles } from '../api/events.js'

const eventId = 'e0000000-0000-4000-8000-000000000001'
const listing = { id: eventId, title: 'Campus concert', description: null, category: 'Music', starts_at: '2099-10-02T15:00:00Z', ends_at: null, location_name: null, address: null, city: 'Stony Brook', image_url: null, source: 'sbengaged', source_url: null, status: 'active', latitude: 40, longitude: -73 }
const requests: { path: URL; body: Record<string, unknown> | null }[] = []
let listings: typeof listing[] = [listing]
let listingsError = false
const databaseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const body = init?.body ? JSON.parse(String(init.body)) : null
  requests.push({ path, body })
  let data: unknown = null
  let status = 200
  if (path.pathname.endsWith('/public_live_events') && listingsError) { status = 500; data = { message: 'Database unavailable' } }
  else if (path.pathname.endsWith('/public_live_events')) {
    // maybeSingle() asks PostgREST for one object, which reports "0 rows" as a 406.
    if (!new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')) data = listings
    else if (listings.length === 1) data = listings[0]
    else { status = 406; data = { code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested, multiple (or no) rows returned' } }
  } else if (path.pathname.endsWith('/event_categories')) data = ['Music', 'Food']
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
})
const client = createClient('http://database.test', 'service-key', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
app.use(express.json())
app.use('/api/events', createEventsRouter(client, { cacheMs: 0 }))
let clock = 0
app.use('/cached', createEventsRouter(client, { now: () => clock }))
app.use('/unconfigured', createEventsRouter(null))
const server = app.listen(0, '127.0.0.1')
let url: string
beforeAll(async () => {
  if (!server.listening) await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
beforeEach(() => { requests.length = 0; listings = [listing]; listingsError = false })
const eventReads = () => requests.filter(request => request.path.pathname.endsWith('/public_live_events'))

describe('live events API', () => {
  it('reads one bounded page through the public function and computes distance', async () => {
    listings = [listing, { ...listing, id: 'e0000000-0000-4000-8000-000000000002' }]
    const response = await fetch(`${url}/api/events?category=Music&limit=1&page=3&latitude=40&longitude=-73`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ events: [{ id: eventId, distance_miles: 0 }], page: 3, hasMore: true, categories: ['Music', 'Food'] })
    expect(body.events[0]).not.toHaveProperty('latitude')
    // One extra row tells the API whether another page exists.
    expect(eventReads().map(request => request.body)).toEqual([{ p_category: 'Music', p_offset: 2, p_limit: 2, p_id: null }])
  })
  it('rejects malformed filters and pages beyond the cap before querying the database', async () => {
    for (const query of ['page=0', 'page=101', 'limit=51', 'latitude=20', 'latitude=91&longitude=0']) {
      expect((await fetch(`${url}/api/events?${query}`)).status).toBe(400)
    }
    expect(requests).toHaveLength(0)
  })
  it('returns a live event by ID, 404 when unavailable, and 400 for invalid IDs', async () => {
    const found = await fetch(`${url}/api/events/${eventId}`)
    expect(await found.json()).toMatchObject({ id: eventId, distance_miles: null })
    expect(eventReads().at(-1)?.body).toEqual({ p_category: null, p_offset: 0, p_limit: 1, p_id: eventId })
    expect((await fetch(`${url}/api/events/invalid`)).status).toBe(400)
    listings = []
    expect((await fetch(`${url}/api/events/${eventId}`)).status).toBe(404)
  })
  it('no longer serves the retired company routes', async () => {
    const headers = { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' }
    expect((await fetch(`${url}/api/events/${eventId}/company`, { headers })).status).toBe(404)
    expect((await fetch(`${url}/api/events/${eventId}/company`, { method: 'POST', headers, body: JSON.stringify({ action: 'join' }) })).status).toBe(404)
    expect(requests).toHaveLength(0)
  })
  it('reports missing configuration clearly', async () => {
    expect((await fetch(`${url}/unconfigured`)).status).toBe(503)
  })
  it('computes a finite distance for antipodal coordinates', () => {
    expect(distanceMiles(0, 0, 0, 180)).toBeCloseTo(12437, -1)
  })
})

describe('public events cache', () => {
  it('serves repeat list views from one lookup, computes distance per viewer, and expires after a minute', async () => {
    clock = 1_000_000
    const first = await fetch(`${url}/cached?category=Food`)
    expect(first.headers.get('cache-control')).toBe('public, max-age=60')
    expect((await first.json()).events[0].distance_miles).toBeNull()
    const nearby = await (await fetch(`${url}/cached?category=Food&latitude=40&longitude=-73`)).json()
    expect(nearby.events[0].distance_miles).toBe(0)
    expect(eventReads()).toHaveLength(1)
    await fetch(`${url}/cached?category=Food&page=2`)
    expect(eventReads()).toHaveLength(2)
    clock += 61_000
    await fetch(`${url}/cached?category=Food`)
    expect(eventReads()).toHaveLength(3)
  })
  it('caches event details but never marks a missing event as publicly cacheable', async () => {
    clock = 2_000_000
    const missing = 'e0000000-0000-4000-8000-0000000000ff'
    listings = []
    const notFound = await fetch(`${url}/cached/${missing}`)
    expect(notFound.status).toBe(404)
    expect(notFound.headers.get('cache-control') ?? '').not.toContain('public')
    listings = [listing]
    const first = await fetch(`${url}/cached/${eventId}`)
    expect(first.headers.get('cache-control')).toBe('public, max-age=60')
    expect(await first.json()).toMatchObject({ id: eventId })
    await fetch(`${url}/cached/${eventId}`)
    expect(eventReads()).toHaveLength(2)
  })
  it('does not keep a failed lookup, so the next view retries', async () => {
    clock = 3_000_000
    listingsError = true
    const failed = await fetch(`${url}/cached?category=Outdoors`)
    expect(failed.status).toBe(503)
    expect(failed.headers.get('cache-control') ?? '').not.toContain('public')
    listingsError = false
    expect((await fetch(`${url}/cached?category=Outdoors`)).status).toBe(200)
    expect(eventReads()).toHaveLength(2)
  })
})
