import happy from '../../assets/pebble/characters/pebble-happy.png'
import thinking from '../../assets/pebble/characters/pebble-thinking.png'
import currency from '../../assets/pebble/ui/pebble-currency.png'
import build from '../../assets/pebble/ui/build-icon.png'
import geodes from '../../assets/pebble/geodes/geode-progression.png'
import gems from '../../assets/pebble/gems/gem-collection.png'

// Display crops only: original supplied PNGs remain untouched. Ignore faint
// transparent edge noise and normalize the visible artwork, not file dimensions.
export const pebbleAssets = { happy, thinking, currency, build, geodes, gems }
export const characterViewBox = '100 280 1080 830'
export type GemKind = 'rose' | 'amethyst' | 'jade' | 'sapphire' | 'citrine' | 'opal'
export const gemRegions: Record<GemKind, string> = {
  rose: '60 110 460 410', amethyst: '550 110 460 410', jade: '1050 110 460 410',
  sapphire: '60 550 460 410', citrine: '550 550 460 410', opal: '1050 550 460 410',
}
// Four inspected stages: closed, cracked, opening, open. A collected gem follows.
export const geodeRegions = ['10 125 530 510', '550 125 520 510', '1080 125 530 510', '1620 125 552 510'] as const
