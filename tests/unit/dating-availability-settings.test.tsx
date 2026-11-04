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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function open() {
  const details = screen.getByText('Timezone & shared availability').parentElement as HTMLDetailsElement
  details.open = true; fireEvent(details, new Event('toggle'))
}
it('reads only when opened, requires a chosen timezone and preserves hidden availability', async () => {
  const onSaved = vi.fn()
  render(<MatchingSchedule token="owner-token" disabled={false} onSaved={onSaved}/>)
  expect(fetch).not.toHaveBeenCalled()
  open()
  const input = screen.getByLabelText('Timezone') as HTMLInputElement
  await waitFor(() => expect(input.disabled).toBe(false))
  expect(input.value).toBe('')
  expect(fetch).toHaveBeenCalledOnce()
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer owner-token')
  fireEvent.change(input, { target: { value: 'America/New_York' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save timezone & sharing' }))
  await screen.findByText('Timezone and sharing preference saved.')
  expect(stored).toEqual({ revision: 1, timeZone: 'America/New_York', showAvailability: false })
  expect(onSaved).toHaveBeenCalledOnce()
})
it('requires a read after an uncertain save and does not automatically retry a write', async () => {
  render(<MatchingSchedule token="owner-token" disabled={false} onSaved={vi.fn()}/>)
  open()
  await waitFor(() => expect((screen.getByLabelText('Timezone') as HTMLInputElement).disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'America/New_York' } })
  failSave = true
  fireEvent.click(screen.getByRole('button', { name: 'Save timezone & sharing' }))
  await screen.findByRole('alert')
  expect((screen.getByRole('button', { name: 'Save timezone & sharing' }) as HTMLButtonElement).disabled).toBe(true)
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Reload timezone' }))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Save timezone & sharing' }) as HTMLButtonElement).disabled).toBe(false))
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1)
})
it('offers a compact timezone dropdown and saves only after an explicit selection', async () => {
  const onSaved = vi.fn()
  render(<MatchingSchedule compact token="owner-token" disabled={false} onSaved={onSaved}/> )
  open()
  const select = screen.getByRole('combobox', { name: 'Timezone' }) as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false))
  expect(select.value).toBe('')
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0)
  expect(screen.queryByRole('button', { name: 'Save timezone & sharing' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reload timezone' })).toBeNull()
  fireEvent.change(select, { target: { value: 'America/New_York' } })
  await screen.findByText('Timezone and sharing preference saved.')
  expect(stored).toEqual({ revision: 1, timeZone: 'America/New_York', showAvailability: false })
  expect(onSaved).toHaveBeenCalledOnce()
})
it('offers recovery rather than automatically retrying a failed compact timezone save', async () => {
  render(<MatchingSchedule compact token="owner-token" disabled={false} onSaved={vi.fn()}/> )
  open()
  const select = screen.getByRole('combobox', { name: 'Timezone' }) as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false))
  failSave = true
  fireEvent.change(select, { target: { value: 'Europe/London' } })
  await screen.findByRole('alert')
  expect(select.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reload timezone' }))
  await waitFor(() => expect(select.disabled).toBe(false))
  expect(select.value).toBe('')
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1)
})

function detect(zone: string | null) {
  const original = Intl.DateTimeFormat.prototype.resolvedOptions
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function () {
    if (zone === null) throw new Error('Device detection unavailable')
    return { ...original.call(this), timeZone: zone }
  })
}
const automatic = () => render(<MatchingSchedule compact autoDetectTimezone token="owner-token" disabled={false} onSaved={vi.fn()}/> )
const writes = () => fetch.mock.calls.filter(call => call[1]?.method === 'PUT')

it('detects, revision-saves and reads back the device zone while preserving sharing', async () => {
  detect('Asia/Tokyo'); stored.showAvailability = true
  automatic()
  await screen.findByText('Device timezone saved. You can change it below.')
  expect(stored).toEqual({ revision: 1, timeZone: 'Asia/Tokyo', showAvailability: true })
  expect(writes()).toHaveLength(1)
  expect(fetch.mock.calls.map(call => call[1]?.method)).toEqual(['GET', 'PUT', 'GET'])
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Europe/London' } })
  await screen.findByText('Timezone and sharing preference saved.')
  expect(stored.timeZone).toBe('Europe/London')
  expect(stored.showAvailability).toBe(true)
})

it('keeps a saved timezone even when the device differs', async () => {
  detect('Asia/Tokyo'); stored.timeZone = 'America/Chicago'
  automatic()
  await waitFor(() => expect((screen.getByLabelText('Timezone') as HTMLSelectElement).disabled).toBe(false))
  expect((screen.getByLabelText('Timezone') as HTMLSelectElement).value).toBe('America/Chicago')
  expect(writes()).toHaveLength(0)
})

it.each([null, '', 'GMT', '+05:30', 'Invalid/Zone'])('falls back to editable manual selection when detection returns %s', async zone => {
  detect(zone); automatic()
  const select = screen.getByLabelText('Timezone') as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false))
  expect(select.value).toBe('')
  expect(writes()).toHaveLength(0)
  fireEvent.change(select, { target: { value: 'Europe/London' } })
  await screen.findByText('Timezone and sharing preference saved.')
  expect(stored.timeZone).toBe('Europe/London')
})

it('does not retry a failed automatic write on explicit read-only recovery', async () => {
  detect('UTC'); failSave = true; automatic()
  await screen.findByRole('alert')
  expect(writes()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Reload timezone' }))
  await waitFor(() => expect((screen.getByLabelText('Timezone') as HTMLSelectElement).disabled).toBe(false))
  expect(writes()).toHaveLength(1)
  expect(stored.timeZone).toBeNull()
})

it('requires reconciliation when readback disagrees with the automatic save response', async () => {
  detect('UTC')
  fetch.mockImplementationOnce(async () => Response.json(stored))
    .mockImplementationOnce(async () => Response.json({ ...stored, revision: 1, timeZone: 'UTC' }))
  automatic()
  await screen.findByRole('alert')
  expect((screen.getByLabelText('Timezone') as HTMLSelectElement).disabled).toBe(true)
  expect(screen.queryByText('Device timezone saved. You can change it below.')).toBeNull()
  expect(writes()).toHaveLength(1)
})

it('recovers an uncertain but persisted automatic save by reading, never replaying it', async () => {
  detect('UTC')
  const ready = vi.fn()
  fetch.mockImplementationOnce(async () => Response.json(stored))
    .mockImplementationOnce(async () => {
      stored = { revision: 1, timeZone: 'UTC', showAvailability: false }
      throw new Error('Response lost after persistence')
    })
  render(<MatchingSchedule compact autoDetectTimezone token="owner-token" disabled={false} onSaved={vi.fn()} onReadyChange={ready}/> )
  await screen.findByRole('alert')
  expect(ready).toHaveBeenLastCalledWith(false)
  fireEvent.click(screen.getByRole('button', { name: 'Reload timezone' }))
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith(true))
  expect((screen.getByLabelText('Timezone') as HTMLSelectElement).value).toBe('UTC')
  expect(writes()).toHaveLength(1)
})

it('preserves the concurrent saved choice after an automatic-write conflict', async () => {
  detect('UTC')
  fetch.mockImplementationOnce(async () => Response.json(stored))
    .mockImplementationOnce(async () => {
      stored = { revision: 1, timeZone: 'Europe/Paris', showAvailability: true }
      return Response.json({ error: 'Schedule changed.', code: 'conflict' }, { status: 409 })
    })
  automatic()
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Reload timezone' }))
  await waitFor(() => expect((screen.getByLabelText('Timezone') as HTMLSelectElement).disabled).toBe(false))
  expect((screen.getByLabelText('Timezone') as HTMLSelectElement).value).toBe('Europe/Paris')
  expect((screen.getByLabelText('Allow shared-time explanations') as HTMLInputElement).checked).toBe(true)
  expect(writes()).toHaveLength(1)
})
