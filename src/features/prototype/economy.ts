// Review-only prices. Kept in one catalog so the team can tune them together.
export const upgrades = [
  { id: 'flowers', name: 'Wildflower Patch', cost: 10, icon: 'tree', detail: 'Little clusters of color in the grass.' },
  { id: 'bench', name: 'Garden Bench', cost: 15, icon: 'book', detail: 'A quiet seat for a little company.' },
  { id: 'lanterns', name: 'Path Lanterns', cost: 20, icon: 'events', detail: 'A warm glow along the main path.' },
  { id: 'picnic', name: 'Picnic Spot', cost: 25, icon: 'food', detail: 'A blanket, a table, and room for friends.' },
  { id: 'bridge', name: 'Footbridge', cost: 30, icon: 'pin', detail: 'A wooden crossing over the stream.' },
  { id: 'garden', name: 'Community Garden', cost: 40, icon: 'tree', detail: 'Shared beds of flowers and vegetables.' },
  { id: 'cafe', name: 'Café Cart', cost: 55, icon: 'coffee', detail: 'A tiny cart for a shared coffee break.' },
  { id: 'stage', name: 'Music Stage', cost: 70, icon: 'music', detail: 'A place to play, listen, and gather.' },
  { id: 'cottage', name: 'Cottage Expansion', cost: 90, icon: 'profile', detail: 'Another wing for your first cottage.' },
  { id: 'hall', name: 'Community Hall', cost: 120, icon: 'people', detail: 'A bigger home for the whole community.' },
] as const
export type UpgradeId = typeof upgrades[number]['id']
export type Community = { balance: number; owned: UpgradeId[]; earnedChapters: number[] }
export const COMMUNITY_STORAGE_KEY = 'pebble:full-ui:community:v1'
export const emptyCommunity: Community = { balance: 0, owned: [], earnedChapters: [] }

export function parseCommunity(raw: string | null): Community {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object') return { ...emptyCommunity }
    const saved = value as Partial<Community>
    if (!Number.isSafeInteger(saved.balance) || saved.balance! < 0 || saved.balance! > 1_000_000 || !Array.isArray(saved.owned) || !Array.isArray(saved.earnedChapters)) return { ...emptyCommunity }
    return {
      balance: saved.balance!,
      owned: [...new Set(saved.owned.filter(id => upgrades.some(upgrade => upgrade.id === id)))],
      earnedChapters: [...new Set(saved.earnedChapters.filter(id => Number.isInteger(id) && id >= 0 && id < 4))],
    }
  } catch { return { ...emptyCommunity } }
}
export function loadCommunity(): Community {
  try { return parseCommunity(localStorage.getItem(COMMUNITY_STORAGE_KEY)) } catch { return { ...emptyCommunity } }
}
export function purchase(community: Community, id: UpgradeId): Community {
  const upgrade = upgrades.find(item => item.id === id)
  if (!upgrade || community.owned.includes(id) || community.balance < upgrade.cost) return community
  return { ...community, balance: community.balance - upgrade.cost, owned: [...community.owned, id] }
}
