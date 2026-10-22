import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AvailablePeoplePreview } from '../../src/features/prototype/AvailablePeoplePreview'

afterEach(() => { cleanup(); vi.useRealTimers() })
const people = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `Person ${i}`, avatar: null }))
const button = () => screen.getByRole('button', { name: 'Refresh people who are available now' })
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

it('finishes a fast load at 1750ms total and ignores repeated activation', async () => {
  vi.useFakeTimers()
  const load = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 500)))
  render(<AvailablePeoplePreview people={people} openProfile={() => {}} refreshPeople={load} />)
  fireEvent.click(button())
  await tick(500)
  fireEvent.click(button())
  await tick(1249)
  expect(button().getAttribute('aria-disabled')).toBe('true')
  await tick(1)
  expect(button().getAttribute('aria-disabled')).toBe('false')
  expect(load).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status').textContent).toBe('People refreshed.')
})

it('waits for a slow load without adding another visual delay', async () => {
  vi.useFakeTimers()
  const load = () => new Promise<void>(resolve => setTimeout(resolve, 2500))
  render(<AvailablePeoplePreview people={people} openProfile={() => {}} refreshPeople={load} />)
  fireEvent.click(button())
  await tick(1750)
  expect(button().getAttribute('aria-disabled')).toBe('true')
  await tick(749)
  expect(button().getAttribute('aria-disabled')).toBe('true')
  await tick(1)
  expect(button().getAttribute('aria-disabled')).toBe('false')
})

it('retains the old preview on failure and allows retry after the minimum', async () => {
  vi.useFakeTimers()
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  render(<AvailablePeoplePreview people={people} openProfile={() => {}} refreshPeople={load} />)
  fireEvent.click(button())
  await tick(1750)
  expect(screen.getByRole('status').textContent).toContain('Could not refresh')
  expect(screen.getByRole('button', { name: "View Person 0's profile" })).toBeTruthy()
  fireEvent.click(button())
  await tick(1750)
  expect(screen.getByRole('status').textContent).toBe('People refreshed.')
})

it('aborts the optional loader and clears the visual timer when leaving Home', async () => {
  vi.useFakeTimers()
  const load = vi.fn<(signal: AbortSignal) => Promise<void>>().mockResolvedValue(undefined)
  const { unmount } = render(<AvailablePeoplePreview people={people} openProfile={() => {}} refreshPeople={load} />)
  fireEvent.click(button())
  await tick(1)
  unmount()
  expect(load.mock.calls[0][0].aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
