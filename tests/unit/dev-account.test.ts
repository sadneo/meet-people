// @vitest-environment node
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { androidDevCredentials, ensureDevAccount } from '../../scripts/dev-account.mjs'

describe('androidDevCredentials', () => {
  it('generates a private emulator login once per stack and then reuses it', () => {
    const home = mkdtempSync(join(tmpdir(), 'android-dev-'))
    const first = androidDevCredentials('meet-people-wt-x', home)
    expect(first.email).toMatch(/^android-dev-[0-9a-f]{6}@example\.com$/)
    expect(first.password.length).toBeGreaterThanOrEqual(32)
    const file = join(home, '.local/share/pebble/meet-people-wt-x/android-dev-account.json')
    const stat = statSync(file)
    expect(stat.isFile()).toBe(true)
    if (process.platform !== 'win32') expect(stat.mode & 0o777).toBe(0o600)
    expect(androidDevCredentials('meet-people-wt-x', home)).toEqual(first)
    expect(androidDevCredentials('meet-people-wt-y', home).email).not.toBe(first.email)
  })
})

const email = 'Dev@Example.com', password = 'pw'
type Users = { id: string; email?: string | null }[]

function fake(options: { create?: { code?: string; message: string } | null; pages?: Users[]; listError?: string; signInOk?: boolean; updateError?: string } = {}) {
  const pages = options.pages ?? [[]]
  const admin = {
    createUser: vi.fn(async () => ({ error: options.create === undefined ? { code: 'email_exists', message: 'exists' } : options.create })),
    listUsers: vi.fn(async ({ page }: { page: number }) => options.listError ? { data: null, error: { message: options.listError } } : { data: { users: pages[page - 1] ?? [] }, error: null }),
    updateUserById: vi.fn(async () => ({ error: options.updateError ? { message: options.updateError } : null })),
  }
  const signIn = vi.fn(async () => ({ error: options.signInOk ? null : { message: 'invalid' } }))
  return { admin, signIn, run: () => ensureDevAccount({ admin, signIn, email, password }) }
}

describe('ensureDevAccount', () => {
  it('creates the account when the email is free', async () => {
    const f = fake({ create: null })
    expect(await f.run()).toEqual({ status: 'created' }); expect(f.admin.listUsers).not.toHaveBeenCalled()
  })
  it('reports other creation errors as they are', async () => {
    expect(await fake({ create: { code: 'weak_password', message: 'too short' } }).run()).toEqual({ status: 'error', message: 'Could not create the account: too short' })
  })
  it('resets the password of the existing account, matching email case-insensitively', async () => {
    const f = fake({ pages: [[{ id: 'a', email: 'other@example.com' }, { id: 'me', email: 'dev@example.com' }]] })
    expect(await f.run()).toEqual({ status: 'reset' })
    expect(f.admin.updateUserById).toHaveBeenCalledWith('me', { password, email_confirm: true })
  })
  it('keeps looking on later pages', async () => {
    const full: Users = Array.from({ length: 200 }, (_, i) => ({ id: `u${i}`, email: `u${i}@example.com` }))
    const f = fake({ pages: [full, [{ id: 'me', email: 'dev@example.com' }]] })
    expect(await f.run()).toEqual({ status: 'reset' }); expect(f.admin.listUsers).toHaveBeenCalledTimes(2)
  })
  it('says so when the account cannot be seen but the password already works', async () => {
    expect(await fake({ signInOk: true }).run()).toEqual({ status: 'already-works' })
  })
  it('reports a hidden account holding the email, with how many users were checked', async () => {
    expect(await fake({ pages: [[{ id: 'a', email: 'x@example.com' }]] }).run()).toEqual({ status: 'hidden', seen: 1 })
  })
  it('reports an unreadable user list, unless the password already works', async () => {
    expect(await fake({ listError: 'Database error finding users' }).run()).toEqual({ status: 'list-failed', message: 'Database error finding users' })
    expect(await fake({ listError: 'Database error finding users', signInOk: true }).run()).toEqual({ status: 'already-works' })
  })
  it('surfaces a failed reset instead of guessing', async () => {
    expect(await fake({ pages: [[{ id: 'me', email: 'dev@example.com' }]], updateError: 'nope' }).run()).toMatchObject({ status: 'error', message: expect.stringContaining('nope') })
  })
})
