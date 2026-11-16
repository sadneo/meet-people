import { z } from 'zod'

// Keep in sync with public.profile_prompt_catalog() in the database.
export const profilePrompts = [
  { id: 'study-spot', text: 'Best study spot on campus', audience: 'both' },
  { id: 'ask-me-about', text: 'Ask me about…', audience: 'both' },
  { id: 'perfect-saturday', text: 'A perfect Saturday looks like…', audience: 'both' },
  { id: 'get-along', text: 'We’ll get along if…', audience: 'both' },
  { id: 'currently', text: 'Currently obsessed with…', audience: 'both' },
  { id: 'campus-food', text: 'Best thing to eat on campus', audience: 'both' },
  { id: 'proud-of', text: 'A small thing I’m proud of', audience: 'both' },
  { id: 'looking-for', text: 'I’m looking for someone who…', audience: 'dating' },
  { id: 'first-date', text: 'My ideal first date', audience: 'dating' },
  { id: 'green-flag', text: 'A green flag for me', audience: 'dating' },
] as const
export type ProfilePromptId = typeof profilePrompts[number]['id']
export const promptLimit = 3
export const promptAnswerLimit = 150
// Short enough to sit on a photo without covering it.
export const photoCaptionLimit = 40

const ids = profilePrompts.map(prompt => prompt.id) as [ProfilePromptId, ...ProfilePromptId[]]
const answer = z.string().min(1).max(promptAnswerLimit)
  .refine(value => value === value.trim(), 'Remove extra spaces.')
  .refine(value => !/\p{Cc}/u.test(value), 'Remove control characters.')
// Where a prompt shows. Dating-only questions always show only in Dating.
export const PromptAudienceSchema = z.enum(['both', 'friends', 'dating'])
export type PromptAudience = z.infer<typeof PromptAudienceSchema>
export const ProfilePromptSchema = z.object({ id: z.enum(ids), answer, audience: PromptAudienceSchema.optional() }).strict()
export type ProfilePrompt = z.infer<typeof ProfilePromptSchema>
export function promptShowsIn(prompt: Pick<ProfilePrompt, 'id' | 'audience'>): PromptAudience {
  return promptAudience(prompt.id) === 'dating' ? 'dating' : prompt.audience ?? 'both'
}
export function promptCount(prompts: readonly ProfilePrompt[], mode: 'friends' | 'dating') {
  return prompts.filter(prompt => promptShowsIn(prompt) === 'both' || promptShowsIn(prompt) === mode).length
}
export const ProfilePromptsSchema = z.array(ProfilePromptSchema).max(promptLimit * 2)
  .refine(values => new Set(values.map(value => value.id)).size === values.length, 'Choose each prompt once.')
  .refine(values => values.every(value => promptAudience(value.id) !== 'dating' || (value.audience ?? 'dating') === 'dating'), 'That prompt is only for Dating.')
  .refine(values => promptCount(values, 'friends') <= promptLimit && promptCount(values, 'dating') <= promptLimit, `Use up to ${promptLimit} prompts in each mode.`)

export function promptText(id: string) {
  return profilePrompts.find(prompt => prompt.id === id)?.text ?? ''
}
export function promptAudience(id: string) {
  return profilePrompts.find(prompt => prompt.id === id)?.audience ?? 'both'
}
export function promptsForMode(prompts: readonly ProfilePrompt[], mode: 'friends' | 'dating') {
  return prompts.filter(prompt => promptShowsIn(prompt) === 'both' || promptShowsIn(prompt) === mode)
}

export const PhotoCaptionsSchema = z.object({
  revision: z.number().int().nonnegative().safe(),
  captions: z.array(z.string().min(1).max(photoCaptionLimit).nullable()).max(4),
}).strict()
export type PhotoCaptions = z.infer<typeof PhotoCaptionsSchema>
export const SavePhotoCaptionSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  position: z.number().int().min(1).max(4),
  caption: z.string().max(photoCaptionLimit + 20).refine(value => value.trim().length <= photoCaptionLimit, `Use at most ${photoCaptionLimit} characters.`).refine(value => !/\p{Cc}/u.test(value), 'Remove control characters.'),
}).strict()
export type SavePhotoCaption = z.infer<typeof SavePhotoCaptionSchema>

// Public text is visible to others. Point out likely contact details so people
// share them on purpose; the hint never blocks saving.
export function contactDetailsHint(text: string) {
  if (/[\w.+-]+@[\w-]+\.[\w.]{2,}/.test(text)) return 'This looks like an email address. Anyone who can see your profile can read it.'
  if (/(?:\+?\d[\s().-]*){7,}/.test(text)) return 'This looks like a phone number. Anyone who can see your profile can read it.'
  if (/(?:^|\s)@[A-Za-z0-9_.]{2,}/.test(text) || /\b(?:insta|instagram|snap|snapchat|tiktok|discord)\b/i.test(text)) return 'This looks like a social handle. Anyone who can see your profile can read it.'
  return ''
}
