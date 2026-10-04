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

describe('integrated matchmaking demo', () => {
  it('uses the prototype shell branding without a duplicate page wordmark', () => {
    const { container } = render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)

    expect(screen.getAllByRole('link', { name: 'Pebble home' })).toHaveLength(1)
    expect(container.querySelector('.match-wordmark')).toBeNull()
    expect(screen.queryByText('Friends first')).toBeNull()
    expect(screen.getByText('Active matchmaking')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preferences' })).toBeTruthy()
  })

  it('starts and cancels a simulated search', () => {
    render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
    expect(screen.getByRole('status').textContent).toContain('Ready when you are.')
    fireEvent.click(screen.getByRole('button', { name: 'Start matching' }))
    expect(screen.getByRole('status').textContent).toContain('Looking around...')
    expect(screen.getByRole('img', { name: 'Pebble friends looking for another friend' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }))
    expect(screen.getByRole('status').textContent).toContain('Ready when you are.')
  })

  it('switches from active to downtime matchmaking', () => {
    render(<MemoryRouter initialEntries={['/matchmaking']}><App /><CurrentPath /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Downtime matchmaking' }))

    expect(screen.getByLabelText('Current path').textContent).toBe('/downtime-matchmaking')
    expect(screen.getByRole('heading', { name: 'Meet people, even while you’re away' })).toBeTruthy()
  })

  it('opens preferences and saves the local profile', () => {
    render(<MemoryRouter initialEntries={['/matchmaking']}><App /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Preferences' }))
    expect(screen.getByRole('dialog', { name: 'Your preferences' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Approximate area'), { target: { value: 'North campus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(screen.getByText('North campus')).toBeTruthy()
    expect(localStorage.getItem('pebble.matchmaking-profile')).toContain('North campus')
  })
})
