import { geodeRocks, isGeode } from './geodes'
import { isLandscapeUpgrade, upgrades, type UpgradeId } from './economy'

// Items that can stand alone on a profile card: everyone's Pebble plus any
// owned item that can be moved around the Garden.
export function gardenItemName(id: string) {
  if (id === 'pebble') return 'Your Pebble'
  return geodeRocks.find(rock => rock.id === id)?.name ?? upgrades.find(item => item.id === id)?.name ?? 'Garden item'
}
export function showcaseChoices(owned: readonly string[]) {
  return ['pebble', ...owned.filter(id => isGeode(id) || !isLandscapeUpgrade(id as UpgradeId))]
}
