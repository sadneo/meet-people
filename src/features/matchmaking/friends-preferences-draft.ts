import type { SearchLocationReceipt } from '../../../shared/search-locations'
import { draftLocationReference } from './draft-location-reference'
import { SaveFriendsSearchPreferencesSchema, type FriendsSearchPreferences } from '../../../shared/friends-search-preferences'
import type { MatchFilters } from './MatchFilterSheet'
import type { SearchOptions } from './search-preferences'

export function friendsPreferenceDraft(value: FriendsSearchPreferences) {
  const p = value.preferences
  return { filters: { distance: p?.radiusMiles ?? 15, lower: p?.ageMin ?? 18, upper: p?.ageMax ?? 35 },
    options: { source: p?.searchArea.source ?? 'home', area: p?.searchArea.source === 'temporary' ? p.searchArea.areaLabel : '', goals: [...(p?.goals ?? [])] } satisfies SearchOptions }
}
export function friendsDraftWrite(baseline: FriendsSearchPreferences, filters: MatchFilters, options: SearchOptions, clearReference = false, resolved: SearchLocationReceipt | null = null, home: string | null = null) {
  const area = baseline.preferences?.searchArea
  const sameArea = area && area.source === options.source && (area.source !== 'temporary' || area.areaLabel === options.area)
  const reference = draftLocationReference(resolved, 'friends', options, home) ?? (area && sameArea && !clearReference ? area.resolvedLocationRef : null)
  return SaveFriendsSearchPreferencesSchema.parse({ expectedRevision: baseline.revision,
    preferences: { ageMin: filters.lower, ageMax: filters.upper, radiusMiles: filters.distance, goals: [...options.goals],
      searchArea: options.source === 'temporary' ? { source: 'temporary', areaLabel: options.area, resolvedLocationRef: reference } : { source: 'home', resolvedLocationRef: reference } } })
}
