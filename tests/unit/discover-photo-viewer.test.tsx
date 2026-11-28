import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DiscoverPhotos } from '../../src/ui/PhotoGallery'

vi.mock('../../src/ui/current', () => ({ useCurrent: () => ({ session: { access_token: 't' } }) }))
vi.mock('../../src/features/account/usePhotoGallery', () => ({
  usePhotoGallery: () => ({ query: { data: { revision: 3, count: 3 }, isError: false } }),
  usePhotoSlot: () => ({ data: { url: 'blob:slot' }, isError: false }),
  usePhotoCaptions: () => ({ data: { revision: 3, captions: [null, null, null] } }),
}))
vi.mock('../../src/ui/common', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/ui/common')>(),
  PersonPhoto: () => <img alt="first"/>,
}))

afterEach(cleanup)

function viewer() {
  render(<DiscoverPhotos id="o" name="Hank" revision={3} fallback={null} active/>)
  const el = screen.getByRole('group', { name: 'Hank’s photos' })
  el.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 400, right: 300, bottom: 400, x: 0, y: 0, toJSON() {} })
  el.setPointerCapture = () => {}
  return el
}
const status = () => screen.getByLabelText(/^Photo \d of 3$/).textContent
const ptr = (type: string, x: number, y = 100) =>
  Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1, isPrimary: true })
function tap(el: Element, x: number) {
  fireEvent(el, ptr('pointerdown', x)); fireEvent(el, ptr('pointerup', x + 2))
}

it('tap on right goes next, left goes previous', () => {
  const el = viewer()
  tap(el, 250); expect(status()).toBe('Photo 2 of 3')
  tap(el, 250); expect(status()).toBe('Photo 3 of 3')
  tap(el, 20); expect(status()).toBe('Photo 2 of 3')
})

it('segments jump to a photo', () => {
  viewer()
  fireEvent.click(screen.getByRole('button', { name: 'Show photo 3', hidden: true }))
  expect(status()).toBe('Photo 3 of 3')
})

it('a drag past the tap threshold is not a tap', () => {
  const el = viewer()
  fireEvent(el, ptr('pointerdown', 250)); fireEvent(el, ptr('pointerup', 250, 130))
  expect(status()).toBe('Photo 1 of 3')
})
