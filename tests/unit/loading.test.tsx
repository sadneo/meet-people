import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BootLoading } from '../../src/ui/loading/BootLoading'
import { PageSkeleton, type SkeletonView } from '../../src/ui/loading/PageSkeleton'
import { MediaImage } from '../../src/ui/loading/MediaImage'
import { ResourceState } from '../../src/ui/common'
import { mobileEntry } from '../../vite.mobile.config'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shares the reviewed startup markup with the mobile-only pre-JavaScript fallback', () => {
  const { container } = render(<BootLoading />)
  expect(screen.getByLabelText('Pebble loading screen').getAttribute('aria-busy')).toBe('true')
  expect(screen.getByRole('status').textContent).toBe('Loading your little world')
  expect(container.querySelector('.boot-recovery a')?.getAttribute('href')).toBe('')
  expect(container.querySelector('button')).toBeNull()
  expect(container.innerHTML).not.toContain('chatgpt.site')
  const transform = (mobileEntry.transformIndexHtml as { handler: (html: string) => string }).handler
  const html = '<html><head></head><body><div id="root"></div><script src="/src/main.tsx"></script></body></html>'
  expect(html).not.toContain('pebble-boot')
  const mobile = transform(html)
  expect(mobile).toContain('/src/mobile/main.tsx')
  expect(mobile).toContain('Loading your little world')
  expect(mobile).toContain('data-pebble-boot')
  expect(mobile).not.toContain('base64')
})

it.each<SkeletonView>(['events', 'event', 'discover', 'inbox', 'chat', 'profile', 'settings', 'list', 'garden'])('%s skeleton exposes one status, not fake content or interactive controls', view => {
  const { container } = render(<PageSkeleton view={view} label="Loading this view"/>)
  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  expect(container.querySelectorAll('button,input,a,canvas,img')).toHaveLength(0)
  expect(container.querySelector('[aria-hidden=true]')).not.toBeNull()
})

it('errors take precedence over skeletons and still expose the existing explicit retry', () => {
  const reload = vi.fn()
  render(<ResourceState loading error="Read failed" reload={reload} skeleton={<PageSkeleton view="events"/>}/>)
  expect(screen.getByRole('alert').textContent).toBe('Read failed')
  expect(screen.queryByRole('status')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved data' }))
  expect(reload).toHaveBeenCalledOnce()
})

it('does not insert a skeleton when cached display data is not initially pending', () => {
  const { container } = render(<ResourceState loading={false} error="" reload={() => {}} skeleton={<PageSkeleton view="inbox"/>}/>)
  expect(container.querySelector('[data-skeleton]')).toBeNull()
})

it('image readiness waits for decode; a stale decode cannot reveal the next source', async () => {
  let release!: () => void
  const decode = new Promise<void>(resolve => { release = resolve })
  const { rerender } = render(<MediaImage src="/one.png" alt="Preview"/>)
  const first = screen.getByRole('img')
  Object.defineProperty(first, 'naturalWidth', { value: 100 })
  Object.defineProperty(first, 'decode', { value: () => decode })
  fireEvent.load(first)
  expect(first.getAttribute('data-media-pending')).toBe('true')
  rerender(<MediaImage src="/two.png" alt="Preview"/>)
  await act(async () => { release(); await decode })
  const second = screen.getByRole('img')
  expect(second).not.toBe(first)
  expect(second.getAttribute('data-media-pending')).toBe('true')
  Object.defineProperty(second, 'naturalWidth', { value: 100 })
  Object.defineProperty(second, 'decode', { value: async () => {} })
  fireEvent.load(second)
  await waitFor(() => expect(second.hasAttribute('data-media-pending')).toBe(false))
})

it('image errors stop the pending state and use the configured fallback without retry loops', async () => {
  render(<MediaImage src="/missing.png" fallback="/fallback.svg" alt="Preview"/>)
  fireEvent.error(screen.getByRole('img'))
  const image = screen.getByRole('img')
  expect(image.getAttribute('src')).toBe('/fallback.svg')
  expect(image.hasAttribute('data-media-pending')).toBe(false)
  fireEvent.error(image)
  expect(image.getAttribute('src')).toBe('/fallback.svg')
})
