import { StrictMode, useState } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import NativeBridge from '../../src/platform/NativeBridge'

const mocks = vi.hoisted(() => ({
  native: true,
  location: { pathname: '/events', search: '' },
  navigate: vi.fn(),
  addListener: vi.fn(),
  minimizeApp: vi.fn(),
  getLaunchUrl: vi.fn(),
  open: vi.fn(),
}))
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate, useLocation: () => mocks.location }))
vi.mock('../../src/platform/native', () => ({ isNative: () => mocks.native, APP_SCHEME: 'garden.pebble' }))
vi.mock('@capacitor/app', () => ({ App: mocks }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: mocks.open } }))

type Handle = { remove: () => Promise<void> }
let back: ((event: { canGoBack: boolean }) => void) | undefined
let active: Set<() => void>

async function pressBack(canGoBack = true) {
  expect(back, 'native Back listener must be registered').toBeTypeOf('function')
  await act(async () => { back!({ canGoBack }) })
}

function dialog() {
  const element = document.createElement('dialog')
  element.open = true
  element.close = vi.fn(() => { element.open = false })
  document.body.append(element)
  return element
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.native = true
  mocks.location = { pathname: '/events', search: '' }
  window.history.replaceState({ idx: 2 }, '')
  back = undefined
  active = new Set()
  mocks.addListener.mockImplementation(async (name, callback) => {
    if (name === 'backButton') { back = callback; active.add(callback) }
    return { remove: vi.fn(async () => { active.delete(callback) }) }
  })
  mocks.minimizeApp.mockResolvedValue(undefined)
  mocks.getLaunchUrl.mockResolvedValue(undefined)
  mocks.open.mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); document.body.replaceChildren() })

describe('native Back policy', () => {
  it('cancels the topmost dialog before considering route history', async () => {
    const first = dialog(), top = dialog()
    const firstCancel = vi.fn(), topCancel = vi.fn()
    first.addEventListener('cancel', firstCancel)
    top.addEventListener('cancel', topCancel)
    render(<NativeBridge />)
    await pressBack()
    expect(topCancel).toHaveBeenCalledOnce()
    expect(topCancel.mock.calls[0][0].cancelable).toBe(true)
    expect(firstCancel).not.toHaveBeenCalled()
    expect(top.close).toHaveBeenCalledOnce()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('keeps a busy dialog open when its cancel handler prevents dismissal', async () => {
    const top = dialog()
    top.addEventListener('cancel', event => event.preventDefault())
    render(<NativeBridge />)
    await pressBack()
    expect(top.open).toBe(true)
    expect(top.close).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('allows the modal cancel handler to return from a nested map without closing the modal', async () => {
    function NestedModal() {
      const [nested, setNested] = useState(true)
      return <dialog open onCancel={event => { event.preventDefault(); setNested(false) }}>{nested ? 'Map' : 'Preferences'}</dialog>
    }
    const view = render(<><NativeBridge /><NestedModal /></>)
    const top = view.container.querySelector('dialog')!
    top.close = vi.fn()
    await pressBack()
    expect(top.textContent).toBe('Preferences')
    expect(top.close).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('uses the focused top modal when dialogs were opened out of DOM order', async () => {
    const top = dialog(), underlying = dialog(), input = document.createElement('input')
    top.append(input)
    input.focus()
    render(<NativeBridge />)
    await pressBack()
    expect(top.close).toHaveBeenCalledOnce()
    expect(underlying.close).not.toHaveBeenCalled()
  })

  it('uses router history when available and reads the latest route without registering again', async () => {
    const view = render(<NativeBridge />)
    await pressBack()
    expect(mocks.navigate).toHaveBeenLastCalledWith(-1)
    mocks.location = { pathname: '/home', search: '' }
    view.rerender(<NativeBridge />)
    await pressBack()
    expect(mocks.minimizeApp).toHaveBeenCalledOnce()
    expect(mocks.addListener.mock.calls.filter(([name]) => name === 'backButton')).toHaveLength(1)
  })

  it('closes transient chat options before history, focuses the summary, and preserves the draft', async () => {
    mocks.location = { pathname: '/messages/chat', search: '?conversation=123' }
    const view = render(<><NativeBridge />
      <details className="chat-options" open><summary>Conversation options and safety</summary><button>View people</button></details>
      <details open><summary>Saved conversation information</summary>Persistent content</details>
      <textarea aria-label="Message" defaultValue="Unsent draft" />
    </>)
    const options = view.container.querySelector<HTMLDetailsElement>('.chat-options')!
    const draft = view.container.querySelector('textarea')!
    options.querySelector('button')!.focus()
    await pressBack()
    expect(options.open).toBe(false)
    expect(document.activeElement).toBe(options.querySelector('summary'))
    expect(view.container.querySelector<HTMLDetailsElement>('details:not(.chat-options)')!.open).toBe(true)
    expect(draft.value).toBe('Unsent draft')
    expect(draft.isConnected).toBe(true)
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(mocks.minimizeApp).not.toHaveBeenCalled()
    await pressBack()
    expect(mocks.navigate).toHaveBeenCalledWith(-1)
  })

  it('lets the topmost modal handle Back before an underlying chat options menu', async () => {
    const view = render(<><NativeBridge /><details className="chat-options" open><summary>Options</summary></details></>)
    const top = dialog()
    top.addEventListener('cancel', event => event.preventDefault())
    const options = view.container.querySelector('details')!
    await pressBack()
    expect(top.close).not.toHaveBeenCalled()
    expect(options.open).toBe(true)
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('does not dismiss arbitrary persistent disclosures instead of navigating Back', async () => {
    const view = render(<><NativeBridge /><details open><summary>Account information</summary>Persistent content</details></>)
    await pressBack()
    expect(view.container.querySelector('details')!.open).toBe(true)
    expect(mocks.navigate).toHaveBeenCalledWith(-1)
  })

  it.each(['/', '/home', '/community', '/login'])('minimizes at root %s even with auth history', async pathname => {
    mocks.location = { pathname, search: '' }
    render(<NativeBridge />)
    await pressBack()
    expect(mocks.minimizeApp).toHaveBeenCalledOnce()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it.each([
    ['/messages/chat', '?conversation=123', '/messages'],
    ['/messages/requests', '', '/messages'],
    ['/events/123', '', '/events'],
    ['/matchmaking/food', '?date=2026-11-06', '/matchmaking'],
    ['/profile', '?section=settings', '/profile'],
    ['/register', '', '/login'],
    ['/auth/forgot-password', '', '/login'],
    ['/forgot-password', '', '/login'],
    ['/reset-password', '', '/login'],
    ['/auth/callback', '', '/login'],
    ['/events', '', '/'],
  ])('falls back from a direct link %s%s to %s', async (pathname, search, fallback) => {
    window.history.replaceState({ idx: 0 }, '')
    mocks.location = { pathname, search }
    render(<NativeBridge />)
    // Native WebView history may include a pre-router entry: router idx wins.
    await pressBack(true)
    expect(mocks.navigate).toHaveBeenCalledWith(fallback, { replace: true })
  })

  it.each(['?category=Lecture%20%26%20Discussion%2FQ%26A&page=2', ''])('preserves the event directory query on cold-detail Back: %s', async search => {
    window.history.replaceState({ idx: 0 }, '')
    mocks.location = { pathname: '/events/123', search }
    render(<NativeBridge />)
    await pressBack()
    expect(mocks.navigate).toHaveBeenCalledWith(`/events${search}`, { replace: true })
  })

  it('uses existing event-detail history rather than replacing it with a query fallback', async () => {
    mocks.location = { pathname: '/events/123', search: '?category=Lecture%20%26%20Discussion&page=2' }
    render(<NativeBridge />)
    await pressBack()
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith(-1)
  })

  it('does not blur focused inputs or synthesize keyboard events', async () => {
    const top = dialog(), input = document.createElement('input')
    top.append(input)
    input.focus()
    const keydown = vi.fn()
    input.addEventListener('keydown', keydown)
    top.addEventListener('cancel', event => event.preventDefault())
    render(<NativeBridge />)
    await pressBack()
    expect(document.activeElement).toBe(input)
    expect(keydown).not.toHaveBeenCalled()
  })

  it('cleans up delayed listener registrations in StrictMode and ignores stale callbacks', async () => {
    const pending: Array<{ resolve: (handle: Handle) => void; callback: (event: { canGoBack: boolean }) => void }> = []
    mocks.addListener.mockImplementation((_name, callback) => new Promise<Handle>(resolve => pending.push({ resolve, callback })))
    const view = render(<StrictMode><NativeBridge /></StrictMode>)
    const removes = pending.map(() => vi.fn(async () => {}))
    await act(async () => pending.forEach((item, index) => item.resolve({ remove: removes[index] })))
    const backs = mocks.addListener.mock.calls.flatMap(([name, callback]) => name === 'backButton' ? [callback] : [])
    expect(backs).toHaveLength(2)
    await act(async () => backs[0]({ canGoBack: true }))
    expect(mocks.navigate).not.toHaveBeenCalled()
    await act(async () => backs[1]({ canGoBack: true }))
    expect(mocks.navigate).toHaveBeenCalledOnce()
    view.unmount()
    await act(async () => {})
    removes.forEach(remove => expect(remove).toHaveBeenCalledOnce())
    await act(async () => backs[1]({ canGoBack: true }))
    expect(mocks.navigate).toHaveBeenCalledOnce()
  })

  it('handles rejected plugin registrations, launch lookup, minimize and cleanup', async () => {
    mocks.location = { pathname: '/login', search: '' }
    mocks.getLaunchUrl.mockRejectedValue(new Error('unavailable'))
    mocks.minimizeApp.mockRejectedValue(new Error('unavailable'))
    mocks.addListener.mockImplementation(async (name, callback) => {
      if (name === 'appUrlOpen') throw new Error('unavailable')
      back = callback
      return { remove: async () => { throw new Error('unavailable') } }
    })
    const view = render(<NativeBridge />)
    await pressBack()
    view.unmount()
    await act(async () => {})
  })

  it('handles a rejected Back listener registration without an unhandled promise', async () => {
    mocks.addListener.mockRejectedValue(new Error('unavailable'))
    const view = render(<NativeBridge />)
    await act(async () => {})
    view.unmount()
    await act(async () => {})
  })

  it('retains cold-start auth callback routing and system-browser external links', async () => {
    mocks.getLaunchUrl.mockResolvedValue({ url: 'garden.pebble://app/reset-password?code=back-regression' })
    const view = render(<><NativeBridge /><a href="https://example.com/event" target="_blank">Listing</a></>)
    await act(async () => {})
    expect(mocks.navigate).toHaveBeenCalledWith({ pathname: '/auth/callback', search: '?code=back-regression&flow=recovery', hash: '' })
    mocks.open.mockRejectedValue(new Error('unavailable'))
    const link = view.container.querySelector('a')!
    await act(async () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      link.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    })
    expect(mocks.open).toHaveBeenCalledWith({ url: 'https://example.com/event' })
    view.unmount()
    await act(async () => {})
    expect(active.size).toBe(0)
  })

  it('does not register native handlers on web', () => {
    mocks.native = false
    render(<NativeBridge />)
    expect(mocks.addListener).not.toHaveBeenCalled()
  })
})
