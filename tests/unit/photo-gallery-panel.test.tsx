import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PhotoGalleryPanel } from '../../src/ui/PhotoGallery'
import { ProfilePhotoError } from '../../src/features/account/profile-photo-client'

const mocks = vi.hoisted(() => ({
  append: vi.fn(), editGallery: vi.fn(), saveCaption: vi.fn(),
  state: { revision: 3, count: 3 } as { revision: number; count: number },
}))
vi.mock('../../src/ui/current', () => ({ useCurrent: () => ({ session: { user: { id: 'u1' }, access_token: 't' } }) }))
vi.mock('../../src/features/account/usePhotoGallery', () => ({
  usePhotoGallery: () => ({
    client: { append: mocks.append, editGallery: mocks.editGallery, saveCaption: mocks.saveCaption },
    query: { data: mocks.state, isPending: false, isError: false, isFetching: false, isSuccess: true, refetch: vi.fn() },
  }),
  usePhotoSlot: () => ({ data: { url: 'blob:slot' }, isError: false }),
  usePhotoCaptions: (_owner: string, revision: number) => ({ data: { revision, captions: [null, 'old', null] }, isPending: false, isError: false }),
}))

beforeEach(() => {
  mocks.append.mockReset(); mocks.editGallery.mockReset(); mocks.saveCaption.mockReset()
  mocks.state = { revision: 3, count: 3 }
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  URL.createObjectURL = () => 'blob:new'
  URL.revokeObjectURL = () => {}
})
// Unmounting an open sheet leaves an exit-animation copy and a pending history pop; let both settle.
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 250)) })

function panel() {
  render(<QueryClientProvider client={new QueryClient()}><PhotoGalleryPanel/></QueryClientProvider>)
}
function pick() {
  fireEvent.change(screen.getByLabelText('Choose a gallery photo'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
}

it.each([
  [400, 'That file isn’t a photo we can use.'],
  [429, 'Photo limit reached. Try again later.'],
])('treats a %i upload rejection as definite and keeps Add photo available', async (status, message) => {
  mocks.append.mockRejectedValue(new ProfilePhotoError(status, 'server text'))
  panel()
  pick()
  expect(await screen.findByText(message)).toBeTruthy()
  expect(screen.queryByAltText('New photo preview')).toBeNull()
  expect(screen.queryByText('Reload photos')).toBeNull()
  expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy()
})

it('keeps the reload path for an uncertain upload failure', async () => {
  mocks.append.mockRejectedValue(new ProfilePhotoError(503, 'Photo storage could not be confirmed. Reload before retrying.'))
  panel()
  pick()
  expect(await screen.findByRole('button', { name: 'Reload photos' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull()
})

it('saves a typed caption before making the photo the profile photo', async () => {
  mocks.saveCaption.mockResolvedValue({ revision: 3, captions: [null, 'new', null] })
  mocks.editGallery.mockRejectedValue(new ProfilePhotoError(503, 'stop'))
  panel()
  fireEvent.click(screen.getByRole('button', { name: 'Preview photo 2' }))
  fireEvent.change(screen.getByLabelText(/Caption/), { target: { value: 'new' } })
  fireEvent.click(screen.getByRole('button', { name: 'Make profile photo' }))
  await waitFor(() => expect(mocks.editGallery).toHaveBeenCalled())
  expect(mocks.saveCaption).toHaveBeenCalledWith({ expectedRevision: 3, position: 2, caption: 'new' })
})

it('saves a typed caption when the sheet is closed', async () => {
  mocks.saveCaption.mockResolvedValue({ revision: 3, captions: [null, 'new', null] })
  panel()
  fireEvent.click(screen.getByRole('button', { name: 'Preview photo 2' }))
  fireEvent.change(screen.getByLabelText(/Caption/), { target: { value: 'new' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(mocks.saveCaption).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Close' })).toBeNull())
})

it('closes the preview sheet on browser Back and stays on the page', async () => {
  vi.useFakeTimers()
  const back = vi.spyOn(window.history, 'back')
  panel()
  fireEvent.click(screen.getByRole('button', { name: 'Preview photo 1' }))
  await act(async () => { vi.advanceTimersByTime(5) })
  expect(window.history.state?.photoPreview).toBe(true)
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  await act(async () => { window.dispatchEvent(new PopStateEvent('popstate')) })
  expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  expect(back).not.toHaveBeenCalled()
  vi.useRealTimers()
})
