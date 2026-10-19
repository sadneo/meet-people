import { describe, expect, it } from 'vitest'
import { eventDetailPath, isEventDetailPath } from '../src/features/events/routes'

describe('event routes for host app integration', () => {
  it('recognizes direct event detail URLs without matching other app screens', () => {
    const path = eventDetailPath('e0000000-0000-4000-8000-000000000001')
    expect(isEventDetailPath(path)).toBe(true)
    for (const other of ['/', '/events', '/free-time', '/events/example/company']) expect(isEventDetailPath(other)).toBe(false)
  })
})
