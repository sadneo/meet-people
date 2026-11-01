// @vitest-environment node
import { expect, it } from 'vitest'
import { OwnerBlocklistSchema, OwnerBlockStateSchema, SubmitSafetyReportSchema, SafetyReportReceiptSchema } from '../../shared/safety'

const id = 'a0000000-0000-4000-8000-000000000001'
it('exposes only outgoing opaque IDs and nullable actual dates, never live names or incoming status', () => {
  expect(OwnerBlocklistSchema.parse({ enforcement: 'contact-mutations-only', blocks: [{ targetId: id, displayName: null, blockedAt: null }] }).blocks[0].blockedAt).toBeNull()
  for (const value of [
    { enforcement: 'complete', blocks: [] },
    { enforcement: 'contact-mutations-only', blocks: [{ targetId: id, displayName: 'Hidden live name', blockedAt: null }] },
    { enforcement: 'contact-mutations-only', blocks: [{ targetId: id, displayName: null, blockedAt: null }, { targetId: id, displayName: null, blockedAt: null }] },
  ]) expect(OwnerBlocklistSchema.safeParse(value).success).toBe(false)
  expect(OwnerBlockStateSchema.safeParse({ targetId: id, outgoingBlocked: true, enforcement: 'contact-mutations-only', incomingBlocked: true }).success).toBe(false)
})
it('strictly bounds private report input and returns intake receipt, never a moderation outcome', () => {
  const value = { requestId: id, targetId: id, reason: 'Other', context: ' Exact\ncontext 🪨 ' }
  expect(SubmitSafetyReportSchema.parse(value)).toEqual(value)
  for (const extra of [{ actorId: id }, { status: 'resolved' }, { blocked: true }]) expect(SubmitSafetyReportSchema.safeParse({ ...value, ...extra }).success).toBe(false)
  expect(SubmitSafetyReportSchema.safeParse({ ...value, context: '🪨'.repeat(1001) }).success).toBe(false)
  for (const context of ['\0', 'a\0b', '\ud800', '\udc00']) expect(SubmitSafetyReportSchema.safeParse({ ...value, context }).success).toBe(false)
  expect(SafetyReportReceiptSchema.safeParse({ id, requestId: id, targetId: id, receivedAt: '2026-10-19T00:00:00Z', status: 'resolved' }).success).toBe(false)
})
