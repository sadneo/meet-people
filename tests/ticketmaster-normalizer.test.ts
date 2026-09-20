import { describe, expect, it } from 'vitest'
import { normalizeTicketmasterEvent } from '../supabase/functions/_shared/normalize-ticketmaster.ts'

const syncedAt = new Date('2026-09-19T12:00:00.000Z')

const completeEvent = {
  id: 'ticketmaster-event-1',
  name: 'Sample Concert',
  description: 'A concert description.',
  url: 'https://www.ticketmaster.com/event/ticketmaster-event-1',
  dates: {
    start: { dateTime: '2026-09-20T23:00:00Z' },
    end: { dateTime: '2026-09-21T01:00:00Z' },
    status: { code: 'onsale' },
  },
  classifications: [
    { primary: true, segment: { name: 'Music' } },
    { segment: { name: 'Miscellaneous' } },
  ],
  images: [
    { url: 'https://images.example.test/fallback.jpg', ratio: '16_9', width: 2400, height: 1350, fallback: true },
    { url: 'https://images.example.test/small.jpg', ratio: '16_9', width: 640, height: 360, fallback: false },
    { url: 'https://images.example.test/large.jpg', ratio: '16_9', width: 1600, height: 900, fallback: false },
  ],
  _embedded: {
    venues: [{
      name: 'Example Hall',
      address: { line1: '123 Example Street' },
      city: { name: 'New York' },
      state: { stateCode: 'NY', name: 'New York' },
      postalCode: '10001',
      location: { latitude: '40.7505', longitude: '-73.9934' },
    }],
  },
}

describe('normalizeTicketmasterEvent', () => {
  it('normalizes the fields needed by listings', () => {
    const result = normalizeTicketmasterEvent(completeEvent, syncedAt)

    expect(result).toEqual({
      success: true,
      listing: {
        listing_type: 'event',
        title: 'Sample Concert',
        description: 'A concert description.',
        category: 'Music',
        starts_at: '2026-09-20T23:00:00.000Z',
        ends_at: '2026-09-21T01:00:00.000Z',
        location_name: 'Example Hall',
        address: '123 Example Street',
        city: 'New York',
        region: 'NY',
        postal_code: '10001',
        latitude: 40.7505,
        longitude: -73.9934,
        image_url: 'https://images.example.test/large.jpg',
        status: 'active',
        source: 'ticketmaster',
        external_id: 'ticketmaster-event-1',
        source_url: 'https://www.ticketmaster.com/event/ticketmaster-event-1',
        last_synced_at: '2026-09-19T12:00:00.000Z',
      },
    })
  })

  it('uses event info when description is absent and maps source status', () => {
    const result = normalizeTicketmasterEvent({
      id: 'ticketmaster-event-2',
      name: 'Postponed Event',
      info: 'Use this description instead.',
      dates: { status: { code: 'postponed' } },
    }, syncedAt)

    expect(result).toMatchObject({
      success: true,
      listing: {
        description: 'Use this description instead.',
        status: 'postponed',
        starts_at: null,
        ends_at: null,
      },
    })
  })

  it('keeps Ticketmaster offsale status instead of translating it', () => {
    const result = normalizeTicketmasterEvent({
      id: 'ticketmaster-event-4',
      name: 'Offsale Event',
      dates: { status: { code: 'offsale' } },
    }, syncedAt)

    expect(result).toMatchObject({
      success: true,
      listing: { status: 'offsale' },
    })
  })

  it('returns no coordinates when Ticketmaster provides an incomplete or invalid pair', () => {
    const result = normalizeTicketmasterEvent({
      id: 'ticketmaster-event-3',
      name: 'Coordinate Test',
      _embedded: { venues: [{ location: { latitude: '91', longitude: '-73.9' } }] },
    }, syncedAt)

    expect(result).toMatchObject({
      success: true,
      listing: { latitude: null, longitude: null },
    })
  })

  it('does not return rows that cannot satisfy the source identity requirements', () => {
    expect(normalizeTicketmasterEvent({ name: 'Missing ID' }, syncedAt)).toEqual({
      success: false,
      reason: 'missing_event_id',
    })
    expect(normalizeTicketmasterEvent({ id: 'missing-name' }, syncedAt)).toEqual({
      success: false,
      reason: 'missing_event_name',
    })
  })
})
