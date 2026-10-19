import { z } from 'zod'

export const SafetyIdSchema = z.uuid().length(36).transform(value => value.toLowerCase())
const timestamp = z.iso.datetime({ offset: true })
const enforcement = z.literal('contact-mutations-only')
// This receipt describes ledger state and an operational subset, NOT completed
// discovery/history/Events/all-surface block enforcement or permission to contact.
export const OwnerBlockStateSchema = z.object({ targetId: SafetyIdSchema, outgoingBlocked: z.boolean(), enforcement }).strict()
export const OwnerBlocklistSchema = z.object({ enforcement, blocks: z.array(z.object({ targetId: SafetyIdSchema, displayName: z.null(), blockedAt: timestamp.nullable() }).strict()) }).strict()
  .refine(value => new Set(value.blocks.map(block => block.targetId)).size === value.blocks.length, 'Duplicate block entries.')
export const SafetyReportReasonSchema = z.enum(['Harassment', 'Inappropriate content', 'Impersonation', 'Safety concern', 'Other'])
export const SubmitSafetyReportSchema = z.object({ requestId: SafetyIdSchema, targetId: SafetyIdSchema, reason: SafetyReportReasonSchema,
  context: z.string().refine(value => !/[\u0000\uD800-\uDFFF]/u.test(value) && Array.from(value).length <= 1000, 'Use at most 1000 valid Unicode characters without NUL.') }).strict()
export const SafetyReportReceiptSchema = z.object({ id: SafetyIdSchema, requestId: SafetyIdSchema, targetId: SafetyIdSchema, receivedAt: timestamp, status: z.literal('received') }).strict()
export const SafetyErrorSchema = z.object({ code: z.enum(['auth', 'invalid', 'conflict', 'not_found', 'rate_limited', 'unavailable', 'provider', 'malformed']), error: z.string().max(160) }).strict()
export type OwnerBlockState = z.infer<typeof OwnerBlockStateSchema>
export type SubmitSafetyReport = z.infer<typeof SubmitSafetyReportSchema>
export type SafetyReportReceipt = z.infer<typeof SafetyReportReceiptSchema>
