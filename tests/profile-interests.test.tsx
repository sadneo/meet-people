import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchingSetup } from '../src/features/matchmaking/MatchingScreen'

const identity = { username: 'fixture', display_name: 'Fixture', bio: null, avatar_url: null }
const initial = { ...identity, interests: ['Coffee', 'Music', 'Gaming', 'Outdoors', 'Pottery', 'Chess'], availability: [], birthdate: null, location_city: null }
const save = vi.fn(async () => true)
beforeEach(() => { save.mockClear(); vi.stubGlobal('fetch', vi.fn(async () => Response.json({ profile: identity }))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const button = (name: string) => screen.getByRole('button', { name, exact: true }) as HTMLButtonElement
const input = () => screen.getByLabelText('Add a matching interest')
const add = (value: string) => { fireEvent.change(input(), { target: { value } }); fireEvent.click(button('Add interest')) }
async function start(interests = initial.interests) {
  const view = render(<MemoryRouter><MatchingSetup token="fixture" initial={{ ...initial, interests }} busy={false} error="" save={save} presentation="profile" /></MemoryRouter>)
  await waitFor(() => expect(button('Save shared preferences').disabled).toBe(false))
  return view
}

it('renders the same 7×4 semantic weekly table used by matching, including late windows', async () => {
  await start()
  const table = within(screen.getByRole('table', { name: 'Weekly availability' }))
  expect(table.getAllByRole('columnheader').map(item => item.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  expect(table.getAllByRole('button', { pressed: false })).toHaveLength(28)
  for (const toggle of table.getAllByRole('button')) expect(toggle.textContent).toBe('')
  fireEvent.click(button('Monday morning, not available'))
  fireEvent.click(button('Sunday late, not available'))
  expect(button('Monday morning, available').getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(button('Save shared preferences'))
  expect(save).toHaveBeenCalledWith({ ...initial, availability: [{ dow: 1, start_time: '08:00:00', end_time: '12:00:00' }, { dow: 0, start_time: '21:00:00', end_time: '24:00:00' }] })
})
it('preserves more than five server labels and supports trimmed custom addition/removal', async () => {
  await start()
  expect(button('Chess').getAttribute('aria-pressed')).toBe('true')
  add('  Climbing  ')
  fireEvent.click(button('Music'))
  fireEvent.click(button('Save shared preferences'))
  expect(save).toHaveBeenCalledWith({ ...initial, interests: ['Coffee', 'Gaming', 'Outdoors', 'Pottery', 'Chess', 'Climbing'] })
})
it('enforces the real 30-label contract without discarding existing values', async () => {
  const interests = Array.from({ length: 30 }, (_, index) => `Label ${index + 1}`)
  await start(interests)
  fireEvent.change(input(), { target: { value: 'Extra' } })
  expect(button('Add interest').disabled).toBe(true)
  fireEvent.click(button('Save shared preferences'))
  expect(save).toHaveBeenCalledWith({ ...initial, interests })
  fireEvent.click(button('Label 30'))
  expect(button('Add interest').disabled).toBe(false)
})
it('rejects blank and exact duplicate labels but retains contractual case and multiline data', async () => {
  await start(['Board games\nstrategy', 'Coffee'])
  for (const value of ['   ', 'Coffee']) {
    fireEvent.change(input(), { target: { value } })
    expect(button('Add interest').disabled).toBe(true)
  }
  add('Live music')
  fireEvent.click(button('Save shared preferences'))
  expect(save).toHaveBeenCalledWith({ ...initial, interests: ['Board games\nstrategy', 'Coffee', 'Live music'] })
})
it('unmounting the shared editor drops unsaved selections without storage or writes', async () => {
  const view = await start()
  add('Unsent'); fireEvent.click(button('Monday morning, not available'))
  view.unmount(); await start()
  expect(screen.queryByRole('button', { name: 'Unsent', exact: true })).toBeNull()
  expect(button('Monday morning, not available').getAttribute('aria-pressed')).toBe('false')
  expect(save).not.toHaveBeenCalled()
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
})
it('guards direct submission when availability windows overlap', async () => {
  await start()
  fireEvent.click(button('Monday evening, not available'))
  fireEvent.click(screen.getByText('Exact time windows (1)'))
  fireEvent.click(button('Add time window'))
  fireEvent.submit(button('Save shared preferences').closest('form')!)
  expect(screen.getByRole('alert').textContent).toContain('non-overlapping')
  expect(save).not.toHaveBeenCalled()
})
