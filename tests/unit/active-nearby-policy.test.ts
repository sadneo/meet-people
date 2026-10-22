import { expect, it } from 'vitest'
import { evaluateActiveNearby, rankActiveNearby, greatCircleMiles, earthRadiusMiles, type ActivePerson, type ActiveContext } from '../../shared/active-nearby-policy'

const me = 'a0000000-0000-4000-8000-000000000001', them = 'a0000000-0000-4000-8000-000000000002', third = 'a0000000-0000-4000-8000-000000000003'
const ref = 'b0000000-0000-4000-8000-000000000001', otherRef = 'b0000000-0000-4000-8000-000000000002'
const window = { dow: 6, start_time: '21:15:30', end_time: '24:00:00' }
function person(id = me, locationRef = ref): ActivePerson {
  return { id, authenticated: true, eligible: true, activeConsent: true, globalDiscovery: true, friendsDiscovery: true, birthdate: '2000-10-19', homeAreaLabel: 'Synthetic home', interests: [' Board games\nstrategy '], availability: [window], friendScore: null, preferences: { ageMin: 18, ageMax: 99, radiusMiles: 100, goals: ['Custom goal'], searchArea: { source: 'home', resolvedLocationRef: locationRef } } }
}
function context(): ActiveContext {
  return { actorId: me, asOfDate: '2026-10-19', blocks: [], locations: [
    { id: ref, ownerId: me, source: 'home', areaLabel: 'Synthetic home', latitude: 0, longitude: 0, usable: true },
    { id: otherRef, ownerId: them, source: 'home', areaLabel: 'Synthetic home', latitude: 0, longitude: 0.001, usable: true },
  ] }
}
it('allows zero shared interests and zero weekly overlap in active; leaves original labels/windows intact', () => {
  const a = person(), b = { ...person(them, otherRef), interests: ['Different custom label'], availability: [{ dow: 1, start_time: '09:00:00', end_time: '10:00:00' }] }
  const before = structuredClone({ a, b })
  expect(evaluateActiveNearby(a, b, context())).toMatchObject({ id: them, sharedInterestCount: 0, overlapSeconds: 0 })
  expect({ a, b }).toEqual(before)
  const fit = evaluateActiveNearby(a, { ...b, interests: ['board games\nstrategy'], availability: [window] }, context())!
  expect(fit.sharedInterestCount).toBe(1)
  expect(fit.overlapSeconds).toBe(9870)
})
it('fails closed on auth, either-direction blocks, consent, discovery, eligibility or missing evidence', () => {
  const a = person(), b = person(them, otherRef)
  for (const key of ['authenticated', 'eligible', 'activeConsent', 'globalDiscovery', 'friendsDiscovery']) {
    expect(evaluateActiveNearby({ ...a, [key]: false }, b, context())).toBeNull()
    expect(evaluateActiveNearby(a, { ...b, [key]: false }, context())).toBeNull()
  }
  for (const blocks of [null, [{ blockerId: me, blockedId: them }], [{ blockerId: them, blockedId: me }]]) expect(evaluateActiveNearby(a, b, { ...context(), blocks })).toBeNull()
  for (const actorId of [null, them, 'forged']) expect(evaluateActiveNearby(a, b, { ...context(), actorId })).toBeNull()
  expect(evaluateActiveNearby(a, b, { ...context(), locations: [] })).toBeNull()
  expect(evaluateActiveNearby(a, b, { ...context(), asOfDate: 'invalid' })).toBeNull()
  expect(evaluateActiveNearby(a, a, context())).toBeNull()
})
it('enforces reciprocal birthday/age bounds with a supplied calendar clock, including equal ages', () => {
  const a = person(), b = { ...person(them, otherRef), birthdate: '2008-10-19' }
  a.preferences = { ...a.preferences, ageMin: 18, ageMax: 18 }
  expect(evaluateActiveNearby(a, b, context())).not.toBeNull()
  expect(evaluateActiveNearby(a, b, { ...context(), asOfDate: '2026-10-18' })).toBeNull()
  for (const birthdate of ['2027-01-01', '2000-02-30', null, '1926-10-19']) expect(evaluateActiveNearby(person(), { ...b, birthdate }, context())).toBeNull()
  expect(evaluateActiveNearby(person(), { ...b, preferences: { ...b.preferences, ageMax: 25 } }, context())).toBeNull()
  expect(evaluateActiveNearby(person(), { ...b, preferences: { ...b.preferences, radiusMiles: 0 } }, context())).toBeNull()
  expect(evaluateActiveNearby(person(), { ...b, birthdate: '1927-10-19' }, context())).not.toBeNull()
  expect(evaluateActiveNearby(person(), { ...b, preferences: null }, context())).toBeNull()
  const leap = { ...b, birthdate: '2008-02-29', preferences: { ...b.preferences, ageMin: 18, ageMax: 99 } }
  const exact19 = { ...person(), preferences: { ...person().preferences, ageMin: 19, ageMax: 19 } }
  expect(evaluateActiveNearby(exact19, leap, { ...context(), asOfDate: '2027-02-28' })).toBeNull()
  expect(evaluateActiveNearby(exact19, leap, { ...context(), asOfDate: '2027-03-01' })).not.toBeNull()
})
it('requires owner/source/area-bound usable resolved refs and valid finite coordinates, never guessing from labels', () => {
  const a = person(), b = person(them, otherRef)
  expect(evaluateActiveNearby(a, { ...b, preferences: { ...b.preferences, searchArea: { source: 'home', resolvedLocationRef: null } } }, context())).toBeNull()
  for (const patch of [{ usable: false }, { ownerId: me }, { source: 'temporary' }, { areaLabel: 'Previous home' }, { latitude: NaN }, { latitude: 91 }, { longitude: 181 }, { longitude: Infinity }]) {
    const ctx = context(); ctx.locations![1] = { ...ctx.locations![1], ...patch } as NonNullable<ActiveContext['locations']>[number]
    expect(evaluateActiveNearby(a, b, ctx)).toBeNull()
  }
  const temporary = { ...b, preferences: { ...b.preferences, searchArea: { source: 'temporary' as const, areaLabel: 'Exact area', resolvedLocationRef: otherRef } } }
  const ctx = context(); ctx.locations![1] = { ...ctx.locations![1], source: 'temporary', areaLabel: 'Exact area' }
  expect(evaluateActiveNearby(a, temporary, ctx)).not.toBeNull()
  expect(evaluateActiveNearby(a, { ...temporary, preferences: { ...temporary.preferences, searchArea: { ...temporary.preferences.searchArea, areaLabel: 'Different area' } } }, ctx)).toBeNull()
})
it('handles inclusive reciprocal radius limits, zero coordinates and dateline geometry', () => {
  const a = person(), b = person(them, otherRef), ctx = context()
  a.preferences.radiusMiles = 1; b.preferences.radiusMiles = 1
  ctx.locations![1].longitude = 180 / (Math.PI * earthRadiusMiles)
  expect(evaluateActiveNearby(a, b, ctx)?.distanceMiles).toBeCloseTo(1, 10)
  ctx.locations![1].longitude *= 1.01
  expect(evaluateActiveNearby(a, b, ctx)).toBeNull()
  a.preferences.radiusMiles = 100 // The candidate's smaller bound still applies.
  expect(evaluateActiveNearby(a, b, ctx)).toBeNull()
  expect(evaluateActiveNearby(a, { ...b, friendScore: 1000 }, ctx)).toBeNull()
  expect(greatCircleMiles({ latitude: 0, longitude: 180 }, { latitude: 0, longitude: -180 })).toBeCloseTo(0, 10)
  expect(greatCircleMiles({ latitude: 0 }, { latitude: 0, longitude: 0 })).toBeNull()
})
it('uses cached score/fit as equal-distance tie-breakers, with deterministic UUID final order', () => {
  const a = person(), b = person(them, otherRef), c: ActivePerson = { ...person(third, otherRef), interests: ['Other'], availability: [] }
  const ctx = context(); ctx.locations!.push({ ...ctx.locations![1], id: 'b0000000-0000-4000-8000-000000000003', ownerId: third }); c.preferences.searchArea.resolvedLocationRef = ctx.locations![2].id
  expect(rankActiveNearby(a, [c, b], ctx).map(row => row.id)).toEqual([them, third])
  c.friendScore = 0.9
  expect(rankActiveNearby(a, [b, c], ctx).map(row => row.id)).toEqual([third, them])
  c.friendScore = null; c.interests = [...b.interests]
  expect(rankActiveNearby(a, [c, b], ctx).map(row => row.id)).toEqual([them, third]) // equal interests, different exact overlap
  c.availability = [...b.availability]
  expect(rankActiveNearby(a, [c, b], ctx).map(row => row.id)).toEqual([them, third])
  expect(rankActiveNearby(a, [b, c], ctx)).toEqual(rankActiveNearby(a, [c, b], ctx))
  expect(rankActiveNearby(a, [b, b], ctx)).toEqual([])
  expect(evaluateActiveNearby(a, { ...b, friendScore: NaN }, ctx)?.friendScore).toBeNull()
})
it('prioritizes a nearby zero-fit person over a farther strong-fit person within both explicit radii', () => {
  const a = person(), near = { ...person(them, otherRef), interests: ['Different'], availability: [], friendScore: null }
  const far = person(third, 'b0000000-0000-4000-8000-000000000003'); far.friendScore = 1000
  const ctx = context()
  ctx.locations![1].longitude = 180 / (Math.PI * earthRadiusMiles) // one mile
  ctx.locations!.push({ ...ctx.locations![1], id: far.preferences.searchArea.resolvedLocationRef!, ownerId: third, longitude: 90 * 180 / (Math.PI * earthRadiusMiles) })
  const before = structuredClone({ a, near, far, ctx })
  expect(evaluateActiveNearby(a, near, ctx)).toMatchObject({ sharedInterestCount: 0, overlapSeconds: 0 })
  expect(evaluateActiveNearby(a, far, ctx)).not.toBeNull()
  expect(rankActiveNearby(a, [far, near], ctx).map(row => row.id)).toEqual([them, third])
  expect(rankActiveNearby(a, [near, far], ctx)).toEqual(rankActiveNearby(a, [far, near], ctx))
  expect({ a, near, far, ctx }).toEqual(before)
})
it('isolates unrelated malformed locations in both pair and ranked-batch evaluation', () => {
  const a = person(), b = person(them, otherRef), bad = person(third, 'b0000000-0000-4000-8000-000000000003')
  const ctx = context()
  const broken = { ...ctx.locations![1], id: bad.preferences.searchArea.resolvedLocationRef, ownerId: third, latitude: null }
  const evidence = { ...ctx, locations: [...ctx.locations!, broken, { id: 'not-a-uuid' }, null] }
  expect(evaluateActiveNearby(a, b, evidence)?.id).toBe(them)
  expect(evaluateActiveNearby(a, bad, evidence)).toBeNull()
  expect(rankActiveNearby(a, [bad, b], evidence).map(row => row.id)).toEqual([them])
  // Unrelated duplicate IDs do not make the selected, unique refs ambiguous.
  expect(evaluateActiveNearby(a, b, { ...evidence, locations: [...evidence.locations, broken] })?.id).toBe(them)
})
it('fails closed for selected missing, malformed, identical duplicate and conflicting references', () => {
  const a = person(), b = person(them, otherRef), ctx = context()
  for (const selected of [null, { id: otherRef }, { ...ctx.locations![1], latitude: NaN }]) {
    expect(evaluateActiveNearby(a, b, { ...ctx, locations: [ctx.locations![0], selected] })).toBeNull()
    expect(rankActiveNearby(a, [b], { ...ctx, locations: [ctx.locations![0], selected] })).toEqual([])
  }
  for (const duplicate of [ctx.locations![1], { ...ctx.locations![1], longitude: 1 }, { id: otherRef.toUpperCase(), latitude: null }]) {
    const evidence = { ...ctx, locations: [...ctx.locations!, duplicate] }
    expect(evaluateActiveNearby(a, b, evidence)).toBeNull()
    expect(rankActiveNearby(a, [b], evidence)).toEqual([])
  }
  expect(evaluateActiveNearby(a, b, { ...ctx, locations: [...ctx.locations!, { id: ref, latitude: null }] })).toBeNull()
  // A malformed case variant of the special max UUID still conflicts with
  // that selected identity, even though it cannot pass full row validation.
  const max = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  const maxPerson = { ...b, preferences: { ...b.preferences, searchArea: { source: 'home' as const, resolvedLocationRef: max } } }
  const maxEvidence = { ...ctx, locations: [ctx.locations![0], { ...ctx.locations![1], id: max }, { id: max.toUpperCase() }] }
  expect(evaluateActiveNearby(a, maxPerson, maxEvidence)).toBeNull()
  expect(rankActiveNearby(a, [maxPerson], maxEvidence)).toEqual([])
  for (const blocks of [null, [null], [{ blockerId: 'malformed', blockedId: third }]]) {
    expect(evaluateActiveNearby(a, b, { ...ctx, blocks })).toBeNull()
    expect(rankActiveNearby(a, [b], { ...ctx, blocks })).toEqual([])
  }
  expect(evaluateActiveNearby(a, b, { ...ctx, locations: null })).toBeNull()
  expect(evaluateActiveNearby(a, b, { ...ctx, locations: {} })).toBeNull()
})
it('rejects invalid/overlapping exact windows instead of coarsening or double-counting', () => {
  const a = person(), b = person(them, otherRef)
  expect(evaluateActiveNearby(a, { ...b, availability: [window, window] }, context())).toBeNull()
  expect(evaluateActiveNearby(a, { ...b, availability: [{ ...window, end_time: '00:00:00' }] }, context())).toBeNull()
  const adjacent = [{ dow: 6, start_time: '21:15:30', end_time: '22:00:00' }, { dow: 6, start_time: '22:00:00', end_time: '24:00:00' }]
  expect(evaluateActiveNearby(a, { ...b, availability: adjacent }, context())?.overlapSeconds).toBe(9870)
})
