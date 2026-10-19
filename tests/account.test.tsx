import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { AccountBoundary } from '../src/auth/account'
import { useAccount } from '../src/auth/account-context'
import { emptyAccount, SaveAccountSchema } from '../shared/account'
import { profileToAccount } from '../src/auth/profile'

const auth = vi.hoisted(() => ({ session: { access_token: 'first-token', user: { id: 'first' } } as Session | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => ({ session: auth.session, ready: true }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.session = { access_token: 'first-token', user: { id: 'first' } } as Session })
function Identity() { const state = useAccount()!; return <p>{state.account.profile?.display_name ?? 'blank'}:{state.session?.user.id ?? 'guest'}</p> }
it('discards a delayed account response after switching identities', async () => {
  let finish!: (response: Response) => void
  const pending = new Promise<Response>(resolve => { finish = resolve })
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Headers(init.headers).get('Authorization') === 'Bearer first-token' ? pending : Promise.resolve(Response.json(emptyAccount))))
  const view = render(<MemoryRouter initialEntries={['/login']}><AccountBoundary><Identity /></AccountBoundary></MemoryRouter>)
  auth.session = { access_token: 'second-token', user: { id: 'second' } } as Session
  view.rerender(<MemoryRouter initialEntries={['/login']}><AccountBoundary><Identity /></AccountBoundary></MemoryRouter>)
  await screen.findByText('blank:second')
  await act(async () => { finish(Response.json({ ...emptyAccount, profile: { username: 'first', display_name: 'First user', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] } })); await pending })
  expect(screen.queryByText(/First user/)).toBeNull()
  expect(screen.getByText('blank:second')).toBeTruthy()
})
it('does not acknowledge a failed account save', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => init.method === 'PUT' ? Response.json({ code: 'provider', error: 'Save failed.' }, { status: 503 }) : Response.json(emptyAccount)))
  const value = profileToAccount({ name: 'My Name', bio: 'My bio', photo: '', interests: [], intents: [], usual: [], distance: '5 miles', group: 'Either' }, emptyAccount, 'first')
  value.completed = [0]
  function Editor() {
    const account = useAccount()!
    const [result, setResult] = useState('')
    return <><Identity /><button disabled={!account.loaded} onClick={async () => setResult(String(await account.save(value)))}>Save</button><p>{result}</p></>
  }
  render(<MemoryRouter initialEntries={['/login']}><AccountBoundary><Editor /></AccountBoundary></MemoryRouter>)
  await screen.findByText('blank:first')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
  await screen.findByText('false')
  expect(screen.getByText('Save failed.')).toBeTruthy()
  expect(screen.getByText('blank:first')).toBeTruthy()
})
it('accepts optional photos and rejects forged fields or incomplete progression', () => {
  const account = profileToAccount({ name: 'My Name', bio: 'My bio', photo: '', interests: ['Coffee', 'Art', 'Music'], intents: ['Meet people'], usual: ['Afternoons', 'Weekends'], distance: '5 miles', group: 'Either' }, emptyAccount, 'first')
  account.profile = { ...account.profile!, birthdate: '2001-02-03', location_city: 'Explicit campus' }
  account.completed = [0, 1, 2, 3]
  expect(SaveAccountSchema.safeParse(account).success).toBe(true)
  expect(account.profile?.avatar_url).toBeNull()
  expect(account.profile?.availability.filter(window => window.dow === 0)).toEqual([{ dow: 0, start_time: '08:00:00', end_time: '21:00:00' }])
  expect(SaveAccountSchema.safeParse({ ...account, user_id: 'other' }).success).toBe(false)
  expect(SaveAccountSchema.safeParse({ ...account, completed: [0, 2] }).success).toBe(false)
  expect(SaveAccountSchema.safeParse({ ...account, preferences: { ...account.preferences, usual: [] }, profile: { ...account.profile, availability: [] } }).success).toBe(false)
})
