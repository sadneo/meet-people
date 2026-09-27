import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
vi.stubGlobal('scrollTo', () => {})
afterEach(cleanup)

describe('routes', () => {
  it('renders the home route', () => {
    render(
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Your Pebble community' })).toBeTruthy()
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
