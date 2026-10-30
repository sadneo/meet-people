// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  dating: vi.fn(() => ({ pool: vi.fn() })),
  friends: vi.fn(() => ({ pool: vi.fn() })),
  worker: vi.fn(() => ({ sweep: vi.fn(async () => ({ ok: true })), claim: vi.fn(async () => null), finish: vi.fn(), reconcile: vi.fn() })),
}))
vi.mock('../../api/env', async original => ({ ...await original<typeof import('../../api/env')>(), env: mocks.env }))
vi.mock('../../api/matching/dating-recommendations', async original => ({ ...await original<typeof import('../../api/matching/dating-recommendations')>(), createDatingScoringTransport: mocks.dating }))
vi.mock('../../api/matching/friends-recommendations', async original => ({ ...await original<typeof import('../../api/matching/friends-recommendations')>(), createFriendsScoringTransport: mocks.friends }))
vi.mock('../../api/matching/active-worker', async original => ({ ...await original<typeof import('../../api/matching/active-worker')>(), createActiveFriendsWorker: mocks.worker }))

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  // No matchmaking flags: credentials alone configure all three services.
  for (const key of Object.keys(mocks.env)) delete mocks.env[key]
  Object.assign(mocks.env, { SUPABASE_URL: 'https://matching.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-key' })
})
afterEach(() => vi.restoreAllMocks())

it('configures Dating, Friends and active matching by default without environment feature switches', async () => {
  await import('../../api/index')
  for (const factory of [mocks.dating, mocks.friends, mocks.worker]) {
    expect(factory).toHaveBeenCalledExactlyOnceWith('https://matching.test', 'synthetic-server-key')
  }
})

it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'])('does not initialize privileged matching services without %s', async missing => {
  delete mocks.env[missing]
  await import('../../api/index')
  expect(mocks.dating).not.toHaveBeenCalled()
  expect(mocks.friends).not.toHaveBeenCalled()
  expect(mocks.worker).not.toHaveBeenCalled()
})

it('runs the explicitly invoked active worker without an environment enable switch', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('../../api/active-friends-worker-main')
  expect(mocks.worker).toHaveBeenCalledExactlyOnceWith('https://matching.test', 'synthetic-server-key')
  expect(mocks.worker.mock.results[0].value.claim).toHaveBeenCalledOnce()
  expect(log).toHaveBeenCalledWith(JSON.stringify({ cycles: 1, reserved: 0, state: 'complete' }))
})
