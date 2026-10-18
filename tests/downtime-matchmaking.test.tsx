import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../src/App'
import { emptyAccount } from '../shared/account'
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: { access_token: 'user-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }, ready: true }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })
it('uses the downtime server queue, not persisted demo state, and checks only on demand', async () => {
  localStorage.setItem('pebble.downtime-matching', 'true')
  let mode: string | null = null
  const calls: string[] = []
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input))
    if (String(input).endsWith('/account')) return Response.json({ ...emptyAccount, completed: [0, 1, 2, 3] })
    if (String(input).endsWith('/profile')) return Response.json({ profile: { username: 'sam', display_name: 'Sam', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] } })
    if (init?.method === 'POST') { expect(JSON.parse(String(init.body))).toEqual({ mode: 'downtime' }); mode = 'downtime' }
    if (init?.method === 'DELETE') mode = null
    return Response.json({ mode })
  }))
  render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)
  const start = await screen.findByRole('button', { name: 'Turn on downtime matching', exact: true })
  await waitFor(() => expect(start.disabled).toBe(false))
  fireEvent.click(start)
  await screen.findByRole('button', { name: 'Pause downtime matching', exact: true })
  expect(screen.getByRole('status').textContent).toContain('downtime queue')
  expect(calls.some(path => path.endsWith('/result'))).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Pause downtime matching', exact: true }))
  await screen.findByRole('button', { name: 'Turn on downtime matching', exact: true })
  expect(localStorage.getItem('pebble.downtime-matching')).toBe('true')
})
