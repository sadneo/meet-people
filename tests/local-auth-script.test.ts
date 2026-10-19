// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import console from 'node:console'
import { emptyAccount, SaveAccountSchema, type Account } from '../shared/account'

const boundary = vi.hoisted(() => ({ status: vi.fn(), create: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: boundary.status }))
vi.mock('@supabase/supabase-js', () => ({ createClient: boundary.create }))

type User = { id: string; email: string; password: string; confirmed: boolean; account: Account }
let generated: User[], deleted: string[], events: string[], writes: Account[], fail: string
const providerFailure = { message: 'sensitive-provider-detail', code: 'synthetic' }
const copy = <T,>(value: T): T => structuredClone(value)
const sqlOrder = (account: Account) => {
  const result = copy(account)
  result.profile?.interests.sort()
  result.profile?.availability.sort((a, b) => a.dow - b.dow || a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time))
  return result
}
function actor() {
  let owner: User | undefined
  return {
    auth: {
      async signUp({ email, password }: { email: string; password: string }) {
        if (fail === 'second-signup' && generated.length === 1) return { data: { user: null }, error: providerFailure }
        owner = { id: `a0000000-0000-4000-8000-${String(generated.length + 1).padStart(12, '0')}`, email, password, confirmed: false, account: copy(emptyAccount) }
        generated.push(owner); events.push('signup')
        return { data: { user: { id: owner.id }, session: null }, error: null }
      },
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        owner = generated.find(user => user.email === email && user.password === password && user.confirmed)
        events.push('password-login')
        return owner ? { data: { session: { user: { id: owner.id } } }, error: null } : { data: { session: null }, error: providerFailure }
      },
      async signOut() {
        events.push('logout')
        if (fail === 'logout') return { error: providerFailure }
        owner = undefined; return { error: null }
      },
      async verifyOtp({ token_hash, type }: { token_hash: string; type: string }) {
        events.push('recovery-verify')
        if (fail === 'recovery' || token_hash !== 'synthetic-recovery-token' || type !== 'recovery') return { error: providerFailure }
        owner = generated[0]; return { data: { session: { user: { id: owner.id } } }, error: null }
      },
      async updateUser({ password }: { password: string }) {
        if (!owner || fail === 'password-update') return { error: providerFailure }
        owner.password = password; events.push('password-update'); return { error: null }
      },
    },
    async rpc(name: string, args?: { account_in: Account }) {
      if (!owner) { events.push('anonymous-denied'); return { data: null, error: providerFailure } }
      if (name === 'get_account') {
        events.push(`read:${owner.id}`)
        const account = sqlOrder(owner.account)
        if (fail === 'readback' && writes.length === 2 && owner === generated[0]) account.profile!.interests = ['Coffee']
        return { data: account, error: null }
      }
      if (name !== 'save_account' || !args) throw new Error('Unexpected fixture RPC')
      const next = copy(args.account_in)
      if (owner === generated[1]) {
        events.push('skip-rejected')
        return { data: null, error: fail === 'skip-accepted' ? null : providerFailure }
      }
      const parsed = SaveAccountSchema.safeParse(next)
      if (!parsed.success || next.completed.length > owner.account.completed.length + 1 || (fail === 'chapter-save' && next.completed.length === 3)) return { data: null, error: providerFailure }
      owner.account = sqlOrder(parsed.data); writes.push(next); events.push(`save:${next.completed.length}`)
      return { data: copy(owner.account), error: null }
    },
    from(table: string) {
      if (table !== 'account_settings') throw new Error('Unexpected fixture table')
      return {
        async select() {
          events.push('private-read')
          if (fail === 'private-row-leak' && owner === generated[1]) return { data: [{ user_id: generated[0].id }], error: null }
          return { data: owner?.account.completed.length ? [{ user_id: owner.id, settings: copy(owner.account.settings) }] : [], error: null }
        },
        update: () => ({ eq: async (column: string, id: string) => {
          if (column !== 'user_id' || id !== generated[0].id) throw new Error('Unexpected write target')
          events.push('private-write-denied'); return { error: providerFailure }
        } }),
      }
    },
  }
}
beforeEach(() => {
  vi.resetModules(); generated = []; deleted = []; events = []; writes = []; fail = ''
  boundary.status.mockReset().mockReturnValue('API_URL="http://127.0.0.1:54321"\nANON_KEY="synthetic-public"\nSERVICE_ROLE_KEY="synthetic-admin"\n')
  const admin = { auth: { admin: {
    async updateUserById(id: string, value: { email_confirm: boolean }) {
      const user = generated.find(user => user.id === id)
      if (!user || !value.email_confirm || fail === 'confirmation') return { error: providerFailure }
      user.confirmed = true; events.push('confirm'); return { error: null }
    },
    async generateLink({ type, email }: { type: string; email: string }) {
      if (type !== 'recovery' || email !== generated[0].email) throw new Error('Unexpected recovery target')
      return { data: { properties: { hashed_token: 'synthetic-recovery-token' } }, error: null }
    },
    async deleteUser(id: string) {
      if (!generated.some(user => user.id === id)) throw new Error('Cleanup escaped this run')
      deleted.push(id)
      if (fail === 'cleanup-first-throws' && id === generated[0].id) throw new Error('sensitive-provider-detail')
      return { error: fail === 'cleanup-first' && id === generated[0].id ? providerFailure : null }
    },
  } } }
  boundary.create.mockReset().mockImplementation((_url, key) => key === 'synthetic-admin' ? admin : actor())
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })
const run = () => import('../scripts/test-local-auth.mjs' as string)

it('executes four valid sequential persisted chapters with authoritative SQL-ordered readback, isolation, logout and recovery', async () => {
  await run()
  expect(writes.slice(0, 4).map(account => account.completed)).toEqual([[0], [0, 1], [0, 1, 2], [0, 1, 2, 3]])
  expect(writes[1].profile!.interests).toHaveLength(3)
  expect(new Set(writes[1].profile!.interests).size).toBe(3)
  expect(writes[3].profile).toMatchObject({ birthdate: '2001-02-03', location_city: 'Synthetic campus', availability: [{ dow: 1, start_time: '12:00:00', end_time: '17:00:00' }] })
  expect(writes[3].preferences).toMatchObject({ intents: ['Meet new people'], distance: 'Nearby', group: 'Either' })
  for (const [index, event] of events.entries()) if (event.startsWith('save:')) expect(events[index + 1]).toBe(`read:${generated[0].id}`)
  expect(generated).toHaveLength(2); expect(generated.every(user => user.confirmed)).toBe(true)
  expect(events.filter(event => event === 'private-read')).toHaveLength(2)
  for (const event of ['private-write-denied', 'skip-rejected', 'anonymous-denied', 'recovery-verify', 'password-update']) expect(events).toContain(event)
  expect(events.filter(event => event === 'password-login')).toHaveLength(4)
  expect(deleted).toEqual(generated.map(user => user.id))
  const output = JSON.stringify(vi.mocked(console.log).mock.calls)
  for (const user of generated) expect(output.includes(user.password) || output.includes(user.email)).toBe(false)
})
it.each(['second-signup', 'confirmation', 'chapter-save', 'readback', 'private-row-leak', 'skip-accepted', 'logout', 'recovery', 'password-update'])('cleans up only this run’s generated users on %s failure', async failure => {
  fail = failure
  await expect(run()).rejects.toThrow()
  expect(deleted).toEqual(generated.map(user => user.id))
  expect(generated.length).toBeGreaterThan(0)
})
it.each(['cleanup-first', 'cleanup-first-throws'])('attempts both deletions on %s failure without leaking diagnostics or reporting success', async mode => {
  fail = mode
  let failure: unknown
  try { await run() } catch (error) { failure = error }
  expect(failure).toBeInstanceOf(Error)
  expect(String(failure)).not.toContain('sensitive-provider-detail')
  expect(deleted).toEqual(generated.map(user => user.id))
  expect(console.log).not.toHaveBeenCalled()
})
it.each(['https://remote.example.test', 'http://user:synthetic@127.0.0.1:54321', 'http://127.0.0.1:54321/?untrusted=1'])('rejects unsafe status URL %s before creating any client or user', async url => {
  boundary.status.mockReturnValue(`API_URL="${url}"\nANON_KEY="synthetic-public"\nSERVICE_ROLE_KEY="synthetic-admin"\n`)
  await expect(run()).rejects.toThrow()
  expect(boundary.create).not.toHaveBeenCalled(); expect(generated).toEqual([]); expect(deleted).toEqual([])
})
