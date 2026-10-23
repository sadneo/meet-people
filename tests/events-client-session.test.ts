import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { eventRequest } from '../src/features/events/client'

vi.mock('../src/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'member-token' } } }) } } }))
afterEach(() => vi.unstubAllGlobals())
const schema = z.object({ title: z.string() })

it('sends public reads without the session so viewers share cached responses', async () => {
  const fetch = vi.fn(async () => Response.json({ title: 'Campus concert' }))
  vi.stubGlobal('fetch', fetch)
  await eventRequest('?page=1', schema, { anonymous: true })
  expect(fetch).toHaveBeenLastCalledWith('/api/events?page=1', expect.objectContaining({ cache: 'default', headers: {} }))
})

it('keeps the session and bypasses the browser cache for signed-in requests', async () => {
  const fetch = vi.fn(async () => Response.json({ title: 'Campus concert' }))
  vi.stubGlobal('fetch', fetch)
  await eventRequest('/id/company', schema)
  expect(fetch).toHaveBeenLastCalledWith('/api/events/id/company', expect.objectContaining({ cache: 'no-store', headers: { Authorization: 'Bearer member-token' } }))
})
