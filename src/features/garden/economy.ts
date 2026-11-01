import { geodeRocks, isGeode, type GeodeId } from './geodes'
import { parsePositions, type Positions } from './community-placement'
export const landscapeUpgrades = [
  { id: 'river', name: 'River', cost: 80 },
  { id: 'tree-cluster', name: 'Tree Cluster', cost: 60 },
  { id: 'walkway', name: 'Walkway', cost: 45 },
  { id: 'flower-meadow', name: 'Flower Meadow', cost: 25 },
  { id: 'shrubs', name: 'Shrub Patch', cost: 30 },
  { id: 'rock-formation', name: 'Rock Formation', cost: 35 },
  { id: 'grass-detail', name: 'Grass Details', cost: 20 },
] as const
export type LandscapeId = typeof landscapeUpgrades[number]['id']
export function isLandscapeUpgrade(id: UpgradeId): id is LandscapeId {
  return landscapeUpgrades.some(item => item.id === id)
}
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
  { id: 'garnet', name: 'Garnet', cost: 300, icon: 'profile', detail: 'A little fiery determination.' },
  { id: 'sapphire', name: 'Sapphire', cost: 300, icon: 'profile', detail: 'A wistful blue companion.' },
  { id: 'emerald', name: 'Emerald', cost: 300, icon: 'profile', detail: 'A quietly content companion.' },
  { id: 'citrine', name: 'Citrine', cost: 300, icon: 'profile', detail: 'A sunny burst of excitement.' },
  ...landscapeUpgrades,
  ...geodeRocks.map(rock => ({ id: rock.id, name: rock.name, cost: 0 })),
] as const
export type UpgradeId = typeof upgrades[number]['id']
export type MovableUpgradeId = Exclude<UpgradeId, LandscapeId>
export type Community = { balance: number; owned: UpgradeId[]; earnedChapters: number[]; positions?: Positions; purchaseCosts?: Partial<Record<UpgradeId, number>>; freshStart?: boolean; geodeUnlocks?: GeodeId[] }
export const COMMUNITY_STORAGE_KEY = 'pebble:full-ui:community:v1'
export const emptyCommunity: Community = { balance: 0, owned: [], earnedChapters: [] }

export function parseCommunity(raw: string | null): Community {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object') return { ...emptyCommunity }
    const saved = value as Partial<Community>
    if (!Number.isSafeInteger(saved.balance) || saved.balance! < 0 || !Array.isArray(saved.owned) || !Array.isArray(saved.earnedChapters)) return { ...emptyCommunity }
    const geodeUnlocks = [...new Set((Array.isArray(saved.geodeUnlocks) ? saved.geodeUnlocks : []).filter(isGeode))]
    const owned = [...new Set(saved.owned.filter(id => upgrades.some(upgrade => upgrade.id === id) && (!isGeode(id) || geodeUnlocks.includes(id))))]
    const purchaseCosts: Partial<Record<UpgradeId, number>> = {}
    if (saved.purchaseCosts && typeof saved.purchaseCosts === 'object') {
      for (const id of owned) {
        const paid = saved.purchaseCosts[id]
        if (!isGeode(id) && typeof paid === 'number' && Number.isSafeInteger(paid) && paid >= 0 && paid <= 1_000_000) purchaseCosts[id] = paid
      }
    }
    // A balance plus its refundable purchases must remain an exact safe integer.
    if (!Number.isSafeInteger(saved.balance! + purchaseRefund({ ...emptyCommunity, owned, purchaseCosts }))) return { ...emptyCommunity }
    return {
      balance: saved.balance!,
      owned,
      ...(saved.geodeUnlocks ? { geodeUnlocks } : {}),
      ...(saved.freshStart === true ? { freshStart: true } : {}),
      ...(saved.purchaseCosts ? { purchaseCosts } : {}),
      ...(saved.positions ? { positions: parsePositions(saved.positions, owned) } : {}),
      earnedChapters: [...new Set(saved.earnedChapters.filter(id => Number.isInteger(id) && id >= 0 && id < 4))],
    }
  } catch { return { ...emptyCommunity } }
}
export function loadCommunity(key = COMMUNITY_STORAGE_KEY): Community {
  try { return parseCommunity(localStorage.getItem(key)) } catch { return { ...emptyCommunity } }
}
export function purchase(community: Community, id: UpgradeId): Community {
  const upgrade = upgrades.find(item => item.id === id)
  if (!upgrade || (isGeode(id) && !community.geodeUnlocks?.includes(id)) || community.owned.includes(id) || community.balance < upgrade.cost) return community
  return { ...community, balance: community.balance - upgrade.cost, owned: [...community.owned, id], purchaseCosts: { ...community.purchaseCosts, [id]: upgrade.cost } }
}

// Legacy saves have ownership only. Catalog prices have not changed, so use them
// for those purchases; new purchases retain their actual deducted amount.
export function purchaseRefund(community: Community): number {
  return [...new Set(community.owned)].reduce((sum, id) => {
    const item = upgrades.find(upgrade => upgrade.id === id)
    return item && !isGeode(id) ? sum + (community.purchaseCosts?.[id] ?? item.cost) : sum
  }, 0)
}
export function resetPurchases(community: Community): Community {
  if (community.freshStart && !community.owned.length && !Object.keys(community.positions ?? {}).length) return community
  return { ...community, balance: community.balance + purchaseRefund(community), owned: [], purchaseCosts: {}, positions: {}, freshStart: true }
}

export const buildSections = [
  { name: 'Landscape', icon: 'landscape', items: landscapeUpgrades },
  { name: 'Buildings', icon: 'building', items: upgrades.filter(item => ['cottage', 'hall'].includes(item.id)) },
  { name: 'Decorations', icon: 'flower', items: upgrades.filter(item => !isLandscapeUpgrade(item.id) && !isGeode(item.id) && !['garnet', 'sapphire', 'emerald', 'citrine', 'cottage', 'hall'].includes(item.id)) },
  { name: 'Rare Pebbles', icon: 'gem', items: upgrades.filter(item => ['garnet', 'sapphire', 'emerald', 'citrine'].includes(item.id)) },
]

export function openGeode(community: Community, random: number): Community {
  const remaining = geodeRocks.filter(rock => !community.geodeUnlocks?.includes(rock.id))
  if (community.balance < 300 || !remaining.length || !Number.isFinite(random) || random < 0 || random >= 1) return community
  const rock = remaining[Math.floor(random * remaining.length)]
  return { ...community, balance: community.balance - 300, geodeUnlocks: [...(community.geodeUnlocks ?? []), rock.id] }
}
export function removeGardenItem(community: Community, id: UpgradeId): Community {
  if (!community.owned.includes(id)) return community
  const refund = purchaseRefund({ ...community, owned: [id] })
  const positions = { ...community.positions }, purchaseCosts = { ...community.purchaseCosts }
  delete positions[id as keyof typeof positions]; delete purchaseCosts[id]
  return { ...community, balance: community.balance + refund, owned: community.owned.filter(item => item !== id), positions, purchaseCosts }
}
