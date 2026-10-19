import type { SearchLocationReceipt } from '../../../shared/search-locations'
import { draftLocationReference } from './draft-location-reference'
import { SaveDatingAggregateSchema, validDatingTransition, type DatingAggregate, type SaveDatingAggregate } from '../../../shared/dating'
import { validateDatingPreferences, type DatingPreferenceDraft } from './dating-preferences'
import type { SearchOptions } from './search-preferences'
import type { MatchFilters } from './MatchFilterSheet'

export function datingAggregateDraft(value: DatingAggregate) {
  const p = value.profile, s = value.search
  return {
    profile: { gender: p.gender, sexuality: p.sexuality, intent: p.intent, style: p.style, feet: p.heightInches === null ? '' : String(Math.floor(p.heightInches / 12)), inches: p.heightInches === null ? '' : String(p.heightInches % 12), showGender: p.visibility.gender, showSexuality: p.visibility.sexuality, showHeight: p.visibility.height, clarifiedTargets: [...p.clarifiedTargets] } satisfies DatingPreferenceDraft,
    // For an absent search these are explicitly UNSAVED suggested bounds, never
    // a persisted/default-on snapshot or an implicit write.
    filters: { distance: s?.radiusMiles ?? 15, lower: s?.ageMin ?? 18, upper: s?.ageMax ?? 99 },
    options: { source: s?.searchArea.source ?? 'home', area: s?.searchArea.source === 'temporary' ? s.searchArea.areaLabel : '', goals: [] } satisfies SearchOptions,
  }
}
export function datingDraftWrite(baseline: DatingAggregate, filters: MatchFilters, draft: DatingPreferenceDraft, options: SearchOptions, homeChanged = false, resolved: SearchLocationReceipt | null = null, home: string | null = null): SaveDatingAggregate {
  if (baseline.profile.enabled) throw new Error('Saved enabled consent is read-only in this draft editor; it will not be changed.')
  const issue = validateDatingPreferences(draft, datingAggregateDraft(baseline).profile)
  if (issue) throw new Error(issue)
  const area = baseline.search?.searchArea
  const sameArea = area?.source === options.source && (area.source !== 'temporary' || area.areaLabel === options.area)
  const reference = draftLocationReference(resolved, 'dating', options, home) ?? (area && sameArea && baseline.eligibility.locationResolved && !(options.source === 'home' && homeChanged) ? area.resolvedLocationRef : null)
  const profile = { gender: draft.gender, sexuality: draft.sexuality, intent: draft.intent, style: draft.style, heightInches: draft.feet === '' && draft.inches === '' ? null : Number(draft.feet) * 12 + Number(draft.inches), visibility: { gender: draft.showGender, sexuality: draft.showSexuality, height: draft.showHeight }, clarifiedTargets: [...draft.clarifiedTargets], enabled: false }
  const value = SaveDatingAggregateSchema.parse({ expectedProfileRevision: baseline.profileRevision, expectedSearchRevision: baseline.searchRevision, profile, search: { ageMin: filters.lower, ageMax: filters.upper, radiusMiles: filters.distance, searchArea: options.source === 'temporary' ? { source: 'temporary', areaLabel: options.area, resolvedLocationRef: reference } : { source: 'home', resolvedLocationRef: reference } } })
  if (!validDatingTransition(baseline.profile, value.profile)) throw new Error('Clear matching clarification and save this disabled identity draft first; then reopen to confirm new targets.')
  return value
}
