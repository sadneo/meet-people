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
