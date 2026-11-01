// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventsRouter, distanceMiles } from '../../api/events.js'

const eventId = 'e0000000-0000-4000-8000-000000000001'
const listing = { id: eventId, title: 'Campus concert', description: null, category: 'Music', starts_at: '2099-10-02T15:00:00Z', ends_at: null, location_name: null, address: null, city: 'Stony Brook', image_url: null, source: 'sbengaged', source_url: null, status: 'active', latitude: 40, longitude: -73 }
const requests: { path: URL; body: Record<string, unknown> | null }[] = []
let listings: typeof listing[] = [listing]
let failingRpc: string | null = null
const databaseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const body = init?.body ? JSON.parse(String(init.body)) : null
  requests.push({ path, body })
  let data: unknown
  let status = 200
  if (path.pathname.endsWith('/public_live_events')) data = listings
  else if (path.pathname.endsWith('/event_categories')) data = ['Music', 'Food']
  else { status = 404; data = { code: 'PGRST202', message: 'Function does not exist' } }
  if (failingRpc && path.pathname.endsWith(`/${failingRpc}`)) { status = 500; data = { code: 'XX000', message: 'Database unavailable' } }
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
})
const client = createClient('http://database.test', 'service-key', { global: { fetch: databaseFetch }, auth: { persistSession: false, autoRefreshToken: false } })
const app = express()
app.use(express.json())
app.use('/api/events', createEventsRouter(client))
app.use('/unconfigured', createEventsRouter(null))
const server = app.listen(0, '127.0.0.1')
let url: string
beforeAll(async () => {
  if (!server.listening) await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
beforeEach(() => { requests.length = 0; listings = [listing]; failingRpc = null })

describe('live events API', () => {
  it('reads public live events without retired company functions, paginates, and computes distance', async () => {
    listings = [listing, { ...listing, id: 'e0000000-0000-4000-8000-000000000002' }]
    const response = await fetch(`${url}/api/events?category=Music&limit=1&latitude=40&longitude=-73`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ events: [{ id: eventId, distance_miles: 0 }], hasMore: true, categories: ['Music', 'Food'] })
    expect(body.events[0]).not.toHaveProperty('interested_count')
    expect(body.events[0]).not.toHaveProperty('latitude')
    expect(body.events[0]).not.toHaveProperty('longitude')
    expect(requests.find(request => request.path.pathname.endsWith('/public_live_events'))?.body).toEqual({ p_category: 'Music', p_offset: 0, p_limit: 2 })
    expect(requests).toHaveLength(2)
  })
  it('passes bounded page offsets and returns an honest empty list', async () => {
    listings = []
    const response = await fetch(`${url}/api/events?page=100&limit=50`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ events: [], hasMore: false, page: 100 })
    expect(requests.find(request => request.path.pathname.endsWith('/public_live_events'))?.body).toEqual({ p_category: null, p_offset: 4950, p_limit: 51 })
  })
  it('rejects malformed filters before querying the database', async () => {
    for (const query of ['page=0', 'page=101', 'limit=51', 'latitude=20', 'latitude=91&longitude=0']) {
      expect((await fetch(`${url}/api/events?${query}`)).status).toBe(400)
    }
    expect(requests).toHaveLength(0)
  })
  it('loads details without retired counts or private coordinates', async () => {
    const response = await fetch(`${url}/api/events/${eventId}`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ id: eventId, title: listing.title, distance_miles: null })
    expect(body).not.toHaveProperty('interested_count')
    expect(body).not.toHaveProperty('latitude')
    expect(requests).toHaveLength(1)
    expect(requests[0].body).toEqual({ p_id: eventId, p_limit: 1 })
  })
  it('returns 404 for unavailable details and 400 for invalid IDs', async () => {
    expect((await fetch(`${url}/api/events/invalid`)).status).toBe(400)
    listings = []
    expect((await fetch(`${url}/api/events/${eventId}`)).status).toBe(404)
  })
  it('returns 404 for retired company routes without database access', async () => {
    expect((await fetch(`${url}/api/events/${eventId}/company`)).status).toBe(404)
    expect((await fetch(`${url}/api/events/${eventId}/company`, { method: 'POST', headers: { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'join' }) })).status).toBe(404)
    expect(requests).toHaveLength(0)
  })
  it.each(['public_live_events', 'event_categories'])('reports failures in %s without fabricating event data', async rpc => {
    failingRpc = rpc
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await fetch(`${url}/api/events`)
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: 'Events are temporarily unavailable. Please try again.' })
    } finally { log.mockRestore() }
  })
  it('reports missing configuration clearly', async () => {
    expect((await fetch(`${url}/unconfigured`)).status).toBe(503)
  })
  it('computes a finite distance for antipodal coordinates', () => {
    expect(distanceMiles(0, 0, 0, 180)).toBeCloseTo(12437, -1)
  })
})
