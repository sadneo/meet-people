import { expect, it, vi } from 'vitest'
import { eventDate } from '../src/features/events/client'

vi.mock('../src/supabase', () => ({ supabase: null }))

it('shows both calendar dates for an event spanning multiple days', () => {
  const start = new Date(2026, 9, 24, 18), end = new Date(2026, 9, 26, 14)
  const formatted = eventDate(start.toISOString(), end.toISOString())
  expect(formatted).toContain(start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))
  expect(formatted).toContain(end.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))
})

it('keeps a same-day range compact with the ending time', () => {
  const start = new Date(2026, 9, 24, 18), end = new Date(2026, 9, 24, 20)
  const formatted = eventDate(start.toISOString(), end.toISOString())
  const day = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  expect(formatted.split(day)).toHaveLength(2)
  expect(formatted).toContain(end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))
})

it('includes the years when an event continues into the next calendar year', () => {
  expect(eventDate(new Date(2026, 11, 31, 18).toISOString(), new Date(2027, 0, 1, 2).toISOString())).toMatch(/2026.*2027/)
})

it('keeps a known start date when the ending date is missing or invalid', () => {
  const start = new Date(2026, 9, 24, 18).toISOString()
  expect(eventDate(start, 'invalid')).toBe(eventDate(start, null))
  expect(eventDate(null, null)).toBe('Date to be announced')
})
