import { performance } from 'node:perf_hooks'
import { cpus, totalmem } from 'node:os'
import { rankFriendsPool, type FriendsScoringPool } from '../api/matching/friends-scoring.js'

// Scorer CPU microbenchmark. No database, API, accounts or provider traffic.
const population = Array.from({ length: 10_000 }, (_, index) => ({
  id: `f0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  interests: ['Coffee', `Activity ${index % 100}`, 'Board games'],
  goals: index % 2 ? ['Study buddies', 'Activity partners'] : ['Activity partners'],
  intervals: [{ start: '2026-10-28T17:00:00Z', end: '2026-10-28T19:00:00Z' }],
}))
const pools: FriendsScoringPool[] = population.slice(0, 1000).map((viewer, index) => ({
  viewer: { interests: viewer.interests, goals: viewer.goals, intervals: viewer.intervals },
  candidates: Array.from({ length: 100 }, (_, offset) => ({
    ...population[(index + offset + 1) % population.length],
    distanceMiles: offset / 10, viewerRadiusMiles: 15, candidateRadiusMiles: 15,
  })),
}))
for (const pool of pools.slice(0, 100)) rankFriendsPool(pool)
const latencies: number[] = [], started = performance.now()
for (const pool of pools) {
  const start = performance.now(), ranked = rankFriendsPool(pool)
  if (ranked.length !== 100 || !Number.isFinite(ranked[0].score)) throw new Error('Invalid benchmark result')
  latencies.push(performance.now() - start)
}
const durationMs = performance.now() - started
latencies.sort((a, b) => a - b)
console.log(JSON.stringify({
  kind: 'Friends scorer CPU microbenchmark; not an API/database load test',
  node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length,
  hostRamGiB: Math.round(totalmem() / 1024 ** 3), syntheticPopulation: population.length,
  candidatePoolSize: 100, requests: pools.length, concurrency: 1,
  durationMs: Math.round(durationMs), p50Ms: latencies[500], p95Ms: latencies[950], p99Ms: latencies[990],
  databaseQueries: 0, providerCalls: 0,
}, null, 2))
