import { canonicalInterest, interestAliases } from '../../shared/interests.js'
import { EventSchema } from '../../shared/events.js'
import { EVENT_PICKS_LIMIT, EventPicksResponseSchema, EventPoolSchema } from '../../shared/event-picks.js'
import type { EventPickReason, EventPicksResponse, EventPool, EventPoolEvent } from '../../shared/event-picks.js'

// Content-based ranking: how well an event fits the two people's interests,
// how close it is to both search areas, and how soon it starts.
export const eventPicksVersion = 'event-picks-v1'
export const eventPicksWeights = Object.freeze({ relevance: 0.6, proximity: 0.25, soonness: 0.15 })
const horizonHours = 14 * 24

// Words that suggest an event suits a built-in interest. Custom interests match
// their own words.
const interestKeywords: Readonly<Record<string, readonly string[]>> = Object.freeze({
  coffee: ['coffee', 'cafe', 'café', 'espresso', 'latte'],
  art: ['art', 'arts', 'gallery', 'exhibit', 'exhibition', 'museum', 'painting', 'drawing', 'craft', 'crafts', 'ceramics', 'pottery', 'sculpture', 'theatre', 'theater'],
  music: ['music', 'musical', 'musician', 'musicians', 'concert', 'band', 'bands', 'jazz', 'choir', 'orchestra', 'open mic', 'a cappella', 'dj', 'symphony', 'recital', 'karaoke'],
  outdoors: ['outdoor', 'outdoors', 'hike', 'hiking', 'trail', 'park', 'beach', 'nature', 'garden', 'kayak', 'kayaking', 'camping', 'picnic'],
  food: ['food', 'dinner', 'lunch', 'brunch', 'breakfast', 'tasting', 'cooking', 'baking', 'pizza', 'snacks', 'potluck', 'picnic', 'dining'],
  gaming: ['gaming', 'esports', 'board game', 'board games', 'trivia', 'video game', 'video games'],
  photography: ['photo', 'photos', 'photography', 'photographer', 'photographers', 'camera'],
  movies: ['movie', 'movies', 'film', 'films', 'screening', 'cinema'],
  fitness: ['fitness', 'yoga', 'running', 'workout', 'gym', 'dance', 'zumba', 'pilates', 'cycling'],
  study: ['study', 'workshop', 'workshops', 'lecture', 'seminar', 'tutoring', 'library'],
  sports: ['sports', 'sport', 'basketball', 'soccer', 'football', 'baseball', 'volleyball', 'tennis', 'hockey', 'lacrosse', 'athletics'],
})

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const searchable = (value: string) => value.normalize('NFC').toLowerCase().replace(/[-‐‑–—]/gu, ' ').replace(/\s+/gu, ' ').trim()

export function interestTerms(label: string): string[] {
  const canonical = canonicalInterest(label)
  if (!canonical) return []
  const terms = [label, canonical, ...Object.keys(interestAliases).filter(alias => interestAliases[alias] === canonical), ...(interestKeywords[canonical] ?? [])].map(searchable)
  // A plural custom interest ("Picnics") should also match its singular.
  return [...new Set(terms.flatMap(term => term.length > 3 && term.endsWith('s') ? [term, term.slice(0, -1)] : [term]))]
}

export function interestMatches(label: string, text: string) {
  // These phrases use a topic word with a different meaning. Other topic
  // evidence (e.g. an Arts category) can still match independently.
  const exclusions: Record<string, RegExp> = {
    art: /\b(?:latte art|state of the art|martial arts?)\b/gu,
    music: /\b(?:resistance|exercise) bands?\b/gu,
    movies: /\bfilm photography\b/gu,
  }
  const exclusion = exclusions[canonicalInterest(label)]
  const haystack = exclusion ? searchable(text).replace(exclusion, ' ') : searchable(text)
  return interestTerms(label).some(term => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, 'u').test(haystack))
}

function relevance(event: EventPoolEvent, viewer: readonly string[], peer: readonly string[]): { score: number; reason: EventPickReason } | null {
  const text = [event.category, event.title, event.description].filter(Boolean).join(' \n ')
  const viewerHits = viewer.filter(label => interestMatches(label, text))
  const peerHits = peer.filter(label => interestMatches(label, text))
  const peerByTopic = new Map(peer.map(label => [canonicalInterest(label), label]))
  const shared = viewerHits.find(label => peerByTopic.has(canonicalInterest(label)))
  if (shared) return { score: 1, reason: { kind: 'shared', viewerInterest: shared, peerInterest: peerByTopic.get(canonicalInterest(shared)) ?? shared } }
  if (viewerHits.length && peerHits.length) return { score: 0.6, reason: { kind: 'both', viewerInterest: viewerHits[0], peerInterest: peerHits[0] } }
  if (viewerHits.length) return { score: 0.35, reason: { kind: 'viewer', viewerInterest: viewerHits[0], peerInterest: null } }
  if (peerHits.length) return { score: 0.35, reason: { kind: 'peer', viewerInterest: null, peerInterest: peerHits[0] } }
  return null
}

// 1 at the centre of a search area, 0 at its edge. Unknown on both sides is neutral.
export function proximityScore(event: Pick<EventPoolEvent, 'viewerDistanceMiles' | 'peerDistanceMiles'>, pool: Pick<EventPool, 'viewerRadiusMiles' | 'peerRadiusMiles'>) {
  const closeness = [[event.viewerDistanceMiles, pool.viewerRadiusMiles], [event.peerDistanceMiles, pool.peerRadiusMiles]]
    .flatMap(([distance, radius]) => distance === null || !radius ? [] : [Math.max(0, 1 - distance / radius)])
  if (!closeness.length) return 0.5
  // Geometric mean, so an event at the edge of either person's area scores 0.
  return closeness.reduce((product, value) => product * value, 1) ** (1 / closeness.length)
}

export function soonnessScore(startsAt: string | null, now: Date) {
  const start = Date.parse(startsAt ?? '')
  if (!Number.isFinite(start)) return null
  const hours = (start - now.getTime()) / 3_600_000
  if (hours < 0 || hours > horizonHours) return null
  return 1 - hours / horizonHours
}

export function rankEventPicks(input: unknown, now = new Date()): EventPicksResponse {
  const pool = EventPoolSchema.parse(input)
  const scored = pool.events.flatMap(event => {
    const fit = relevance(event, pool.viewerInterests, pool.peerInterests)
    const soon = soonnessScore(event.starts_at, now)
    if (!fit || soon === null) return []
    const score = eventPicksWeights.relevance * fit.score + eventPicksWeights.proximity * proximityScore(event, pool) + eventPicksWeights.soonness * soon
    return [{ event, reason: fit.reason, score }]
  }).sort((a, b) => b.score - a.score || Date.parse(a.event.starts_at ?? '') - Date.parse(b.event.starts_at ?? '') || a.event.id.localeCompare(b.event.id))

  // Variety: one pick per category and no repeated titles.
  const categories = new Set<string>(), titles = new Set<string>(), picks: EventPicksResponse['picks'] = []
  for (const { event, reason } of scored) {
    if (picks.length === EVENT_PICKS_LIMIT) break
    const category = event.category ? searchable(event.category) : null, title = searchable(event.title)
    if ((category && categories.has(category)) || titles.has(title)) continue
    if (category) categories.add(category)
    titles.add(title)
    // Distances describe both people's private areas; parsing drops them.
    picks.push({ event: EventSchema.parse({ ...event, distance_miles: null }), reason })
  }
  return EventPicksResponseSchema.parse({ picks, algorithmVersion: eventPicksVersion })
}
