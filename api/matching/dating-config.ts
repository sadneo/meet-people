// Starting hypotheses, not calibrated probabilities. Version every change.
export const datingConfig = Object.freeze({
  version: 'dating-rules-v1',
  weights: Object.freeze({ intention: 0.35, interests: 0.30, availability: 0.20, distance: 0.15 }),
  neutral: 0.5,
  maxCandidates: 100,
  horizonDays: 14,
  usableOverlapMinutes: 60,
  overlapCapMinutes: 240,
})
