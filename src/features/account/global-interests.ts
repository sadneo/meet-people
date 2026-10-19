// One frontend catalogue and the existing shared profile contract. Custom saved
// labels remain exact (including case/newlines); never silently rewrite them.
export const globalInterestChoices = ['Coffee', 'Art', 'Music', 'Outdoors', 'Food', 'Gaming', 'Photography', 'Movies', 'Fitness', 'Study', 'Sports']
export const interestLimit = 30
export const interestLabelLimit = 120
export function interestAdditionProblem(raw: string, selected: string[]) {
  const label = raw.trim()
  if (!label) return 'Enter an interest, not just spaces.'
  if (label.length > interestLabelLimit) return `Use ${interestLabelLimit} characters or fewer.`
  if (selected.includes(label)) return 'That interest is already selected.'
  if (selected.length >= interestLimit) return `Choose up to ${interestLimit} interests. Remove one first.`
  return ''
}
