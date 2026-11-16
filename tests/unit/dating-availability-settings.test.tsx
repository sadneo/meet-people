import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MatchingSchedule } from '../../src/ui/MatchingSchedule'

let stored: { revision: number; timeZone: string | null; showAvailability: boolean }
let failSave: boolean
const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method === 'PUT') {
    if (failSave) throw new Error('Network interrupted')
    const value = JSON.parse(String(init.body))
    stored = { revision: value.expectedRevision + 1, timeZone: value.timeZone, showAvailability: value.showAvailability }
  }
  return Response.json(stored)
})
beforeEach(() => {
  stored = { revision: 0, timeZone: null, showAvailability: false }; failSave = false
  fetch.mockClear(); vi.stubGlobal('fetch', fetch)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function open() {
  const details = screen.getByText('Timezone & shared availability').parentElement as HTMLDetailsElement
  details.open = true; fireEvent(details, new Event('toggle'))
}
async function chooseCity(city: string) {
  const picker = screen.getByRole('button', { name: /^Timezone:/ }) as HTMLButtonElement
  await waitFor(() => expect(picker.disabled).toBe(false))
  fireEvent.click(picker)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search by city or timezone' }), { target: { value: city } })
  fireEvent.click(screen.getByRole('button', { name: new RegExp(city, 'i') }))
}
it('reads only when opened, requires a chosen timezone and preserves hidden availability', async () => {
  const onSaved = vi.fn()
  render(<MatchingSchedule token="owner-token" disabled={false} onSaved={onSaved}/>)
  expect(fetch).not.toHaveBeenCalled()
  open()
  const picker = screen.getByRole('button', { name: 'Timezone: Choose a timezone' }) as HTMLButtonElement
  await waitFor(() => expect(picker.disabled).toBe(false))
  expect(fetch).toHaveBeenCalledOnce()
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer owner-token')
  await chooseCity('New York')
  fireEvent.click(screen.getByRole('button', { name: 'Save timezone & sharing' }))
  await screen.findByText('Timezone and sharing preference saved.')
  expect(stored).toEqual({ revision: 1, timeZone: 'America/New_York', showAvailability: false })
  expect(onSaved).toHaveBeenCalledOnce()
})
it('requires a read after an uncertain save and does not automatically retry a write', async () => {
  render(<MatchingSchedule token="owner-token" disabled={false} onSaved={vi.fn()}/>)
  open()
  await chooseCity('New York')
  failSave = true
  fireEvent.click(screen.getByRole('button', { name: 'Save timezone & sharing' }))
  await screen.findByRole('alert')
  expect((screen.getByRole('button', { name: 'Save timezone & sharing' }) as HTMLButtonElement).disabled).toBe(true)
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Reload timezone' }))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Save timezone & sharing' }) as HTMLButtonElement).disabled).toBe(false))
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1)
})
it('offers a compact timezone search and saves only after an explicit selection', async () => {
  const onSaved = vi.fn()
  render(<MatchingSchedule compact token="owner-token" disabled={false} onSaved={onSaved}/> )
  open()
  const picker = screen.getByRole('button', { name: /^Timezone:/ }) as HTMLButtonElement
  await waitFor(() => expect(picker.disabled).toBe(false))
  expect(picker.textContent).toContain('Choose a timezone')
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0)
  expect(screen.queryByRole('button', { name: 'Save timezone & sharing' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reload timezone' })).toBeNull()
  await chooseCity('New York')
  await screen.findByText('Timezone and sharing preference saved.')
  expect(stored).toEqual({ revision: 1, timeZone: 'America/New_York', showAvailability: false })
  expect(onSaved).toHaveBeenCalledOnce()
})
it('offers recovery rather than automatically retrying a failed compact timezone save', async () => {
  render(<MatchingSchedule compact token="owner-token" disabled={false} onSaved={vi.fn()}/> )
  open()
  const picker = screen.getByRole('button', { name: /^Timezone:/ }) as HTMLButtonElement
  await waitFor(() => expect(picker.disabled).toBe(false))
  failSave = true
  await chooseCity('London')
  await screen.findByRole('alert')
  expect(picker.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reload timezone' }))
  await waitFor(() => expect(picker.disabled).toBe(false))
  expect(picker.textContent).toContain('Choose a timezone')
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1)
})
