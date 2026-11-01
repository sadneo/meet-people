import type { GardenState } from './garden.js'

// Local creative progress survives navigation, but never an identity change or reload.
const gardens = new Map<string, GardenState>()
export function gardenFor(owner: string): GardenState {
  let state = gardens.get(owner)
  if (!state) {
    state = { balance: 240, decor: [], day: 6, connections: [], blocked: [], removedConnections: [] }
    gardens.set(owner, state)
  }
  return state
}
export function retainGardenFor(owner: string | null) {
  for (const key of gardens.keys()) if (key !== owner) gardens.delete(key)
}
