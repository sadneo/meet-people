import type { Request, Response } from 'express'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMatchmakingRouter, type UserContextTransport } from '../../api/matchmaking'
import {
  ProfileCustomizationValueSchema, ProfileShowcaseSchema, SaveProfileCustomizationSchema, defaultProfileCustomization, orderInterests,
} from '../../shared/profile-customization'
import { interestSimilarity } from '../../shared/interests'

const id = 'a0000000-0000-4000-8000-000000000001'
const other = 'a0000000-0000-4000-8000-000000000002'
const chosen = { interestOrder: ['Music', 'Coffee'], audiences: { education: 'friends', occupation: 'dating', languages: 'both' }, gardenItem: 'bench' } as const
let stored: { revision: number; customization: unknown }
let rpcError: { code: string } | null
let echo: unknown
const writes = vi.fn(), showcases = vi.fn()
const transport = {
  verify: vi.fn(async (token: string) => token === 'first' ? { id } : null),
  actor: vi.fn(() => ({
    profileCustomization: async () => ({ data: stored, error: rpcError }),
    saveProfileCustomization: async (write: { expectedRevision: number; customization: unknown }) => {
      writes(write)
      if (rpcError) return { data: null, error: rpcError }
      if (write.expectedRevision !== stored.revision) return { data: null, error: { code: 'PC409' } }
      stored = { revision: stored.revision + 1, customization: structuredClone(write.customization) }
      return { data: echo ?? stored, error: null }
    },
    profilePrompts: async (owner: string, mode: string) => {
      showcases(`${owner}:${mode}`)
      if (rpcError) return { data: null, error: rpcError }
      return { data: [{ id: 'study-spot', answer: 'Library' }], error: null }
    },
    profileShowcase: async (owner: string) => {
      showcases(owner)
      if (rpcError) return { data: null, error: rpcError }
      return { data: { interestOrder: ['Coffee'], gardenItem: null }, error: null }
    },
  })),
} as unknown as UserContextTransport

function request(method = 'GET', body?: unknown, path = '/profile-customization') {
  return new Promise<{ status: number; data: unknown }>((resolve, reject) => {
    let status = 200
    const req = { method, url: path, query: Object.fromEntries(new URL(path, 'http://test').searchParams), headers: { authorization: 'Bearer first' }, body } as unknown as Request
    const res = { locals: {}, set() { return this }, status(value: number) { status = value; return this }, json(data: unknown) { resolve({ status, data }); return this } } as unknown as Response
    createMatchmakingRouter(transport)(req, res, error => error ? reject(error) : resolve({ status: 404, data: null }))
  })
}
beforeEach(() => {
  stored = { revision: 0, customization: structuredClone(defaultProfileCustomization) }
  rpcError = null
  echo = undefined
  writes.mockClear(); showcases.mockClear()
})

it('orders interests for display without changing matching similarity', () => {
  expect(orderInterests(['Art', 'Coffee', 'Music'], ['Music', 'Chess', 'Coffee'])).toEqual(['Music', 'Coffee', 'Art'])
  expect(orderInterests(['Art', 'Coffee'], [])).toEqual(['Art', 'Coffee'])
  const viewer = ['Coffee', 'Music', 'Art'], person = ['Art', 'Music']
  expect(interestSimilarity(viewer, orderInterests(person, ['Music']))).toEqual(interestSimilarity(viewer, person))
})

it('accepts only strict customization shapes', () => {
  expect(ProfileCustomizationValueSchema.safeParse(chosen).success).toBe(true)
  for (const bad of [
    { ...chosen, interestOrder: ['Coffee', 'Coffee'] },
    { ...chosen, interestOrder: ['a', 'b', 'c', 'd', 'e', 'f'] },
    { ...chosen, audiences: { ...chosen.audiences, education: 'everyone' } },
    { ...chosen, gardenItem: '../bench' },
    { ...chosen, extra: true },
  ]) expect(ProfileCustomizationValueSchema.safeParse(bad).success).toBe(false)
  expect(SaveProfileCustomizationSchema.safeParse({ expectedRevision: 0, customization: chosen, user_id: other }).success).toBe(false)
  expect(ProfileShowcaseSchema.safeParse({ interestOrder: [], gardenItem: null, audiences: chosen.audiences }).success).toBe(false)
})

it('reads, saves with a revision and confirms the readback', async () => {
  expect(await request()).toMatchObject({ status: 200, data: { revision: 0, customization: defaultProfileCustomization } })
  expect(await request('PUT', { expectedRevision: 0, customization: chosen })).toMatchObject({ status: 200, data: { revision: 1, customization: chosen } })
  expect(await request('PUT', { expectedRevision: 0, customization: chosen })).toMatchObject({ status: 409, data: { code: 'conflict' } })
  echo = { revision: 2, customization: defaultProfileCustomization }
  expect(await request('PUT', { expectedRevision: 1, customization: chosen })).toMatchObject({ status: 502, data: { code: 'malformed' } })
  expect((await request('PUT', { expectedRevision: 0, customization: { ...chosen, gardenItem: 'Bench!' } })).status).toBe(400)
  expect(writes).toHaveBeenCalledTimes(3)
})

it('serves another person’s showcase only through the audience-checked RPC', async () => {
  expect(await request('GET', undefined, `/profile-customization/${other}`)).toMatchObject({ status: 200, data: { interestOrder: ['Coffee'], gardenItem: null } })
  expect(showcases).toHaveBeenCalledWith(other)
  rpcError = { code: 'PC404' }
  expect(await request('GET', undefined, `/profile-customization/${other}`)).toMatchObject({ status: 404, data: { code: 'not_found' } })
  expect((await request('GET', undefined, '/profile-customization/not-a-uuid')).status).toBe(400)
  expect((await request('GET', undefined, `/profile-customization?owner=${other}`)).status).toBe(400)
})

it('serves prompts per mode and keeps stored prompts when a save omits them', async () => {
  expect(await request('GET', undefined, `/profile-customization/${other}/prompts/dating`)).toMatchObject({ status: 200, data: { prompts: [{ id: 'study-spot', answer: 'Library' }] } })
  expect(showcases).toHaveBeenCalledWith(`${other}:dating`)
  expect((await request('GET', undefined, `/profile-customization/${other}/prompts/everyone`)).status).toBe(400)
  stored = { revision: 0, customization: { ...defaultProfileCustomization, prompts: [{ id: 'study-spot', answer: 'Library' }] } }
  echo = { revision: 1, customization: { ...chosen, prompts: [{ id: 'study-spot', answer: 'Library' }] } }
  expect((await request('PUT', { expectedRevision: 0, customization: chosen })).status).toBe(200)
})
