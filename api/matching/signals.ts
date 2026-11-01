import { z } from 'zod'

export const UtcIntervalSchema = z.object({ start: z.iso.datetime({ offset: true }), end: z.iso.datetime({ offset: true }) }).strict()
  .refine(value => Date.parse(value.start) < Date.parse(value.end), 'Positive interval required.')
export const ScoringIntervalsSchema = z.array(UtcIntervalSchema).max(168).nullable()
type Intervals = z.infer<typeof ScoringIntervalsSchema>
type Span = readonly [number, number]

function merged(values: NonNullable<Intervals>): Span[] {
  const ordered = values.map(value => [Date.parse(value.start), Date.parse(value.end)] as Span).sort((a, b) => a[0] - b[0])
  const result: [number, number][] = []
  for (const [start, end] of ordered) {
    const previous = result.at(-1)
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end)
    else result.push([start, end])
  }
  return result
}

export function continuousAvailabilityScore(a: Intervals, b: Intervals, minimumMinutes: number, capMinutes: number) {
  if (a === null || b === null) return { score: null, usableMinutes: 0 }
  const left = merged(a), right = merged(b)
  let i = 0, j = 0, usableMinutes = 0
  while (i < left.length && j < right.length) {
    const duration = (Math.min(left[i][1], right[j][1]) - Math.max(left[i][0], right[j][0])) / 60_000
    if (duration >= minimumMinutes) usableMinutes += duration
    if (left[i][1] <= right[j][1]) i++; else j++
  }
  return { score: Math.min(1, usableMinutes / capMinutes), usableMinutes }
}

export function reciprocalDistanceScore(distance: number, radiusA: number, radiusB: number) {
  return Math.sqrt(Math.max(0, 1 - distance / radiusA) * Math.max(0, 1 - distance / radiusB))
}
