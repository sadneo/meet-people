import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

vi.stubGlobal('scrollTo', () => {})

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('downtime matchmaking demo', () => {
  it('explains the passive matching criteria and local-only boundary', () => {
    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Meet people, even while you’re away' })).toBeTruthy()
    expect(screen.getByText('Shared interests')).toBeTruthy()
    expect(screen.getByText('Overlapping free time')).toBeTruthy()
    expect(screen.getByText('Nearby places')).toBeTruthy()
    expect(screen.getByText(/simulated on this device/i)).toBeTruthy()
  })

  it('edits shared matching preferences directly from downtime matchmaking', () => {
    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    expect(screen.getByRole('dialog', { name: 'Your preferences' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Approximate area'), { target: { value: 'West campus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(screen.getByText('West campus')).toBeTruthy()
    expect(localStorage.getItem('pebble.matchmaking-profile')).toContain('West campus')
  })

  it('switches from downtime to active matchmaking', () => {
    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /><CurrentPath /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Active matchmaking' }))

    expect(screen.getByLabelText('Current path').textContent).toBe('/matchmaking')
    expect(screen.getByRole('heading', { name: 'Find your people' })).toBeTruthy()
  })

  it('enables and disables a persisted downtime search', () => {
    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Turn on downtime matching' }))

    expect(screen.getByRole('status').textContent).toContain('Downtime matching is on')
    expect(localStorage.getItem('pebble.downtime-matching')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Pause downtime matching' }))

    expect(screen.getByRole('status').textContent).toContain('Downtime matching is paused')
    expect(localStorage.getItem('pebble.downtime-matching')).toBe('false')
  })

  it('restores an enabled downtime search after remounting', () => {
    localStorage.setItem('pebble.downtime-matching', 'true')

    const view = render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Pause downtime matching' })).toBeTruthy()

    view.unmount()
    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)
    expect(screen.getByRole('status').textContent).toContain('Downtime matching is on')
  })

  it('reuses saved matchmaking preferences', () => {
    localStorage.setItem('pebble.matchmaking-profile', JSON.stringify({
      age: '24', area: 'North campus', distance: 'Under 10 min',
      interests: ['Pottery', 'Coffee'], schedule: ['wed-evening'], places: ['Coffee shops'],
    }))

    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)

    expect(screen.getByText('North campus')).toBeTruthy()
    expect(screen.getByText('Pottery')).toBeTruthy()
    expect(screen.getByText('Wed evening')).toBeTruthy()
  })

  it('falls back safely when stored matching preferences are malformed', () => {
    localStorage.setItem('pebble.matchmaking-profile', JSON.stringify({
      area: 'North campus', interests: 'not-an-array', schedule: { bad: true }, places: null,
    }))

    render(<MemoryRouter initialEntries={['/downtime-matchmaking']}><App /></MemoryRouter>)

    expect(screen.getByText('Stony Brook campus')).toBeTruthy()
    expect(screen.getByText('Hiking')).toBeTruthy()
    expect(screen.getByText('Mon evening')).toBeTruthy()
  })
})