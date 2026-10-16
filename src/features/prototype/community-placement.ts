import type { MovableUpgradeId, UpgradeId } from './economy'

export type Position = { x: number; y: number }
export type MovableId = MovableUpgradeId | 'pebble' | 'friend' | 'friend-two' | 'base-bench' | 'base-cottage'
export type Positions = Partial<Record<MovableId, Position>>
// Ground-contact points in the reference island's 1448 × 1086 coordinates.
export const defaultPlacements: Record<MovableId, [number, number, number]> = {
  pebble: [706, 673, 100], friend: [879, 741, 82], 'friend-two': [638, 744, 70],
  'base-bench': [909, 671, 180], 'base-cottage': [550, 483, 310],
  flowers: [275, 650, 105], bench: [540, 840, 145], lanterns: [1030, 790, 100],
  picnic: [760, 873, 135], bridge: [1066, 628, 145], garden: [935, 830, 115],
  cafe: [260, 575, 145], stage: [886, 416, 155], cottage: [970, 420, 150], hall: [638, 380, 170],
  garnet: [475, 651, 92], sapphire: [793, 777, 92], emerald: [788, 491, 92], citrine: [626, 827, 92],
}
const river = [[978, 394], [925, 435], [1008, 482], [980, 535], [1005, 568], [1060, 620], [1150, 688]]
function onRiver({ x, y }: Position) {
  return river.slice(1).some(([bx, by], i) => {
    const [ax, ay] = river[i], dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) < 47
  })
}
export function validPlacement(point: Position, id: MovableId): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
  const u = ((point.y - 250) / 340 + (point.x - 724) / 630) / 2
  const v = ((point.y - 250) / 340 - (point.x - 724) / 630) / 2
  const margin = .045 + defaultPlacements[id][2] / 4500
  return u >= margin && v >= margin && u <= 1 - margin && v <= 1 - margin &&
    (id === 'bridge' || !onRiver(point)) &&
    ![[795, 350], [333, 525], [1166, 560], [512, 790]].some(([x, y]) => Math.hypot(point.x - x, point.y - y) < 40)
}
export function constrainPlacement(point: Position, id: MovableId): Position {
  const [x, y] = defaultPlacements[id]
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return { x, y }
  // A light 12px ground grid, with nearest-land fallback for water/edge drops.
  const snap = { x: Math.round(point.x / 12) * 12, y: Math.round(point.y / 12) * 12 }
  if (validPlacement(snap, id)) return snap
  let nearest = { x, y }, distance = Infinity
  for (let py = 300; py <= 900; py += 12) for (let px = 180; px <= 1280; px += 12) {
    const candidate = { x: px, y: py }
    const d = (px - point.x) ** 2 + (py - point.y) ** 2
    if (d < distance && validPlacement(candidate, id)) { nearest = candidate; distance = d }
  }
  return nearest
}
export function parsePositions(value: unknown, owned: UpgradeId[]): Positions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Positions = {}
  for (const [id, point] of Object.entries(value)) {
    if (!Object.hasOwn(defaultPlacements, id) || (!['pebble', 'friend', 'friend-two', 'base-bench', 'base-cottage'].includes(id) && !owned.includes(id as UpgradeId))) continue
    if (!point || typeof point !== 'object' || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    result[id as MovableId] = constrainPlacement(point, id as MovableId)
  }
  return result
}
