import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MatchFilterSheet, filterDefaults, normalizeFilters, type MatchFilters } from '../src/features/matchmaking/MatchFilterSheet'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
function Harness({ mode = 'Dating' }: { mode?: 'Friends' | 'Dating' }) {
  const [open, setOpen] = useState(false), [value, setValue] = useState(filterDefaults[mode])
  return <><button onClick={() => setOpen(true)}>Filters</button>{open && <MatchFilterSheet mode={mode} value={value} close={() => setOpen(false)} save={mode === 'Dating' ? async next => { setValue(next) } : undefined} />}</>
}
const slider = (name: string) => screen.getByRole('slider', { name }) as HTMLInputElement
it('clamps adult integer bounds, nonfinite values and equal ages', () => {
  expect(normalizeFilters({ distance: 200, lower: 12, upper: 120 })).toEqual({ distance: 100, lower: 18, upper: 99 })
  expect(normalizeFilters({ distance: NaN, lower: 30.2, upper: 20 })).toEqual({ distance: 15, lower: 30, upper: 30 })
})
it('opens a draft, clamps crossing handles, discards on Escape, and restores focus/scroll', () => {
  document.body.style.overflow = 'auto'
  render(<Harness />)
  const opener = screen.getByText('Filters'); opener.focus(); fireEvent.click(opener)
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close filters' }))
  fireEvent.change(slider('Minimum age'), { target: { value: '99' } })
  expect(slider('Minimum age').value).toBe('30')
  fireEvent.change(slider('Maximum age'), { target: { value: '18' } })
  expect(slider('Maximum age').value).toBe('30')
  fireEvent.change(slider('Minimum age'), { target: { value: '18' } })
  fireEvent.change(slider('Maximum age'), { target: { value: '99' } })
  expect(slider('Maximum age').value).toBe('99')
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(document.activeElement).toBe(opener); expect(document.body.style.overflow).toBe('auto')
  fireEvent.click(opener)
  expect(slider('Minimum age').value).toBe('23'); expect(slider('Maximum age').value).toBe('30')
})
it('reset affects only draft; local Dating Save survives reopening but not unmount, without storage or requests', async () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem'), fetch = vi.spyOn(globalThis, 'fetch')
  const view = render(<Harness />)
  fireEvent.click(screen.getByText('Filters'))
  fireEvent.change(slider('Maximum distance in miles'), { target: { value: '100' } })
  fireEvent.click(screen.getByText('Save preferences'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click(screen.getByText('Filters'))
  expect(slider('Maximum distance in miles').value).toBe('100')
  fireEvent.click(screen.getByText('Reset'))
  expect(slider('Maximum distance in miles').value).toBe('15')
  fireEvent.click(screen.getByRole('button', { name: 'Close filters' }))
  fireEvent.click(screen.getByText('Filters'))
  expect(slider('Maximum distance in miles').value).toBe('100')
  view.unmount(); render(<Harness />); fireEvent.click(screen.getByText('Filters'))
  expect(slider('Maximum distance in miles').value).toBe('15')
  expect(storage).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
})
it('Friends explicitly blocks Save without a backend contract and has no profile editor', () => {
  render(<Harness mode="Friends" />); fireEvent.click(screen.getByText('Filters'))
  expect((screen.getByText('Save preferences') as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/Search filters are not connected yet/)).toBeTruthy()
  expect(slider('Minimum age').value).toBe('18')
  expect(screen.queryByRole('spinbutton')).toBeNull(); expect(screen.queryByRole('combobox')).toBeNull()
})
it('guards duplicate saves, keeps the dialog pending, and preserves the draft after failure', async () => {
  let reject!: (reason: Error) => void
  const save = vi.fn((_value: MatchFilters) => new Promise<void>((_resolve, fail) => { reject = fail }))
  render(<MatchFilterSheet mode="Dating" value={filterDefaults.Dating} close={vi.fn()} save={save} />)
  fireEvent.change(slider('Maximum distance in miles'), { target: { value: '1' } })
  const form = screen.getByText('Save preferences').closest('form')!
  fireEvent.submit(form); fireEvent.submit(form)
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith({ distance: 1, lower: 23, upper: 30 })
  expect((screen.getByRole('button', { name: 'Close filters' }) as HTMLButtonElement).disabled).toBe(true)
  reject(new Error('unavailable'))
  await screen.findByRole('alert')
  expect(slider('Maximum distance in miles').value).toBe('1')
  expect(screen.queryByText('Saving…')).toBeNull()
})
it('a rejected combined Dating action keeps both drafts and never closes', async () => {
  const close = vi.fn(), saveDating = vi.fn().mockRejectedValue(new Error('unavailable'))
  render(<MatchFilterSheet mode="Dating" value={filterDefaults.Dating} close={close} saveDating={saveDating} />)
  fireEvent.change(screen.getByLabelText('My sexuality'), { target: { value: 'Other' } })
  fireEvent.click(screen.getByLabelText('Show my sexuality on my dating profile'))
  fireEvent.change(slider('Maximum distance in miles'), { target: { value: '60' } })
  fireEvent.click(screen.getByText('Save preferences'))
  await screen.findByRole('alert')
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByLabelText('My sexuality')).toHaveProperty('value', 'Other')
  expect(screen.getByLabelText('Show my sexuality on my dating profile')).toHaveProperty('checked', true)
  expect(saveDating).toHaveBeenCalledWith({ distance: 60, lower: 23, upper: 30 }, expect.objectContaining({ sexuality: 'Other', showSexuality: true }))
})
