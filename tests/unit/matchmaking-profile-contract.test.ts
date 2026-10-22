import { describe, expect, it } from 'vitest'
import { MatchingProfileSchema } from '../../shared/matchmaking'
const base = { username: 'student', display_name: 'Student', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [], availability: [] }
describe('SQL-compatible profile boundaries', () => {
  it('rejects malformed ports and accepts case-insensitive HTTPS', () => {
    expect(MatchingProfileSchema.safeParse({ ...base, avatar_url: 'https://example.123/avatar' }).success).toBe(false)
    expect(MatchingProfileSchema.safeParse({ ...base, avatar_url: 'https://example.test:invalid/avatar' }).success).toBe(false)
    expect(MatchingProfileSchema.safeParse({ ...base, avatar_url: 'HTTPS://example.test/avatar' }).success).toBe(true)
    expect(MatchingProfileSchema.safeParse({ ...base, avatar_url: 'https://example.test:65536/avatar' }).success).toBe(false)
    expect(MatchingProfileSchema.safeParse({ ...base, avatar_url: 'https://user:pass@example.test/avatar' }).success).toBe(false)
  })
  it('uses Unicode codepoint limits and preserves same-day midnight windows', () => {
    expect(MatchingProfileSchema.safeParse({ ...base, display_name: '😀'.repeat(121) }).success).toBe(false)
    expect(MatchingProfileSchema.safeParse({ ...base, display_name: '😀'.repeat(120), availability: [{ dow: 6, start_time: '21:00:00', end_time: '24:00:00' }] }).success).toBe(true)
  })
})
