import { performance } from 'node:perf_hooks'
import { cpus, totalmem } from 'node:os'
import { chooseActiveGroup, type ActivePool } from '../api/matching/active-search.js'
const id = (n: number) => `ab000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = Date.parse('2026-10-28T09:00:00Z')
const intervals = Array.from({ length: 14 }, (_, day) => ({ start: new Date(now + day * 86400_000 + 8 * 3600_000).toISOString(), end: new Date(now + day * 86400_000 + 11 * 3600_000).toISOString() }))
const population = Array.from({ length: 10_000 }, (_, n) => ({ id: id(n + 1), age: 24, ageMin: 18, ageMax: 40, latitude: 0, longitude: 0, radiusMiles: 10,
  interests: ['Coffee', `Activity ${n % 50}`, 'Boardgames'], goals: ['Activity partners'], blockedIds: [], intervals }))
function sample(offset: number): ActivePool {
  const units = population.slice(offset, offset + 50).map((member, n) => ({ id: id(20_000 + offset + n), groupId: null, queuedAt: new Date(now - 1000_000 + n * 2000).toISOString(),
    preferredSize: 4, minimumSize: 2, maximumSize: 9, allowExistingGroups: true, members: [member] }))
  return { algorithmVersion: 'active-friends-fifo-v1', unitId: units[0].id, leaseToken: id(99_999), now: new Date(now).toISOString(), preferredSizeGraceSeconds: 30, minimumOverlapMinutes: 60, units, areas: [{ id: id(90_000), latitude: 0, longitude: 0 }] }
}
for (let n = 0; n < 5; n++) chooseActiveGroup(sample(n))
const latency: number[] = [], started = performance.now()
for (let n = 0; n < 50; n++) {
  const pool = sample(n * 50), begin = performance.now(), result = chooseActiveGroup(pool)
  if (!result || result.unitIds.length < 2) throw new Error('No feasible synthetic proposal')
  latency.push(performance.now() - begin)
}
const durationMs = performance.now() - started
latency.sort((a, b) => a - b)
console.log(JSON.stringify({ kind: 'Active search CPU microbenchmark; not HTTP/database load', syntheticPopulation: population.length, unitsPerPool: 50, availabilityIntervalsPerPerson: 14,
  requests: latency.length, concurrency: 1, cpu: cpus()[0]?.model, logicalCpus: cpus().length, ramGiB: Math.round(totalmem() / 1024 ** 3), node: process.version,
  durationMs, p50Ms: latency[25], p95Ms: latency[47], maxMs: latency.at(-1), providerCalls: 0, databaseQueries: 0 }, null, 2))
