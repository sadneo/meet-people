import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import {
  PhotoCaptionsSchema, ProfilePromptsSchema, SavePhotoCaptionSchema, contactDetailsHint, profilePrompts, promptsForMode,
} from '../../shared/profile-prompts'
import { ProfileCustomizationValueSchema, defaultProfileCustomization, sameCustomization } from '../../shared/profile-customization'

it('keeps the prompt catalog identical to the database catalog', () => {
  const sql = readFileSync('supabase/migrations/20261116050000_photo_captions_prompts.sql', 'utf8')
  const json = /select '(\{"study-spot"[^']+\})'::jsonb/.exec(sql)
  expect(json).not.toBeNull()
  expect(JSON.parse(json![1])).toEqual(Object.fromEntries(profilePrompts.map(prompt => [prompt.id, prompt.audience])))
})

it('accepts up to three distinct catalog prompts with trimmed answers', () => {
  expect(ProfilePromptsSchema.safeParse([{ id: 'study-spot', answer: 'Library roof' }]).success).toBe(true)
  for (const bad of [
    [{ id: 'made-up', answer: 'x' }],
    [{ id: 'study-spot', answer: ' padded ' }],
    [{ id: 'study-spot', answer: '' }],
    [{ id: 'study-spot', answer: 'x'.repeat(151) }],
    [{ id: 'study-spot', answer: 'a' }, { id: 'study-spot', answer: 'b' }],
    [{ id: 'study-spot', answer: 'a' }, { id: 'currently', answer: 'b' }, { id: 'proud-of', answer: 'c' }, { id: 'campus-food', answer: 'd' }],
    [{ id: 'study-spot', answer: 'a', extra: true }],
  ]) expect(ProfilePromptsSchema.safeParse(bad).success).toBe(false)
})

it('shows Dating-only prompts only in Dating', () => {
  const prompts = [{ id: 'study-spot', answer: 'Library' }, { id: 'first-date', answer: 'Coffee' }] as const
  expect(promptsForMode([...prompts], 'friends').map(prompt => prompt.id)).toEqual(['study-spot'])
  expect(promptsForMode([...prompts], 'dating').map(prompt => prompt.id)).toEqual(['study-spot', 'first-date'])
})

it('treats a missing prompts list as empty when comparing saved choices', () => {
  const { prompts, ...earlier } = defaultProfileCustomization
  void prompts
  expect(ProfileCustomizationValueSchema.safeParse(earlier).success).toBe(true)
  expect(sameCustomization(earlier, defaultProfileCustomization)).toBe(true)
  expect(sameCustomization(defaultProfileCustomization, { ...defaultProfileCustomization, prompts: [{ id: 'study-spot', answer: 'Library' }] })).toBe(false)
})

it('validates captions and points out contact details without blocking', () => {
  expect(SavePhotoCaptionSchema.safeParse({ expectedRevision: 2, position: 1, caption: '' }).success).toBe(true)
  expect(SavePhotoCaptionSchema.safeParse({ expectedRevision: 2, position: 5, caption: 'x' }).success).toBe(false)
  expect(SavePhotoCaptionSchema.safeParse({ expectedRevision: 2, position: 1, caption: 'x'.repeat(41) }).success).toBe(false)
  expect(SavePhotoCaptionSchema.safeParse({ expectedRevision: 2, position: 1, caption: 'x'.repeat(40) }).success).toBe(true)
  expect(PhotoCaptionsSchema.safeParse({ revision: 2, captions: ['Hike', null] }).success).toBe(true)
  expect(contactDetailsHint('Email me at sam@example.com')).toMatch(/email/)
  expect(contactDetailsHint('Text 631-555-0199')).toMatch(/phone/)
  expect(contactDetailsHint('Find me @sam_k on insta')).toMatch(/social/)
  expect(contactDetailsHint('Third floor of the library')).toBe('')
})

it('allows three prompts per mode and keeps Dating-only questions in Dating', () => {
  const six = [
    { id: 'study-spot', answer: 'a', audience: 'friends' }, { id: 'ask-me-about', answer: 'b', audience: 'friends' }, { id: 'currently', answer: 'c', audience: 'friends' },
    { id: 'first-date', answer: 'd' }, { id: 'green-flag', answer: 'e' }, { id: 'looking-for', answer: 'f' },
  ]
  expect(ProfilePromptsSchema.safeParse(six).success).toBe(true)
  expect(ProfilePromptsSchema.safeParse([...six.slice(0, 3), { id: 'proud-of', answer: 'g', audience: 'friends' }]).success).toBe(false)
  expect(ProfilePromptsSchema.safeParse([{ id: 'first-date', answer: 'x', audience: 'friends' }]).success).toBe(false)
  expect(ProfilePromptsSchema.safeParse([{ id: 'first-date', answer: 'x', audience: 'both' }]).success).toBe(false)
  const parsed = ProfilePromptsSchema.parse(six)
  expect(promptsForMode(parsed, 'friends').map(prompt => prompt.id)).toEqual(['study-spot', 'ask-me-about', 'currently'])
  expect(promptsForMode(parsed, 'dating').map(prompt => prompt.id)).toEqual(['first-date', 'green-flag', 'looking-for'])
})
