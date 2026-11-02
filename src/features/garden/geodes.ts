// The prototype's collection rules, backed only by the existing local Garden economy.
export const geodeRocks = [
  { id: 'amethyst', name: 'Amethyst', mood: 'Sleepy', description: 'A little lavender daydream.' },
  { id: 'rose-quartz', name: 'Rose Quartz', mood: 'Bashful', description: 'A soft pink stone warming up to you.' },
  { id: 'aquamarine', name: 'Aquamarine', mood: 'Surprised', description: 'Every small discovery is a big delight.' },
  { id: 'pyrite', name: 'Pyrite', mood: 'Confident', description: 'A golden little rock with plenty of swagger.' },
] as const
export type GeodeId = typeof geodeRocks[number]['id']
export const isGeode = (id: string): id is GeodeId => geodeRocks.some(rock => rock.id === id)
export const geodeImage = (id: string) => `/garden/geodes/${id}.png`
