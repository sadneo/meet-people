export const activeFriendsConfig = Object.freeze({
  version: 'active-friends-fifo-v1', maxPeople: 100, maxUnits: 50, maxGroupSize: 9,
  beamWidth: 8, maxExpansions: 512, waitBandSeconds: 30,
  // The database supplies these initial policy values with every leased job.
  preferredSizeGraceSeconds: 30, minimumOverlapMinutes: 60, reviewSeconds: 300,
  workerMaxCycles: 10, workerBudgetMs: 20_000,
})
