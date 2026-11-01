// Versioned, deliberately curated equivalences. Broad topics and subtopics stay
// distinct; spelling proximity alone is never a reason to merge two interests.
export const interestAliasVersion = 'v1'
export const interestAliases: Readonly<Record<string, string>> = Object.freeze({
  'boardgames': 'board games',
  'board-games': 'board games',
  'sci-fi': 'science fiction',
  'sci fi': 'science fiction',
})

export function normalizedInterest(label: string): string {
  return label.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

export function canonicalInterest(label: string): string {
  const normalized = normalizedInterest(label)
  return Object.hasOwn(interestAliases, normalized) ? interestAliases[normalized] : normalized
}

export function interestSimilarity(a: readonly string[], b: readonly string[]) {
  const left = new Set(a.map(canonicalInterest).filter(Boolean))
  const right = new Set(b.map(canonicalInterest).filter(Boolean))
  const shared = [...left].filter(topic => right.has(topic))
  const union = new Set([...left, ...right]).size
  return { score: union ? shared.length / union : null, sharedCount: shared.length }
}

// Canonical catalogue for picker choices and server-side write validation.
// Labels remain exact; custom interests are never silently rewritten.
export const globalInterestChoices = ['Coffee', 'Art', 'Music', 'Outdoors', 'Food', 'Gaming', 'Photography', 'Movies', 'Fitness', 'Study', 'Sports'];
export const interestLimit = 5;
export const customInterestLimit = 2;
export const interestLabelLimit = 120;
export function isProvidedInterest(label: string) { return globalInterestChoices.includes(label); }
export function interestCounts(selected: string[]) {
  const unique = [...new Set(selected)];
  const provided = unique.filter(isProvidedInterest).length;
  return { provided, custom: unique.length - provided };
}
export function interestSelectionProblem(selected: string[], requireMinimum = true) {
  if (selected.length > interestLimit) return 'Choose up to 5 interests.';
  const labels = selected.map(label => label.trim());
  if (labels.some(label => !label || label.length > interestLabelLimit)) return 'Use an interest between 1 and 120 characters.';
  if (new Set(labels).size !== labels.length) return 'Choose unique interests.';
  const counts = interestCounts(labels);
  if (counts.custom > customInterestLimit) return 'Choose up to 2 custom interests.';
  if (requireMinimum && labels.length < 1) return 'Choose at least one interest.';
  return '';
}
export function interestAdditionProblem(raw: string, selected: string[]) {
  const label = raw.trim();
  if (!label) return 'Enter an interest, not just spaces.';
  if (label.length > interestLabelLimit) return `Use ${interestLabelLimit} characters or fewer.`;
  if (selected.includes(label)) return 'That interest is already selected.';
  if (selected.length >= interestLimit) return 'Choose up to 5 interests. Remove one first.';
  if (!isProvidedInterest(label) && interestCounts(selected).custom >= customInterestLimit) return 'Choose up to 2 custom interests. Remove one first.';
  return '';
}
