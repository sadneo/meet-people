import { characterViewBox, gemRegions, geodeRegions, pebbleAssets, type GemKind } from './assets'
import './pixel-art.css'

export function PixelPebble({ thinking = false, className = '' }: { thinking?: boolean; className?: string }) {
  return <svg className={`pt-pebble pt-pixel-art pt-pixel-pebble ${className}`} viewBox={characterViewBox} aria-hidden="true" data-expression={thinking ? 'thinking' : 'happy'}>
    <image className="pt-expression-image" href={pebbleAssets.happy} width="1254" height="1254" opacity={thinking ? 0 : 1} />
    <image className="pt-expression-image" href={pebbleAssets.thinking} width="1254" height="1254" opacity={thinking ? 1 : 0} />
  </svg>
}
export function CurrencyIcon() {
  return <svg className="pt-pixel-art pt-currency-art" viewBox="270 320 720 660" aria-hidden="true"><image href={pebbleAssets.currency} width="1254" height="1254" /></svg>
}
export function BuildIcon() {
  return <svg className="pt-pixel-art" viewBox="280 235 825 865" aria-hidden="true"><image href={pebbleAssets.build} width="1254" height="1254" /></svg>
}
export function MineralSprite({ stage, gem }: { stage: 0 | 1 | 2 | 3 | 4; gem: GemKind }) {
  return <svg className="pt-pixel-art pt-mineral-sprite" viewBox={stage === 4 ? gemRegions[gem] : geodeRegions[stage]} aria-hidden="true">
    <image href={stage === 4 ? pebbleAssets.gems : pebbleAssets.geodes} width={stage === 4 ? 1536 : 2172} height={stage === 4 ? 1024 : 724} />
  </svg>
}
