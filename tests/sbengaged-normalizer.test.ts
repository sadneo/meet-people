import { describe, expect, it } from 'vitest'
import { extractSbEngagedDetailImage } from '../supabase/functions/_shared/extract-sbengaged-detail.ts'
import { normalizeSbEngagedEvent } from '../supabase/functions/_shared/normalize-sbengaged.ts'
import { parseSbEngagedICal } from '../supabase/functions/_shared/parse-sbengaged-ical.ts'

const syncedAt = new Date('2026-09-20T12:00:00.000Z')

describe('SB Engaged iCal normalization', () => {
  it('parses a public event and maps it to a listing', () => {
    const [event] = parseSbEngagedICal(`BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY;ENCODING=QUOTED-PRINTABLE:Campus=20Mixer
DTSTART:20260920T180000Z
DTEND:20260920T200000Z
LOCATION:Student Activities Center, United States
CATEGORIES;X-CG-CATEGORY=event_type:Social
URL:https://sbengaged.stonybrook.edu/rsvp?id=12345
DESCRIPTION:Meet new people\\n---\\nEvent Details: https://sbengaged.stonybrook.edu/rsvp?id=12345
END:VEVENT
END:VCALENDAR`)

    expect(normalizeSbEngagedEvent(event, syncedAt, 'https://images.example.test/event.png')).toEqual({
      success: true,
      listing: {
        listing_type: 'event', title: 'Campus Mixer', description: 'Meet new people', category: 'Social',
        starts_at: '2026-09-20T18:00:00.000Z', ends_at: '2026-09-20T20:00:00.000Z',
        location_name: 'Student Activities Center, United States', address: null, city: null, region: null,
        postal_code: null, latitude: null, longitude: null, image_url: 'https://images.example.test/event.png',
        status: 'active', source: 'sbengaged', external_id: '12345',
        source_url: 'https://sbengaged.stonybrook.edu/rsvp?id=12345', last_synced_at: syncedAt.toISOString(),
      },
    })
  })

  it('unfolds iCal lines and suppresses private locations', () => {
    const [event] = parseSbEngagedICal(`BEGIN:VEVENT
SUMMARY:Workshop
DTSTART:20260920T180000Z
DESCRIPTION:This is a long descrip
 tion
LOCATION:Private Location (sign in to display)
URL:https://sbengaged.stonybrook.edu/rsvp?id=23
END:VEVENT`)
    const result = normalizeSbEngagedEvent(event, syncedAt)
    expect(result).toMatchObject({ success: true, listing: { description: 'This is a long description', location_name: null } })
  })

  it('suppresses registration-only location placeholders', () => {
    const result = normalizeSbEngagedEvent({
      summary: 'Location later', startsAt: '2026-09-20T18:00:00.000Z',
      location: 'Register to receive location details!, United States',
      url: 'https://sbengaged.stonybrook.edu/rsvp?id=24',
    }, syncedAt)
    expect(result).toMatchObject({ success: true, listing: { location_name: null } })
  })

  it('rejects events that cannot form a stable, scheduled listing', () => {
    expect(normalizeSbEngagedEvent({ summary: 'No ID', startsAt: '2026-09-20T18:00:00.000Z' }, syncedAt)).toEqual({ success: false, reason: 'missing_event_id' })
    expect(normalizeSbEngagedEvent({ url: 'https://sbengaged.stonybrook.edu/rsvp?id=4', startsAt: '2026-09-20T18:00:00.000Z' }, syncedAt)).toEqual({ success: false, reason: 'missing_event_name' })
    expect(normalizeSbEngagedEvent({ summary: 'No time', url: 'https://sbengaged.stonybrook.edu/rsvp?id=4' }, syncedAt)).toEqual({ success: false, reason: 'missing_start_time' })
  })
})

describe('SB Engaged detail enrichment', () => {
  it('prefers a JSON-LD event image and falls back to Open Graph', () => {
    expect(extractSbEngagedDetailImage('<script type="application/ld+json">{"@type":"Event","image":["https://images.example.test/ld.png"]}</script>')).toBe('https://images.example.test/ld.png')
    expect(extractSbEngagedDetailImage('<meta property="og:image" content="https://images.example.test/og.png">')).toBe('https://images.example.test/og.png')
  })

  it('does not expose invalid image URLs', () => {
    expect(extractSbEngagedDetailImage('<meta property="og:image" content="javascript:alert(1)">')).toBeNull()
  })
})
