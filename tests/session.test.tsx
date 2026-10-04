import { cleanup, render, screen, act } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { afterEach, expect, it, vi } from 'vitest'
import { useSession } from '../src/auth/useSession'
import { eventRequest } from '../src/features/events/client'
import { z } from 'zod'

const state = vi.hoisted(() => ({ session: null as Session | null, listeners: new Set<(event: string, session: Session | null) => void>(), unsubscribe: vi.fn() }))
vi.mock('../src/supabase', () => ({
  supabase: { auth: {
    onAuthStateChange(callback: (event: string, session: Session | null) => void) {
      state.listeners.add(callback)
      queueMicrotask(() => { if (state.listeners.has(callback)) callback('INITIAL_SESSION', state.session) })
      return { data: { subscription: { unsubscribe() { state.listeners.delete(callback); state.unsubscribe() } } } }
    },
    getSession: async () => ({ data: { session: state.session } }),
  } },
}))

function Account({ label }: { label: string }) {
  const { session, ready } = useSession()
  return <p>{label}: {ready ? session?.user.id ?? 'guest' : 'loading'}</p>
}
afterEach(() => { cleanup(); state.session = null; state.unsubscribe.mockClear(); vi.unstubAllGlobals() })

it('keeps host account controls and event API requests on the same restored session', async () => {
  state.session = { access_token: 'shared-session-token', user: { id: 'authenticated-user' } } as Session
  render(<><Account label="Shell" /><Account label="Events" /></>)
  await screen.findByText('Shell: authenticated-user')
  await screen.findByText('Events: authenticated-user')
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
  vi.stubGlobal('fetch', fetchMock)
  await eventRequest('/test', z.object({ ok: z.boolean() }))
  expect(fetchMock).toHaveBeenCalledWith('/api/events/test', expect.objectContaining({ headers: { Authorization: 'Bearer shared-session-token' } }))
  act(() => { state.session = null; for (const listener of state.listeners) listener('SIGNED_OUT', null) })
  expect(screen.getByText('Shell: guest')).toBeTruthy()
  expect(screen.getByText('Events: guest')).toBeTruthy()
  await eventRequest('/test', z.object({ ok: z.boolean() }))
  expect(fetchMock).toHaveBeenLastCalledWith('/api/events/test', expect.objectContaining({ headers: {} }))
  cleanup()
  expect(state.listeners.size).toBe(0)
  expect(state.unsubscribe).toHaveBeenCalledTimes(2)
})
