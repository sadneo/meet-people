// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { provisionDevelopmentAccount } from '../../dev/provision-development-account'

const mocks = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn(), createUser: vi.fn(), getUserById: vi.fn(), signInWithPassword: vi.fn(), rpc: vi.fn(), loadEnv: vi.fn() }))
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir, writeFile: mocks.writeFile }))
vi.mock('vite', () => ({ loadEnv: mocks.loadEnv }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById: mocks.getUserById, createUser: mocks.createUser }, signInWithPassword: mocks.signInWithPassword }, rpc: mocks.rpc }) }))
const id = 'd0000000-0000-4000-8000-000000000001'
const credentials = { accountId: id, email: 'pebble-development@example.test', password: 'synthetic-password', url: 'http://127.0.0.1:54321', publicKey: 'sb_publishable_fixture' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.loadEnv.mockReturnValue({ SUPABASE_URL: credentials.url, SUPABASE_PUBLISHABLE_KEY: credentials.publicKey, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-only' })
  mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404 } })
  mocks.createUser.mockResolvedValue({ error: null })
  mocks.signInWithPassword.mockResolvedValue({ data: { user: { id } }, error: null })
  mocks.rpc.mockResolvedValue({ data: { profile: null, completed: [] }, error: null })
})
it('creates a confirmed, marked local user and persists private credentials exclusively', async () => {
  const result = await provisionDevelopmentAccount()
  expect(result.password.length).toBeGreaterThan(32)
  expect(mocks.writeFile).toHaveBeenCalledWith(expect.stringContaining('development-account.json'), JSON.stringify(result), { mode: 0o600, flag: 'wx' })
  expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ id, email_confirm: true, app_metadata: { pebble_development: 'local-development-v1' } }))
  expect(mocks.rpc).toHaveBeenCalledWith('save_account', expect.objectContaining({ account_in: expect.objectContaining({ completed: [0] }) }))
})
it('reuses a complete development account without overwriting credentials or profile', async () => {
  mocks.getUserById.mockResolvedValue({ data: { user: { email: credentials.email, app_metadata: { pebble_development: 'local-development-v1' } } }, error: null })
  mocks.rpc.mockResolvedValue({ data: { profile: {}, completed: [0, 1, 2, 3] }, error: null })
  await provisionDevelopmentAccount(credentials)
  expect(mocks.createUser).not.toHaveBeenCalled()
  expect(mocks.writeFile).not.toHaveBeenCalled()
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('refuses hosted Supabase before credential or account writes', async () => {
  mocks.loadEnv.mockReturnValue({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })
  await expect(provisionDevelopmentAccount()).rejects.toThrow('Local Supabase')
  expect(mocks.getUserById).not.toHaveBeenCalled()
  expect(mocks.writeFile).not.toHaveBeenCalled()
})
it('preserves an unrelated account occupying the reserved identity', async () => {
  mocks.getUserById.mockResolvedValue({ data: { user: { email: 'other@example.test', app_metadata: {} } }, error: null })
  await expect(provisionDevelopmentAccount()).rejects.toThrow('Reserved identity')
  expect(mocks.createUser).not.toHaveBeenCalled()
  expect(mocks.writeFile).not.toHaveBeenCalled()
})
it('resumes account creation after an interrupted first attempt', async () => {
  await provisionDevelopmentAccount(credentials)
  expect(mocks.writeFile).not.toHaveBeenCalled()
  expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ password: credentials.password }))
})

it('finishes the four sequential onboarding writes before returning first-use credentials', async () => {
  await provisionDevelopmentAccount()
  const chapters = mocks.rpc.mock.calls.filter(([name]) => name === 'save_account').map(([, args]) => args.account_in.completed)
  expect(chapters).toEqual([[0], [0, 1], [0, 1, 2], [0, 1, 2, 3]])
})
it('stops provisioning at a failed chapter instead of claiming completion', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: { profile: null, completed: [] }, error: null })
    .mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error('Save failed') })
  await expect(provisionDevelopmentAccount()).rejects.toThrow('Save failed')
  expect(mocks.rpc.mock.calls.filter(([name]) => name === 'save_account')).toHaveLength(2)
})
