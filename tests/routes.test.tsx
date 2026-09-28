import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
vi.stubGlobal('scrollTo', () => {})
afterEach(cleanup)

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

describe('routes', () => {
  it('renders the home route', () => {
    render(
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Your Pebble community' })).toBeTruthy()
  })

  it('opens the dedicated interactive matchmaking page from the prototype homepage', () => {
    render(<MemoryRouter initialEntries={['/']}><App /><CurrentPath /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Start matching' }))

    expect(screen.getByRole('heading', { name: 'Find your people' })).toBeTruthy()
    expect(screen.getByText('Shared interests. Free time. Nearby plans.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preferences' })).toBeTruthy()
    expect(screen.getByLabelText('Current path').textContent).toBe('/matchmaking')
  })

  it('shows Matchmaking before Events and opens active matchmaking', () => {
    render(<MemoryRouter initialEntries={['/']}><App /><CurrentPath /></MemoryRouter>)

    const desktopNavigation = screen.getAllByRole('navigation', { name: 'Primary navigation' })[0]
    const links = Array.from(desktopNavigation.querySelectorAll('a')).map(link => link.textContent)
    expect(links).toEqual(['Home', 'Matchmaking', 'Events', 'Messages'])

    fireEvent.click(screen.getAllByRole('link', { name: 'Matchmaking' })[0])
    expect(screen.getByLabelText('Current path').textContent).toBe('/matchmaking')
    expect(screen.getByRole('heading', { name: 'Find your people' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Matchmaking' }).every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('keeps the Matchmaking tab active on downtime matchmaking', () => {
    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)
    expect(screen.getAllByRole('link', { name: 'Matchmaking' }).every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('opens standalone downtime matchmaking from the prototype homepage', () => {
    render(<MemoryRouter initialEntries={['/']}><App /><CurrentPath /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Match while away' }))

    expect(screen.getByRole('heading', { name: 'Meet people, even while you’re away' })).toBeTruthy()
    expect(screen.getByText('Downtime matchmaking')).toBeTruthy()
    expect(screen.getByLabelText('Current path').textContent).toBe('/downtime-matchmaking')
  })

  it('hides Free Time from navigation but preserves its direct route', () => {
    const view = render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
    expect(screen.queryByRole('link', { name: 'Free Time' })).toBeNull()

    view.unmount()
    render(<MemoryRouter initialEntries={['/free-time']}><App /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Who’s free?' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Free Time' })).toBeNull()
  })

  it('renders canonical product routes', () => {
    render(<MemoryRouter initialEntries={['/events']}><App /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Events around campus' })).toBeTruthy()
  })

  it.each(['/prototype', '/prototype?scene=events', '/community'])('removes %s', path => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })

  it('renders the not-found route', () => {
    render(<MemoryRouter initialEntries={['/missing']}><App /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
