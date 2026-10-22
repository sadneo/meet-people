import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { PixelPebble } from '../../src/features/pebble-art/PixelArt'
import { MatchingScreen } from '../../src/features/matchmaking/MatchingScreen'

vi.mock('../../src/supabase', () => ({ supabase: null }))
vi.mock('../../src/auth/useSession', () => ({ useSession: () => ({ ready: true, session: { access_token: 'test-jwt' } }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('mascot initializes exactly one current expression and never overlays Happy and Thinking during changes', () => {
  const view = render(<PixelPebble thinking />)
  const image = () => view.container.querySelectorAll('image')
  expect(image()).toHaveLength(1)
  expect(image()[0].getAttribute('href')).toContain('pebble-thinking')
  view.rerender(<PixelPebble />)
  expect(image()).toHaveLength(1)
  expect(image()[0].getAttribute('href')).toContain('pebble-happy')
  view.rerender(<PixelPebble thinking />)
  expect(image()).toHaveLength(1)
  expect(image()[0].getAttribute('href')).toContain('pebble-thinking')
})
for (const mode of ['active', 'downtime'] as const) {
  it(`mascot ${mode} waits for confirmed queue expression on reload rather than briefly showing the wrong face`, async () => {
    let finish!: (response: Response) => void
    const pending = new Promise<Response>(resolve => { finish = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/status') ? pending : Response.json({ profile: null })))
    const view = render(<MemoryRouter><MatchingScreen mode={mode} /></MemoryRouter>)
    expect(view.container.querySelector('.pt-pixel-pebble')).toBeNull()
    finish(Response.json({ mode }))
    await screen.findByRole('button', { name: 'Check for a match' })
    if (mode === 'active') {
      await waitFor(() => expect(view.container.querySelector('.friends-scene.is-searching')).toBeTruthy())
      expect(view.container.querySelectorAll('.friends-mascot')).toHaveLength(1)
    } else {
      await waitFor(() => expect(view.container.querySelector('.pt-pixel-pebble')?.getAttribute('data-expression')).toBe('thinking'))
      expect(view.container.querySelectorAll('.pt-pixel-pebble image')).toHaveLength(1)
    }
  })
}
