import { z } from 'zod'

// Presentation only. Matching scores treat interests as an unordered set, so
// the order and top interest never change who is recommended.
export const DetailAudienceSchema = z.enum(['both', 'friends', 'dating'])
export type DetailAudience = z.infer<typeof DetailAudienceSchema>
const interest = z.string().min(1).max(120)
const interestOrder = z.array(interest).max(5).refine(values => new Set(values).size === values.length, 'Choose each interest once.')
const gardenItem = z.string().regex(/^[a-z][a-z-]{0,39}$/).nullable()
export const ProfileCustomizationValueSchema = z.object({
  interestOrder,
  audiences: z.object({ education: DetailAudienceSchema, occupation: DetailAudienceSchema, languages: DetailAudienceSchema }).strict(),
  gardenItem,
}).strict()
export type ProfileCustomizationValue = z.infer<typeof ProfileCustomizationValueSchema>
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const ProfileCustomizationSchema = z.object({ revision, customization: ProfileCustomizationValueSchema }).strict()
export type ProfileCustomization = z.infer<typeof ProfileCustomizationSchema>
export const SaveProfileCustomizationSchema = z.object({
  expectedRevision: revision.max(Number.MAX_SAFE_INTEGER - 1),
  customization: ProfileCustomizationValueSchema,
}).strict()
export type SaveProfileCustomization = z.infer<typeof SaveProfileCustomizationSchema>
// What another person may see; stale choices are already removed server-side.
export const ProfileShowcaseSchema = z.object({ interestOrder, gardenItem }).strict()
export type ProfileShowcase = z.infer<typeof ProfileShowcaseSchema>
export const ProfileCustomizationErrorSchema = z.object({
  code: z.enum(['auth', 'invalid', 'conflict', 'not_found', 'unavailable', 'provider', 'malformed']),
  error: z.string().max(160),
}).strict()

export const defaultProfileCustomization: ProfileCustomizationValue = {
  interestOrder: [],
  audiences: { education: 'both', occupation: 'both', languages: 'both' },
  gardenItem: null,
}

// Chosen order first (the first is the top interest), then the rest as saved.
export function orderInterests(interests: readonly string[], order: readonly string[]) {
  const chosen = order.filter(label => interests.includes(label))
  return [...chosen, ...interests.filter(label => !chosen.includes(label))]
}

export function sameCustomization(a: ProfileCustomizationValue, b: ProfileCustomizationValue) {
  return a.gardenItem === b.gardenItem && a.interestOrder.length === b.interestOrder.length &&
    a.interestOrder.every((label, index) => label === b.interestOrder[index]) &&
    a.audiences.education === b.audiences.education && a.audiences.occupation === b.audiences.occupation &&
    a.audiences.languages === b.audiences.languages
}
