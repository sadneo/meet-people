// Experimental, versioned defaults. No score is a calibrated probability.
export const friendsConfig = Object.freeze({
  version: 'friends-rules-v1',
  weights: Object.freeze({ interests: 0.40, availability: 0.35, goals: 0.15, distance: 0.10 }),
  neutral: 0.5,
  maxCandidates: 100,
  batchSize: 10,
  maxProjectionCandidates: 30,
  usableOverlapMinutes: 60,
  overlapCapMinutes: 240,
})
