import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchingViews } from '../src/features/matchmaking/MatchingViews'

// Component contracts, not application access: App access is tested separately.
function App() { const { pathname } = useLocation(); return <MatchingViews mode={pathname === '/downtime-matchmaking' ? 'downtime' : 'active'} /> }

vi.mock('../src/supabase', () => ({ supabase: null }))
const auth = vi.hoisted(() => ({ ready: true, session: { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } } as { access_token: string; user: { id: string } } | null }))
vi.mock('../src/auth/useSession', () => ({ useSession: () => auth }))
const hook = vi.hoisted(() => vi.fn())
vi.mock('../src/features/matchmaking/useMatchmaking', async importOriginal => {
  const original = await importOriginal<typeof import('../src/features/matchmaking/useMatchmaking')>()
  return { ...original, useMatchmaking: (token: string) => { hook(); return original.useMatchmaking(token) } }
})
let saved = false
const profile = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null, birthdate: null, location_city: null, interests: ['Coffee'], availability: [] }
const fetchMock = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input).endsWith('/account-profile') ? { profile: null } : String(input).endsWith('/profile') ? { profile: saved ? profile : null } : { mode: null }))
beforeEach(() => {
  auth.ready = true; auth.session = { access_token: 'test-jwt', user: { id: 'a0000000-0000-4000-8000-000000000001' } }
  saved = false; hook.mockClear(); fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('scrollTo', () => {})
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear() })
it('reference-local card has route overlays, one real photo bar and honest unclipped filter/details dialogs', () => {
  const view = render(<MemoryRouter initialEntries={['/matchmaking?source=reference&view=dating']}><nav aria-label="Host navbar">Unchanged host</nav><App /></MemoryRouter>)
  const host = screen.getByRole('navigation', { name: 'Host navbar' }).outerHTML
  expect(view.container.querySelector('[data-front]')?.getAttribute('data-design')).toBe('reference')
  expect(view.container.querySelector('.dating-overlay-header .match-view-segments')).not.toBeNull()
  expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('href')).toBe('/matchmaking?source=reference')
  expect(screen.getAllByRole('img', { name: 'Photo 1 of 1', exact: true })).toHaveLength(1)
  expect(screen.getAllByText('Prototype profile', { exact: true }).length).toBeGreaterThan(0)
  const actions = screen.getByRole('group', { name: 'Recommendation decisions' })
  expect(within(actions).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Undo local decision', 'Skip recommendation', 'Star prototype recommendation, local only', 'Like recommendation'])
  const filter = screen.getByRole('button', { name: 'Prototype preferences', exact: true })
  filter.focus(); fireEvent.click(filter)
  const dialog = screen.getByRole('dialog', { name: 'Prototype preferences', exact: true })
  expect(within(dialog).getByText('Prototype preferences are not connected.', { exact: true })).toBeTruthy()
  expect(view.container.querySelector('.dating-stack')!.contains(dialog)).toBe(false)
  expect(within(dialog).queryByRole('slider')).toBeNull()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(filter)
  const about = screen.getByRole('button', { name: 'About Ari', exact: true })
  about.focus(); fireEvent.click(about)
  const details = screen.getByRole('dialog', { name: 'About Ari — prototype profile', exact: true })
  expect(within(details).getByText(/fictional profile.*not facts about the pictured person/i)).toBeTruthy()
  fireEvent.click(within(details).getByRole('button', { name: 'Close prototype dialog' }))
  expect(document.activeElement).toBe(about)
  expect(screen.getByRole('navigation', { name: 'Host navbar' }).outerHTML).toBe(host)
  expect(hook).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0)
})
it('reference-local decisions lock for 420ms, enter for 300ms, support ephemeral undo/star and focused keyboard only', () => {
  vi.useFakeTimers()
  const view = render(<MemoryRouter initialEntries={['/matchmaking?view=dating']}><App /></MemoryRouter>)
  const first = view.container.querySelector('[data-front]')!
  const next = view.container.querySelector('[data-dating-card="prototype-rowan"]')!
  const undo = screen.getByRole('button', { name: 'Undo local decision' }) as HTMLButtonElement
  expect(undo.disabled).toBe(true)
  const like = screen.getByRole('button', { name: 'Like recommendation' })
  fireEvent.keyDown(document, { key: 'ArrowRight' }); fireEvent.keyDown(like, { key: 'ArrowLeft' })
  expect(first.classList.contains('is-liking')).toBe(false)
  fireEvent.click(like); fireEvent.click(like)
  act(() => { vi.advanceTimersByTime(419) }); expect(first.isConnected).toBe(true); expect(next.isConnected).toBe(true)
  act(() => { vi.advanceTimersByTime(1) })
  expect(view.container.querySelector('[data-front]')).toBe(next)
  expect(next.classList.contains('is-entering')).toBe(true)
  act(() => { vi.advanceTimersByTime(300) }); expect(next.classList.contains('is-entering')).toBe(false)
  fireEvent.click(undo)
  expect(screen.getByRole('heading', { name: 'Ari, 24', exact: true })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Undo local decision' }) as HTMLButtonElement).disabled).toBe(true)
  expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Prototype recommendation stack' }))
  fireEvent.click(screen.getByRole('button', { name: 'Star prototype recommendation, local only' }))
  expect(view.container.querySelector('[data-front]')!.classList.contains('is-liking')).toBe(true)
  act(() => { vi.advanceTimersByTime(420) })
  expect(screen.getByRole('heading', { name: 'Rowan, 26', exact: true })).toBeTruthy()
  const stack = screen.getByRole('group', { name: 'Prototype recommendation stack' })
  stack.focus(); fireEvent.keyDown(stack, { key: 'ArrowRight' })
  act(() => { vi.advanceTimersByTime(420) })
  expect(screen.getByRole('heading', { name: 'Noa, 23', exact: true })).toBeTruthy()
  expect(hook).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
})
it('reference-local touch ignores controls and vertical gestures, supports horizontal card swipes and cancels timers on unmount', () => {
  vi.useFakeTimers()
  const view = render(<MemoryRouter initialEntries={['/matchmaking?view=dating']}><App /></MemoryRouter>)
  const card = view.container.querySelector('[data-front]')!
  const swipe = (target: Element, x: number, y: number) => {
    fireEvent.touchStart(target, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(target, { changedTouches: [{ clientX: x, clientY: y }] })
  }
  swipe(screen.getByRole('button', { name: 'Like recommendation' }), 50, 110)
  swipe(card, 210, 240)
  expect(card.classList.contains('is-skipping')).toBe(false)
  swipe(card, 60, 110)
  expect(card.classList.contains('is-skipping')).toBe(true)
  const schedule = vi.spyOn(window, 'clearTimeout')
  view.unmount(); expect(schedule).toHaveBeenCalled()
  act(() => { vi.runOnlyPendingTimers() })
  expect(hook).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
})
it('local Dating uses decorative local full-card photos with disclosed fixture metadata and contrast-safe decision icons', () => {
  const view = render(<MemoryRouter initialEntries={['/matchmaking?view=dating']}><App /></MemoryRouter>)
  const cards = [...view.container.querySelectorAll('[data-dating-card]')]
  expect(cards).toHaveLength(3)
  for (const [index, card] of cards.entries()) {
    expect(card.getAttribute('data-presentation')).toBe('photo')
    const photo = card.querySelector('img')!
    expect(photo.getAttribute('src')).toBe(`/prototype/dating/${['ari', 'rowan', 'noa'][index]}.jpg`)
    expect(photo.getAttribute('alt')).toBe('')
    expect(card.querySelector('.dating-photo-scrim')?.getAttribute('aria-hidden')).toBe('true')
    expect(card.querySelector('.dating-card-info')?.textContent?.split(' · ')).toHaveLength(2)
  }
  expect(screen.getByText('Local prototype recommendations — not live Dating matches.', { exact: true })).toBeTruthy()
  const like = screen.getByRole('button', { name: 'Like recommendation', exact: true })
  expect(like.querySelector('[data-icon="heart"]')).not.toBeNull()
  expect(like.getAttribute('aria-describedby')).toBe('dating-prototype-disclosure')
  expect(screen.getByRole('button', { name: 'Skip recommendation', exact: true }).querySelector('[data-icon="x"]')).not.toBeNull()
  expect(hook).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
})
it('local Dating decisions remove cards in order, retain the next rendered card, complete and restart without network or storage', () => {
  vi.useFakeTimers()
  const view = render(<MemoryRouter initialEntries={['/matchmaking?source=profile&view=dating']}><App /></MemoryRouter>)
  expect(screen.getByText('Local prototype recommendations — not live Dating matches.', { exact: true })).toBeTruthy()
  const cards = [...view.container.querySelectorAll('[data-dating-card]')]
  expect(cards).toHaveLength(3)
  expect(cards[0].getAttribute('data-front')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Skip recommendation', exact: true }))
  expect(cards[0].classList.contains('is-skipping')).toBe(true)
  expect(cards[1].isConnected).toBe(true)
  expect((screen.getByRole('button', { name: 'Like recommendation', exact: true }) as HTMLButtonElement).disabled).toBe(true)
  act(() => { vi.advanceTimersByTime(420) })
  expect(cards[0].isConnected).toBe(false)
  expect(view.container.querySelector('[data-front="true"]')).toBe(cards[1])
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Skip recommendation', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Like recommendation', exact: true }))
  expect(cards[1].classList.contains('is-liking')).toBe(true)
  expect(cards[2].isConnected).toBe(true)
  act(() => { vi.advanceTimersByTime(420) })
  expect(view.container.querySelector('[data-front="true"]')).toBe(cards[2])
  fireEvent.click(screen.getByRole('button', { name: 'Skip recommendation', exact: true }))
  act(() => { vi.advanceTimersByTime(420) })
  expect(screen.getByRole('heading', { name: 'You’ve explored the prototype', exact: true })).toBeTruthy()
  const restart = screen.getByRole('button', { name: 'Restart prototype', exact: true })
  expect(document.activeElement).toBe(restart)
  fireEvent.click(restart)
  expect(view.container.querySelectorAll('[data-dating-card]')).toHaveLength(3)
  expect(view.container.querySelector('[data-front="true"]')?.getAttribute('data-dating-card')).toBe(cards[0].getAttribute('data-dating-card'))
  expect(hook).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
  expect(localStorage.length).toBe(0)
})
it('reduced motion advances once without a timed slide, and leaving an in-flight deck clears its timer', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const view = render(<MemoryRouter initialEntries={['/matchmaking?view=dating']}><App /></MemoryRouter>)
  const first = view.container.querySelector('[data-front="true"]')
  const like = screen.getByRole('button', { name: 'Like recommendation', exact: true })
  fireEvent.click(like); fireEvent.click(like)
  act(() => { vi.advanceTimersByTime(15) })
  expect(view.container.querySelectorAll('[data-dating-card]')).toHaveLength(2)
  expect(first?.isConnected).toBe(false)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Like recommendation', exact: true }))
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const schedule = vi.spyOn(window, 'setTimeout'), cancel = vi.spyOn(window, 'clearTimeout')
  fireEvent.click(screen.getByRole('button', { name: 'Skip recommendation', exact: true }))
  const scheduled = schedule.mock.calls.findIndex(([, delay]) => delay === 420)
  expect(scheduled).toBeGreaterThanOrEqual(0)
  const timer = schedule.mock.results[scheduled].value
  view.unmount()
  expect(cancel).toHaveBeenCalledWith(timer)
  expect(hook).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
})
it('signed-in Dating has a semantic header and disclosed local decisions for the same Pebble account', () => {
  render(<MemoryRouter initialEntries={['/matchmaking?source=profile&view=dating']}><App /></MemoryRouter>)
  const region = screen.getByRole('region', { name: 'Dating in your downtime', exact: true })
  expect(within(region).getByRole('heading', { name: 'Dating in your downtime', exact: true }).closest('header')).not.toBeNull()
  const decisions = within(region).getByRole('group', { name: 'Recommendation decisions', exact: true })
  const disclosure = within(region).getByText('Local prototype recommendations — not live Dating matches.', { exact: true })
  const action = within(decisions).getByRole('button', { name: 'Like recommendation', exact: true }) as HTMLButtonElement
  expect(action.disabled).toBe(false)
  expect(action.querySelector('svg')?.getAttribute('data-icon')).toBe('heart')
  expect(within(decisions).getByRole('button', { name: 'Skip recommendation', exact: true }).querySelector('svg')?.getAttribute('data-icon')).toBe('x')
  const card = within(region).getByRole('article')
  expect(card.querySelector('.dating-card-info')?.textContent).toBe('Art walks · coffee stops')
  expect(card.querySelectorAll('li')).toHaveLength(3)
  expect(card.querySelector('.dating-eyebrow')?.textContent).toBe('Prototype profile')
  expect(card.querySelector('.dating-bio')?.textContent).toBe('Art walks, coffee stops, and taking\nthe scenic route home.')
  expect(action.getAttribute('aria-describedby')).toBe(disclosure.id)
  expect(within(region).getByText('Same Pebble account. Your Friends queue stays as it is.', { exact: true })).toBeTruthy()
  expect(within(region).getAllByRole('button')).toHaveLength(6)
  expect(screen.queryByRole('link', { name: /sign in|register|onboarding/i })).toBeNull()
  expect(hook).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled()
})
function History() {
  const location = useLocation(), navigate = useNavigate()
  return <><output aria-label="URL">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>History back</button></>
}
for (const query of ['', '?view=unknown']) {
  it(`active Friends safely renders ${query || 'default'} with selector but no Dating behavior or automatic queue writes/lookups`, async () => {
    render(<MemoryRouter initialEntries={[`/matchmaking${query}`]}><App /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Find Friends', exact: true })
    expect(screen.getByRole('navigation', { name: 'Matching views' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dating', exact: true }).getAttribute('href')).toBe('/matchmaking?view=dating')
    expect(screen.queryByRole('heading', { name: 'Dating in your downtime' })).toBeNull()
    expect(hook).toHaveBeenCalled()
    expect(fetchMock.mock.calls.every(([input]) => !String(input).includes('dating') && !String(input).endsWith('/queue') && !String(input).endsWith('/result'))).toBe(true)
  })
}
for (const state of ['missing', 'saved', 'signed-out', 'loading']) {
  it(`main selector persists without product Settings shortcuts while ${state}`, async () => {
    saved = state === 'saved'
    if (state === 'signed-out') auth.session = null
    if (state === 'loading') auth.ready = false
    const view = render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
    if (state === 'missing') await screen.findByRole('heading', { name: 'Find your people' })
    if (state === 'saved') await screen.findByRole('button', { name: 'Preferences', exact: true })
    expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('href')).toBe('/matchmaking')
    expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Dating', exact: true }).getAttribute('href')).toBe('/matchmaking?view=dating')
    expect(view.container.querySelectorAll('.match-home a[href="/settings"]')).toHaveLength(0)
    expect(screen.queryByRole('link', { name: 'Matchmaking settings', exact: true })).toBeNull()
  })
}
const path = '/downtime-matchmaking'
for (const state of ['authenticated', 'signed-out', 'loading']) {
  it(`shared downtime navigation remains unique through Friends/Dating switching while ${state}`, async () => {
    if (state === 'signed-out') auth.session = null
    if (state === 'loading') auth.ready = false
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
    const navigation = () => screen.getByRole('navigation', { name: 'Matching modes', exact: true })
    expect(navigation().querySelectorAll('a')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Active matchmaking', exact: true }).getAttribute('href')).toBe('/matchmaking')
    fireEvent.click(screen.getByRole('link', { name: 'Dating', exact: true }))
    expect(screen.queryByRole('navigation', { name: 'Matching modes', exact: true })).toBeNull()
    expect(screen.getByText('Local prototype recommendations — not live Dating matches.', { exact: true })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip recommendation', exact: true })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Friends', exact: true }))
    fireEvent.click(screen.getByRole('link', { name: 'Active matchmaking', exact: true }))
    expect(screen.queryByRole('link', { name: 'Matchmaking settings', exact: true })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Downtime matchmaking', exact: true })).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Matching views' })).toBeTruthy()
  })
}
it('legacy Friends downtime offers Settings without duplicate start/setup or queue hooks', async () => {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Manage downtime in Settings', exact: true })
  expect(screen.getByRole('link', { name: 'Open matchmaking settings', exact: true }).getAttribute('href')).toBe('/settings')
  expect(screen.queryByRole('button', { name: 'Turn on downtime matching', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Set up matching preferences', exact: true })).toBeNull()
  expect(hook).not.toHaveBeenCalled()
  expect(fetchMock.mock.calls.every(([input]) => !String(input).endsWith('/queue') && !String(input).endsWith('/result'))).toBe(true)
})
for (const datingPath of ['/matchmaking', path]) {
  it(`${datingPath} Dating deep link has only local fixture cards without matching hooks/requests`, () => {
    const view = render(<MemoryRouter initialEntries={[`${datingPath}?view=dating`]}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Dating in your downtime' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('1 of 3')
    const purpose = screen.getByRole('region', { name: 'Dating in your downtime' })
    expect(within(purpose).getAllByRole('button')).toHaveLength(6)
    expect((screen.getByRole('button', { name: 'Like recommendation', exact: true }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('link', { name: 'Dating', exact: true }).getAttribute('aria-current')).toBe('page')
    expect(view.container.querySelectorAll('[data-dating-card]')).toHaveLength(3)
    expect(within(purpose).getAllByRole('article')).toHaveLength(1)
    expect(within(purpose).getByRole('img', { name: 'Photo 1 of 1', exact: true })).toBeTruthy()
    expect(purpose.querySelector('[data-front] img')?.getAttribute('alt')).toBe('')
    expect(purpose.querySelector('[data-front] img')?.getAttribute('src')).toBe('/prototype/dating/ari.jpg')
    expect(screen.getByText('Local prototype recommendations — not live Dating matches.', { exact: true })).toBeTruthy()
    expect(hook).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
}
  it('downtime preserves other query parameters and native history between views', async () => {
    render(<MemoryRouter initialEntries={[`${path}?source=home&view=dating`]}><App /><History /></MemoryRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Friends', exact: true }))
    await screen.findByRole('heading', { name: 'Manage downtime in Settings', exact: true })
    expect(hook).not.toHaveBeenCalled()
    expect(screen.getByLabelText('URL').textContent).toBe(`${path}?source=home`)
    fireEvent.click(screen.getByRole('button', { name: 'History back' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Dating in your downtime' })).toBeTruthy())
    expect(screen.getByLabelText('URL').textContent).toBe(`${path}?source=home&view=dating`)
  })
  it('downtime defaults unknown views to Friends', async () => {
    render(<MemoryRouter initialEntries={[`${path}?view=unknown`]}><App /></MemoryRouter>)
    await screen.findByRole('heading', { name: 'Manage downtime in Settings', exact: true })
    expect(screen.getByRole('link', { name: 'Friends', exact: true }).getAttribute('aria-current')).toBe('page')
  })
