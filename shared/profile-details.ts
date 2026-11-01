import { z } from 'zod'

// Pebble comparison v1: fixed numeric case pairs, not runtime/DB locale casing.
// All Unicode scalar labels are supported. Unlisted scalars compare exactly;
// this is deliberately NOT full Unicode case folding or normalization. The SQL
// candidate duplicates this data, with static parity and paired corpus tests.
export const profileLanguageFoldRanges = [
  [65,90,1,32], [192,214,1,32], [216,222,1,32], [256,302,2,1], [306,310,2,1],
  [313,327,2,1], [330,374,2,1], [377,381,2,1], [461,475,2,1], [478,494,2,1],
  [498,500,2,1], [504,542,2,1], [546,562,2,1], [913,929,1,32], [931,939,1,32],
  [1024,1039,1,80], [1040,1071,1,32], [1120,1152,2,1], [1162,1214,2,1],
  [1217,1229,2,1], [1232,1326,2,1], [1329,1366,1,48], [7680,7828,2,1],
  [7840,7934,2,1], [65313,65338,1,32], [66560,66599,1,40], [66736,66771,1,40],
  [68736,68786,1,64], [71840,71871,1,32], [93760,93791,1,32], [125184,125217,1,34],
] as const
export const profileLanguageFoldExceptions: Readonly<Record<string, string>> = {
  181: 'μ', 223: 'ss', 304: 'i\u0307', 376: 'ÿ', 383: 's',
  902: 'ά', 904: 'έ', 905: 'ή', 906: 'ί', 908: 'ό', 910: 'ύ', 911: 'ώ', 962: 'σ',
  976: 'β', 977: 'θ', 981: 'φ', 982: 'π', 1008: 'κ', 1009: 'ρ', 1013: 'ε',
  7838: 'ss', 8486: 'ω', 8490: 'k', 8491: 'å',
}
// Exactly ECMAScript WhiteSpace + LineTerminator code points, explicitly pinned.
export const profileLanguageWhitespace = [9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279] as const
export function profileLanguageKey(value: string): string {
  const points = Array.from(value, character => character.codePointAt(0)!)
  const spaces: readonly number[] = profileLanguageWhitespace
  let start = 0, end = points.length
  while (start < end && spaces.includes(points[start])) start++
  while (end > start && spaces.includes(points[end - 1])) end--
  return points.slice(start, end).map(point => {
    const exception = profileLanguageFoldExceptions[String(point)]
    if (exception !== undefined) return exception
    const range = profileLanguageFoldRanges.find(([first, last, step]) => point >= first && point <= last && (point - first) % step === 0)
    return String.fromCodePoint(range ? point + range[3] : point)
  }).join('')
}
// /u treats a valid surrogate pair as one scalar; only unpaired surrogates match.
const validText = (value: string) => !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value)
const text = (max: number) => z.string().refine(validText, 'Use valid Unicode text without NUL.')
  .refine(value => Array.from(value).length <= max, `Use at most ${max} characters.`)
const language = text(60).refine(value => profileLanguageKey(value).length > 0, 'Enter a language.')
const languages = z.array(language).max(12).refine(values => new Set(values.map(profileLanguageKey)).size === values.length, 'Choose unique languages.')
export const ProfileFactsSchema = z.object({
  education: text(120),
  occupation: text(120),
  languages,
  visibility: z.object({ education: z.boolean(), occupation: z.boolean(), languages: z.boolean() }).strict(),
}).strict()
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const ProfileDetailsSchema = z.object({ revision, facts: ProfileFactsSchema }).strict()
export const SaveProfileDetailsSchema = z.object({ expectedRevision: revision.max(Number.MAX_SAFE_INTEGER - 1), facts: ProfileFactsSchema }).strict()
// Consumed only by eligible discovery projections with bilateral safety and
// per-field visibility enforcement. Never serialize an owner snapshot as public.
export const PublicProfileDetailsSchema = z.object({ education: text(120).optional(), occupation: text(120).optional(), languages: languages.optional() }).strict()
export const ProfileDetailsErrorSchema = z.object({
  code: z.enum(['auth', 'invalid', 'conflict', 'unavailable', 'provider', 'malformed']),
  error: text(160),
}).strict()
export type ProfileDetails = z.infer<typeof ProfileDetailsSchema>
export type SaveProfileDetails = z.infer<typeof SaveProfileDetailsSchema>
