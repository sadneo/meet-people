import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { FriendsAvailability, FriendsInterests, FriendsScene } from '../src/features/matchmaking/FriendsPresentation'
import type { MatchingProfile } from '../shared/matchmaking'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('never persists interest drafts locally and enforces the 30-interest cap', () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  const change = vi.fn()
  render(<FriendsInterests values={Array.from({ length: 30 }, (_, i) => `Tag ${i}`)} onChange={change} disabled={false} />)
  expect((screen.getByRole('button', { name: 'Coffee', exact: true }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Add yours' }))
  fireEvent.change(screen.getByLabelText('Add a matching interest'), { target: { value: 'New tag' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add interest' }))
  expect(screen.getByRole('alert').textContent).toContain('30 interests')
  expect(change).not.toHaveBeenCalled()
  expect(storage).not.toHaveBeenCalled()
})
it('explicitly clearing a full coarse block retains exact before/after portions and other days', () => {
  const windows = [{ dow: 1, start_time: '07:15:00', end_time: '19:30:00' }, { dow: 2, start_time: '09:03:00', end_time: '11:17:00' }]
  const change = vi.fn()
  render(<FriendsAvailability values={windows} onChange={change} disabled={false} />)
  fireEvent.click(screen.getByRole('button', { name: 'Monday morning, available' }))
  expect(change).toHaveBeenCalledWith([
    { dow: 1, start_time: '07:15:00', end_time: '08:00:00' },
    { dow: 1, start_time: '12:00:00', end_time: '19:30:00' },
    windows[1],
  ])
  expect(windows[0].end_time).toBe('19:30:00')
})
it('keeps all 28 blocks inline, exposes mixed exact coverage and preserves times outside an explicitly changed block', () => {
  function Editor() {
    const [value, setValue] = useState<MatchingProfile['availability']>([{ dow: 1, start_time: '07:15:00', end_time: '09:45:00' }])
    return <><FriendsAvailability values={value} onChange={setValue} disabled={false} /><output>{JSON.stringify(value)}</output></>
  }
  render(<Editor />)
  expect(screen.getByRole('table').querySelectorAll('button')).toHaveLength(28)
  const mixed = screen.getByRole('button', { name: 'Monday morning, partially available' })
  expect(mixed.getAttribute('aria-pressed')).toBe('mixed')
  fireEvent.click(mixed)
  expect(screen.getByRole('button', { name: 'Monday morning, available' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('status').textContent).toContain('07:15:00')
  expect(screen.getByRole('status').textContent).toContain('08:00:00')
  fireEvent.click(screen.getByRole('button', { name: 'Clear availability' }))
  expect(screen.getByRole('status').textContent).toBe('[]')
})
it('normalises custom tags, validates two words / 40 characters and deduplicates without storage', () => {
  function Editor() {
    const [value, setValue] = useState(['Coffee'])
    return <FriendsInterests values={value} onChange={setValue} disabled={false} />
  }
  render(<Editor />)
  fireEvent.click(screen.getByRole('button', { name: 'Add yours' }))
  const input = screen.getByLabelText('Add a matching interest')
  fireEvent.change(input, { target: { value: 'one two three' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add interest' }))
  expect(screen.getByRole('alert').textContent).toContain('two words')
  fireEvent.change(input, { target: { value: 'x'.repeat(41) } })
  fireEvent.click(screen.getByRole('button', { name: 'Add interest' }))
  expect(screen.getByRole('alert').textContent).toContain('40')
  fireEvent.change(input, { target: { value: '  cOFFee  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add interest' }))
  expect(screen.getByRole('alert').textContent).toContain('already selected')
  fireEvent.change(input, { target: { value: '  Board   games  ' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByRole('button', { name: 'Board games' }).getAttribute('aria-pressed')).toBe('true')
  expect(localStorage.getItem('pebble.shared-preferences.v1')).toBeNull()
})
it('renders only local original art and exactly three decorative companions', () => {
  const { container } = render(<FriendsScene searching />)
  expect(container.querySelector('img.friends-mascot')?.getAttribute('src')).toBe('/prototype/friends/pebble-mascot.png')
  expect(container.querySelectorAll('img[src="/prototype/friends/pebble-companion.png"]')).toHaveLength(3)
  expect(container.querySelector('.friends-orbit')).toBeNull()
  expect(screen.getByText('A little time. New connections.')).toBeTruthy()
})
