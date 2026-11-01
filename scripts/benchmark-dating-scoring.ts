import { performance } from 'node:perf_hooks'
import { cpus, totalmem } from 'node:os'
import { rankDatingPool, type DatingScoringPool } from '../api/matching/dating-scoring.js'

// CPU microbenchmark only: no database, network, real accounts or Gemini calls.
const population = Array.from({ length: 10_000 }, (_, index) => ({
  id: `b0000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  interests: ['Coffee', `Activity ${index % 100}`, 'Board games'],
  intention: 'Long-term, open to short' as const,
  intervals: [{ start: '2026-10-28T17:00:00Z', end: '2026-10-28T19:00:00Z' }],
}))
const pools: DatingScoringPool[] = population.slice(0, 1000).map((viewer, index) => ({
  viewer: { interests: viewer.interests, intention: viewer.intention, intervals: viewer.intervals },
  candidates: Array.from({ length: 100 }, (_, offset) => {
    const peer = population[(index + offset + 1) % population.length]
    return { ...peer, distanceMiles: offset / 10, viewerRadiusMiles: 15, candidateRadiusMiles: 15 }
  }),
}))
for (const pool of pools.slice(0, 100)) rankDatingPool(pool)
const latency: number[] = []
const started = performance.now()
for (const pool of pools) {
  const start = performance.now()
  const result = rankDatingPool(pool)
  if (result.length !== 100 || !Number.isFinite(result[0].score)) throw new Error('Invalid benchmark result')
  latency.push(performance.now() - start)
}
const duration = performance.now() - started
latency.sort((a, b) => a - b)
console.log(JSON.stringify({
  kind: 'scorer CPU microbenchmark; not an API/database load test',
  node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length,
  hostRamGiB: Math.round(totalmem() / 1024 ** 3),
  syntheticPopulation: population.length, candidatePoolSize: 100, requests: pools.length,
  concurrency: 1, durationMs: Math.round(duration),
  p50Ms: latency[Math.floor(latency.length * 0.5)], p95Ms: latency[Math.floor(latency.length * 0.95)],
  p99Ms: latency[Math.floor(latency.length * 0.99)],
  databaseQueries: 0, providerCalls: 0,
}, null, 2))
