import { expect, it, vi } from 'vitest'
import { safeImage } from '../src/features/events/client'

vi.mock('../src/supabase', () => ({ supabase: null }))
const placeholder = '/images/event-placeholder.svg'
it('uses a neutral local placeholder for missing or invalid event image URLs', () => {
  for (const value of [null, '', 'not a URL', '/prototype/music.jpg', '//example.test/photo.jpg', 'https://', 'http://', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>']) {
    expect(safeImage(value)).toBe(placeholder)
  }
})
it('keeps valid absolute HTTP/HTTPS event image URLs unchanged', () => {
  for (const value of ['https://example.test/photo.jpg?size=large', 'http://example.test/photo.png', 'HTTPS://example.test/photo.webp']) {
    expect(safeImage(value)).toBe(value)
  }
})
