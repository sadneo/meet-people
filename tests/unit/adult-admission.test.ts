import { afterEach, expect, it, vi } from 'vitest'
import { meetsMinimumAge } from '../../src/ui/age-visibility'

afterEach(() => vi.useRealTimers())
it('admits only valid birthdays at least 18 years ago, including the birthday boundary', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
  expect(meetsMinimumAge('2008-11-13')).toBe(true)
  expect(meetsMinimumAge('2008-11-14')).toBe(false)
  expect(meetsMinimumAge('2010-01-01')).toBe(false)
  expect(meetsMinimumAge('2027-01-01')).toBe(false)
  expect(meetsMinimumAge('2000-02-30')).toBe(false)
  expect(meetsMinimumAge(null)).toBe(false)
})
