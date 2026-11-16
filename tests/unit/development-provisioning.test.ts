// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { provisionDevelopmentAccount } from '../../dev/provision-development-account'

const mocks = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn(), createUser: vi.fn(), getUserById: vi.fn(), signInWithPassword: vi.fn(), rpc: vi.fn(), loadEnv: vi.fn() }))
vi.mock('node:fs/promises', () => ({ mkdir: mocks.mkdir, writeFile: mocks.writeFile }))
vi.mock('vite', () => ({ loadEnv: mocks.loadEnv }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById: mocks.getUserById, createUser: mocks.createUser }, signInWithPassword: mocks.signInWithPassword }, rpc: mocks.rpc }) }))
const id = 'd0000000-0000-4000-8000-000000000001'
const credentials = { accountId: id, email: 'pebble-development@example.test', password: 'synthetic-password', url: 'http://127.0.0.1:55321', publicKey: 'sb_publishable_fixture' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('PEBBLE_SUPABASE_PROJECT_ID', 'meet-people-wt-unit'); vi.stubEnv('PEBBLE_SUPABASE_URL', credentials.url)
  for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) vi.stubEnv(name, undefined)
  mocks.loadEnv.mockReturnValue({ SUPABASE_URL: credentials.url, SUPABASE_PUBLISHABLE_KEY: credentials.publicKey, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-only' })
  mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404 } })
  mocks.createUser.mockResolvedValue({ error: null })
  mocks.signInWithPassword.mockResolvedValue({ data: { user: { id } }, error: null })
  mocks.rpc.mockResolvedValue({ data: { profile: null, completed: [] }, error: null })
})
afterEach(() => { vi.unstubAllEnvs() })
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
it('refuses a loopback origin that is not this stack\'s before credential or account writes', async () => {
  mocks.loadEnv.mockReturnValue({ SUPABASE_URL: 'http://127.0.0.1:55322', SUPABASE_PUBLISHABLE_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })
  await expect(provisionDevelopmentAccount()).rejects.toThrow('Local Supabase')
  expect(mocks.getUserById).not.toHaveBeenCalled()
  expect(mocks.writeFile).not.toHaveBeenCalled()
})
it('repairs a stale credential url in place once the marked user and password verify on this stack', async () => {
  const stale = { ...credentials, url: 'http://127.0.0.1:55999' }
  mocks.getUserById.mockResolvedValue({ data: { user: { email: credentials.email, app_metadata: { pebble_development: 'local-development-v1' } } }, error: null })
  mocks.rpc.mockResolvedValue({ data: { profile: {}, completed: [0, 1, 2, 3] }, error: null })
  const result = await provisionDevelopmentAccount(stale)
  expect(result).toEqual(credentials)
  expect(mocks.writeFile).toHaveBeenCalledTimes(1)
  expect(mocks.writeFile).toHaveBeenCalledWith(expect.stringMatching(/meet-people-wt-unit[\\/]development-account\.json$/), JSON.stringify(credentials), { mode: 0o600, flag: expect.any(Number) })
  expect(mocks.createUser).not.toHaveBeenCalled()
})
it('does not rewrite a stale file when the reserved identity is not a development account', async () => {
  mocks.getUserById.mockResolvedValue({ data: { user: { email: 'other@example.test', app_metadata: {} } }, error: null })
  await expect(provisionDevelopmentAccount({ ...credentials, url: 'http://127.0.0.1:55999' })).rejects.toThrow('Reserved identity')
  expect(mocks.writeFile).not.toHaveBeenCalled()
})
it('does not rewrite a stale file for a different identity or when sign-in fails', async () => {
  const stale = { ...credentials, url: 'http://127.0.0.1:55999' }
  await expect(provisionDevelopmentAccount({ ...stale, email: 'someone@example.test' })).rejects.toThrow('Unexpected development identity')
  mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: new Error('bad') })
  await expect(provisionDevelopmentAccount(stale)).rejects.toThrow('sign-in failed')
  expect(mocks.writeFile).not.toHaveBeenCalled()
})
it('takes the origin from the stack, not SUPABASE_URL', async () => {
  mocks.loadEnv.mockReturnValue({ SUPABASE_PUBLISHABLE_KEY: credentials.publicKey, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-only' })
  expect((await provisionDevelopmentAccount()).url).toBe(credentials.url)
})
it('refuses to provision without a local stack', async () => {
  vi.stubEnv('PEBBLE_SUPABASE_PROJECT_ID', ''); vi.stubEnv('PEBBLE_SUPABASE_URL', '')
  await expect(provisionDevelopmentAccount()).rejects.toThrow('No local stack for this worktree. Run pnpm dev first.')
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
