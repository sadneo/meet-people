export const datingChoices = {
  intent: ['Long-term relationship', 'Long-term, open to short', 'Short-term, open to long', 'Something casual', 'Still figuring it out'],
  style: ['Monogamy', 'Non-monogamy', 'Exploring my relationship style'],
  gender: ['Woman', 'Man', 'Nonbinary', 'Other'],
  sexuality: ['Straight', 'Gay', 'Lesbian', 'Bisexual', 'Pansexual', 'Asexual', 'Queer', 'Questioning', 'Other'],
}
export type DatingPreferenceDraft = { intent: string; style: string; gender: string; sexuality: string; feet: string; inches: string; showGender: boolean; showSexuality: boolean; showHeight: boolean; clarifiedTargets: string[] }
export const emptyDatingPreferences: DatingPreferenceDraft = { intent: '', style: '', gender: '', sexuality: '', feet: '', inches: '', showGender: false, showSexuality: false, showHeight: true, clarifiedTargets: [] }
export function datingTargets(value: DatingPreferenceDraft): string[] | null {
  if (!value.gender || !value.sexuality) return null
  if (value.sexuality === 'Straight' && value.gender === 'Man') return ['Woman']
  if (value.sexuality === 'Straight' && value.gender === 'Woman') return ['Man']
  if (value.sexuality === 'Gay' && ['Man', 'Woman'].includes(value.gender)) return [value.gender]
  if (value.sexuality === 'Lesbian' && value.gender === 'Woman') return ['Woman']
  // Other combinations are clarified by the owner, never coerced into binary defaults.
  return value.clarifiedTargets.length ? value.clarifiedTargets : null
}
export function validateDatingPreferences(value: DatingPreferenceDraft, previous: DatingPreferenceDraft = emptyDatingPreferences): string {
  if (Object.entries(datingChoices).some(([key, options]) => value[key as keyof typeof datingChoices] !== '' && !options.includes(value[key as keyof typeof datingChoices]) && !(['gender', 'sexuality'].includes(key) && value[key as keyof typeof datingChoices] === previous[key as keyof typeof datingChoices] && Array.from(value[key as keyof typeof datingChoices]).length <= 120))) return 'Choose one of the available options.'
  if (value.clarifiedTargets.some(target => !datingChoices.gender.includes(target) && !previous.clarifiedTargets.includes(target)) || new Set(value.clarifiedTargets).size !== value.clarifiedTargets.length) return 'Choose one of the available matching options.'
  if (value.feet !== '' || value.inches !== '') {
    if (!/^[2-8]$/.test(value.feet) || !/^(?:[0-9]|1[01])$/.test(value.inches)) return 'Choose both feet and inches, or leave both blank.'
  }
  return ''
}
