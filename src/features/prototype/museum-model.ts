// Isolated art-direction exhibit, not chat activity or a relationship score.
export const gemFamilies = [
  { id: 'garnet', name: 'Red Garnet', expression: 'Determined', color: '#bb5960' },
  { id: 'sapphire', name: 'Blue Sapphire', expression: 'Wistful', color: '#6497c7' },
  { id: 'emerald', name: 'Green Emerald', expression: 'Content', color: '#70a882' },
  { id: 'citrine', name: 'Yellow Citrine', expression: 'Excited', color: '#e4bb56' },
] as const
export type GemFamily = typeof gemFamilies[number]['id']
export type MineralStage = 0 | 1 | 2 | 3
export type MuseumSpecimen = { id: string; family: GemFamily; name: string; expression: string; stage: MineralStage }
export const mineralStages = ['Color in the cracks', 'Crystal emerging', 'Crystal revealed', 'Expressive gem'] as const
export const museumSide = 4
export const demoMinerals: readonly MuseumSpecimen[] = gemFamilies.flatMap(family =>
  Array.from({ length: museumSide }, (_, stage) => ({ id: `${family.id}-${stage}`, family: family.id, name: family.name, expression: family.expression, stage: stage as MineralStage })),
)
export function museumSlots(specimens: readonly MuseumSpecimen[]) {
  const unique = [...new Map(specimens.map(specimen => [specimen.id, specimen])).values()]
  return Array.from({ length: museumSide * museumSide }, (_, index) => unique[index] ?? null)
}
