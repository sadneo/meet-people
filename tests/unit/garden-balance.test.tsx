import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { GardenBalance } from '../../src/features/garden/Garden'

afterEach(cleanup)
const show = (known: boolean, failed: boolean, balance = 0) =>
  render(<GardenBalance balance={balance} known={known} failed={failed} live disabled={false} onClick={() => {}} />)

it('shows a loading placeholder, not 0, before the balance is confirmed', () => {
  show(false, false)
  const pill = screen.getByRole('button', { name: 'Pebble balance loading' })
  expect(pill.textContent).toBe('—')
})

it('shows an unavailable state after a failed load', () => {
  show(false, true)
  expect(screen.getByRole('button', { name: 'Pebble balance unavailable' }).textContent).toBe('—')
})

it('still shows a real zero when confirmed', () => {
  show(true, false, 0)
  const pill = screen.getByRole('button', { name: 'Build with 0 Pebbles' })
  expect(pill.textContent).toBe('0')
})
