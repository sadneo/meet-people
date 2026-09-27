import { describe, expect, it } from 'vitest'

import { normalizeTicketmasterEvent } from '../supabase/functions/_shared/normalize-ticketmaster.ts'

describe('Ticketmaster ingestion records', () => {
  it('keeps the same source and external ID when an event is refreshed', () => {
    const first = normalizeTicketmasterEvent({
      id: 'ticketmaster-123',
      name: 'Original title',
    }, new Date('2026-09-19T12:00:00Z'))
    const refresh = normalizeTicketmasterEvent({
      id: 'ticketmaster-123',
      name: 'Updated title',
    }, new Date('2026-09-20T12:00:00Z'))

    expect(first).toMatchObject({
      success: true,
      listing: { source: 'ticketmaster', external_id: 'ticketmaster-123' },
    })
    expect(refresh).toMatchObject({
      success: true,
      listing: { source: 'ticketmaster', external_id: 'ticketmaster-123' },
    })
  })
})
