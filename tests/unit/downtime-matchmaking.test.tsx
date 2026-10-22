import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { requiredPreferences, accountFixture } from './complete-profile-fixture'
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ session: { access_token: 'user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }, ready: true }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
it('uses the downtime server queue, not persisted demo state, and checks only on demand', async () => {
  localStorage.setItem('pebble.downtime-matching', 'true')
  let mode: string | null = null
  const calls: string[] = []
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input))
    if (String(input).endsWith('/account')) return Response.json(accountFixture({ username: 'sam', display_name: 'Sam', bio: null, avatar_url: null, ...requiredPreferences }))
    if (String(input).endsWith('/account-profile')) return Response.json({ profile: { username: 'sam', display_name: 'Sam', bio: null, avatar_url: null } })
    if (String(input).endsWith('/profile')) return Response.json({ profile: { username: 'sam', display_name: 'Sam', bio: null, avatar_url: null, ...requiredPreferences } })
    if (init?.method === 'POST') { expect(JSON.parse(String(init.body))).toEqual({ mode: 'downtime' }); mode = 'downtime' }
    if (init?.method === 'DELETE') mode = null
    return Response.json({ mode })
  }))
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>)
  const start = await screen.findByRole('switch', { name: 'Allow downtime matching', exact: true })
  await waitFor(() => expect(start.disabled).toBe(false))
  fireEvent.click(start)
  await waitFor(() => expect(start.getAttribute('aria-checked')).toBe('true'))
  expect(calls.some(path => path.endsWith('/result'))).toBe(false)
  await waitFor(() => expect(start.disabled).toBe(false))
  fireEvent.click(start)
  await waitFor(() => expect(start.getAttribute('aria-checked')).toBe('false'))
  expect(localStorage.getItem('pebble.downtime-matching')).toBe('true')
})
