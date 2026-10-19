import { describe, expect, it } from 'vitest'
import { activities, demoReducer, initialState } from '../src/features/community/demo'

describe('isolated community demo', () => {
  it('requires proof before confirmations or rewards and ignores unknown activities', () => {
    for (const type of ['confirm', 'confirm-all', 'collect'] as const) {
      expect(demoReducer(initialState, { type, id: 'walk' })).toEqual(initialState)
    }
    for (const type of ['proof', 'confirm', 'confirm-all', 'collect'] as const) {
      expect(demoReducer(initialState, { type, id: 'unknown' })).toEqual(initialState)
    }
    expect(demoReducer(initialState, { type: 'grow' })).toEqual(initialState)
  })

  it('collects proof once and only credits new confirmations on a later collection', () => {
    let state = demoReducer(initialState, { type: 'proof', id: 'walk' })
    expect(demoReducer(state, { type: 'proof', id: 'walk' })).toEqual(state)
    expect(state.balance).toBe(0)
    state = demoReducer(state, { type: 'collect', id: 'walk' })
    expect(state.balance).toBe(10)
    expect(demoReducer(state, { type: 'collect', id: 'walk' })).toEqual(state)
    state = demoReducer(state, { type: 'confirm', id: 'walk' })
    expect(state.attendance.walk.confirmations).toBe(1)
    expect(state.balance).toBe(10)
    state = demoReducer(state, { type: 'collect', id: 'walk' })
    expect(state.balance).toBe(20)
    expect(state.feedback).toMatchObject({ kind: 'earn', amount: 10 })
    state = demoReducer(state, { type: 'confirm-all', id: 'walk' })
    state = demoReducer(state, { type: 'collect', id: 'walk' })
    expect(state.balance).toBe(40)
    expect(state.attendance.walk).toEqual({ proof: true, confirmations: 3, collected: 40 })
    for (const type of ['proof', 'confirm', 'confirm-all', 'collect'] as const) {
      expect(demoReducer(state, { type, id: 'walk' })).toEqual(state)
    }
  })

  it('keeps the complete progression reachable and resets all demo proof and rewards', () => {
    let state = initialState
    for (const activity of activities) {
      state = demoReducer(state, { type: 'proof', id: activity.id })
      state = demoReducer(state, { type: 'confirm-all', id: activity.id })
      state = demoReducer(state, { type: 'collect', id: activity.id })
      expect(state.balance).toBe(activity.reward)
      state = demoReducer(state, { type: 'grow' })
      expect(state.balance).toBe(0)
      expect(state.feedback).toMatchObject({ kind: 'spend', amount: activity.reward })
    }
    expect(state.stage).toBe(3)
    expect(demoReducer(state, { type: 'grow' })).toEqual(state)
    expect(demoReducer(state, { type: 'reset' })).toMatchObject({ ...initialState, message: expect.any(String) })
  })

  it('preserves spare Pebbles and gates free customization behind the cottage', () => {
    expect(demoReducer(initialState, { type: 'roof', color: 'blue' })).toEqual(initialState)
    expect(demoReducer(initialState, { type: 'flowers' })).toEqual(initialState)
    let state = demoReducer(initialState, { type: 'proof', id: 'garden' })
    state = demoReducer(state, { type: 'confirm-all', id: 'garden' })
    state = demoReducer(state, { type: 'collect', id: 'garden' })
    state = demoReducer(state, { type: 'grow' })
    expect(state.balance).toBe(60)
    state = demoReducer(state, { type: 'grow' })
    state = demoReducer(state, { type: 'roof', color: 'blue' })
    state = demoReducer(state, { type: 'flowers' })
    expect(state).toMatchObject({ stage: 2, balance: 0, roof: 'blue', flowers: false })
  })
})
