// @vitest-environment node
import { expect, it } from 'vitest'
import { privatePosixAccess, privateWindowsAccess } from '../../dev/private-development-file'
const user = 'S-1-5-21-123-456-789-1001'
const acl = { user, owner: user, reparse: false, allows: [user, 'S-1-5-18', 'S-1-5-32-544'] }
it('accepts a Windows user-owned file accessible only to that user and system administrators', () => {
  expect(privateWindowsAccess(acl)).toBe(true)
})
it.each(['S-1-1-0', 'S-1-5-32-545', 'S-1-5-11', 'S-1-5-21-123-456-789-1002'])('rejects credential access granted to %s', sid => {
  expect(privateWindowsAccess({ ...acl, allows: [...acl.allows, sid] })).toBe(false)
})
it('rejects reparse points, different owners, invalid identities, and unreadable ACLs', () => {
  expect(privateWindowsAccess({ ...acl, reparse: true })).toBe(false)
  expect(privateWindowsAccess({ ...acl, owner: 'S-1-5-32-544' })).toBe(false)
  expect(privateWindowsAccess({ ...acl, user: '' })).toBe(false)
  expect(privateWindowsAccess({ ...acl, allows: [] })).toBe(false)
})
it('keeps the exact owner-only POSIX rule', () => {
  expect(privatePosixAccess({ uid: 1000, mode: 0o100600 }, 1000)).toBe(true)
  expect(privatePosixAccess({ uid: 1000, mode: 0o100644 }, 1000)).toBe(false)
  expect(privatePosixAccess({ uid: 1000, mode: 0o100600 }, 1001)).toBe(false)
  expect(privatePosixAccess({ uid: 1000, mode: 0o100600 }, undefined)).toBe(false)
})
