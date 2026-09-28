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

describe('event matchmaking', () => {
  it('forms an event group without entering the Free Time flow', () => {
    render(<MemoryRouter initialEntries={['/events/detail']}><App /><CurrentPath /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Find someone to go with' }))

    expect(screen.getByRole('heading', { name: 'Your event group is ready' })).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.getByText('Jamie Chen')).toBeTruthy()
    expect(screen.getByText('Aaron Patel')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Acoustic afternoon' })).toBeTruthy()
    expect(screen.getByLabelText('Current path').textContent).toBe('/events/detail')
    expect(screen.queryByRole('heading', { name: 'Find your people' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Events' }).every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
    expect(screen.queryByRole('link', { name: 'Free Time' })).toBeNull()
  })

  it('can return from the matched group to the event matchmaking prompt', () => {
    render(<MemoryRouter initialEntries={['/events/detail']}><App /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Find someone to go with' }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave group' }))

    expect(screen.getByRole('heading', { name: 'Find your company' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find someone to go with' })).toBeTruthy()
  })
})
