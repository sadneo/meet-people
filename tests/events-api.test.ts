// @vitest-environment node
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventsRouter, distanceMiles } from '../api/events.js'

const eventId = 'e0000000-0000-4000-8000-000000000001'
const userId = 'a0000000-0000-4000-8000-000000000001'
const listing = { id: eventId, title: 'Campus concert', description: null, category: 'Music', starts_at: '2099-10-02T15:00:00Z', ends_at: null, location_name: null, address: null, city: 'Stony Brook', image_url: null, source: 'sbengaged', source_url: null, status: 'active', latitude: 40, longitude: -73 }
const snapshot = { interested: [{ id: userId, name: 'Sam' }], interestedCount: 1, isInterested: true, group: null }
const requests: { path: URL; body: Record<string, unknown> | null }[] = []
let listings: typeof listing[] = [listing]
let actionError = false
const databaseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const body = init?.body ? JSON.parse(String(init.body)) : null
  requests.push({ path, body })
  let data: unknown = null
  let status = 200
  if (path.pathname === '/auth/v1/user') {
    const headers = new Headers(init?.headers)
    if (headers.get('authorization') === 'Bearer valid-session') data = { id: userId, user_metadata: { display_name: 'Sam' } }
    else { status = 401; data = { message: 'Invalid token' } }
  } else if (path.pathname.endsWith('/listings')) data = listings
  else if (path.pathname.endsWith('/event_categories')) data = ['Music', 'Food']
  else if (path.pathname.endsWith('/event_interest_counts')) data = { [eventId]: 1 }
  else if (path.pathname.endsWith('/event_company_snapshot')) data = snapshot
  else if (path.pathname.endsWith('/event_company_action') && actionError) { status = 400; data = { code: 'P0002', message: 'Event unavailable' } }
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
beforeEach(() => { requests.length = 0; listings = [listing]; actionError = false })

describe('live events API', () => {
  it('filters live events, paginates, computes distance, and exposes counts without identities', async () => {
    listings = [listing, { ...listing, id: 'e0000000-0000-4000-8000-000000000002' }]
    const response = await fetch(`${url}/api/events?category=Music&limit=1&latitude=40&longitude=-73`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ events: [{ id: eventId, distance_miles: 0, interested_count: 1 }], hasMore: true, categories: ['Music', 'Food'] })
    const query = requests.find(request => request.path.pathname.endsWith('/listings'))!.path.searchParams
    expect(query.get('listing_type')).toBe('eq.event')
    expect(query.get('status')).toBe('in.(active,rescheduled)')
    expect(query.get('category')).toBe('eq.Music')
    expect(query.get('or')).toContain('starts_at.gte.')
    expect(query.get('order')).toBe('starts_at.asc,id.asc')
    expect(query.get('limit')).toBe('2')
  })
  it('rejects malformed filters before querying the database', async () => {
    for (const query of ['page=0', 'limit=51', 'latitude=20', 'latitude=91&longitude=0']) {
      expect((await fetch(`${url}/api/events?${query}`)).status).toBe(400)
    }
    expect(requests).toHaveLength(0)
  })
  it('returns 404 for unavailable details and 400 for invalid IDs', async () => {
    expect((await fetch(`${url}/api/events/invalid`)).status).toBe(400)
    listings = []
    expect((await fetch(`${url}/api/events/${eventId}`)).status).toBe(404)
  })
  it('requires a verified session for company', async () => {
    expect((await fetch(`${url}/api/events/${eventId}/company`)).status).toBe(401)
    expect((await fetch(`${url}/api/events/${eventId}/company`, { headers: { Authorization: 'Bearer forged-token' } })).status).toBe(401)
    expect(requests.some(request => request.path.pathname.endsWith('/event_company_snapshot'))).toBe(false)
  })
  it('uses verified identity for actions and rejects supplied user IDs', async () => {
    const headers = { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' }
    const response = await fetch(`${url}/api/events/${eventId}/company`, { method: 'POST', headers, body: JSON.stringify({ action: 'join', name: 'Sam' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(snapshot)
    expect(requests.find(request => request.path.pathname.endsWith('/event_company_action'))?.body).toEqual({ p_event_id: eventId, p_user_id: userId, p_name: 'Sam', p_action: 'join' })
    expect((await fetch(`${url}/api/events/${eventId}/company`, { method: 'POST', headers, body: JSON.stringify({ action: 'join', user_id: 'someone-else' }) })).status).toBe(400)
  })
  it('does not allow joining an unavailable event', async () => {
    actionError = true
    expect((await fetch(`${url}/api/events/${eventId}/company`, { method: 'POST', headers: { Authorization: 'Bearer valid-session', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'join' }) })).status).toBe(404)
  })
  it('reports missing configuration clearly', async () => {
    expect((await fetch(`${url}/unconfigured`)).status).toBe(503)
  })
  it('computes a finite distance for antipodal coordinates', () => {
    expect(distanceMiles(0, 0, 0, 180)).toBeCloseTo(12437, -1)
  })
})
