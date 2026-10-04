import { describe, expect, it } from 'vitest'
import { initialState, reducer, validPlan, type Draft } from '../src/features/prototype/model'

const draft: Draft = { ...initialState.draft, people: ['jamie', 'aaron'], activity: 'coffee', time: '16:00' }
describe('isolated prototype state', () => {
  it('requires complete, compatible plans and rejects blocked people', () => {
    expect(validPlan(initialState.draft)).toBe(false)
    expect(validPlan(draft)).toBe(true)
    expect(validPlan({ ...draft, time: '17:00' })).toBe(false)
    expect(validPlan({ ...draft, activity: 'missing' })).toBe(false)
    expect(validPlan({ ...draft, date: '' })).toBe(false)
    expect(validPlan(draft, ['jamie'])).toBe(false)
    expect(reducer(initialState, { type: 'confirm' }).plan).toBeNull()
  })
  it('keeps a confirmed snapshot while editing, then replaces it on confirmation', () => {
    const confirmed = reducer({ ...initialState, draft }, { type: 'confirm' })
    const changed = reducer(confirmed, { type: 'draft', patch: { activity: 'walk' } })
    expect(changed.plan?.activity).toBe('coffee')
    const updated = reducer(changed, { type: 'confirm' })
    expect(updated.plan?.activity).toBe('walk')
    expect(reducer(updated, { type: 'confirm' }).plan).toEqual(updated.plan)
  })
  it('awards each chapter once and requires a complete basic profile first', () => {
    const invalid = { ...initialState.profile, bio: '' }
    expect(reducer(initialState, { type: 'chapter', chapter: 0, profile: invalid }).completed).toEqual([])
    expect(reducer(initialState, { type: 'chapter', chapter: 2, profile: initialState.profile }).completed).toEqual([])
    const once = reducer(initialState, { type: 'chapter', chapter: 0, profile: initialState.profile })
    const twice = reducer(once, { type: 'chapter', chapter: 0, profile: initialState.profile })
    expect(twice.completed).toEqual([0])
  })
  it('separates mock conversations and removes blocked people from the draft', () => {
    const sent = reducer(initialState, { type: 'message', channel: 'jamie', text: ' Hello ' })
    expect(sent.messages.jamie).toEqual(['Hello'])
    expect(sent.messages.plan).toBeUndefined()
    expect(reducer(sent, { type: 'message', channel: 'plan', text: '   ' })).toEqual(sent)
    const blocked = reducer({ ...sent, draft }, { type: 'block', id: 'jamie' })
    expect(blocked.draft.people).toEqual(['aaron'])
    expect(blocked.draft.time).toBe('')
    expect(reducer(blocked, { type: 'unblock', id: 'jamie' }).blocked).toEqual([])
  })
})
