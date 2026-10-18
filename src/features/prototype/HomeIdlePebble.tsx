import { PixelPebble } from '../pebble-art/PixelArt'
import { characterViewBox, pebbleAssets } from '../pebble-art/assets'

// Home-only presentation: the existing refresh state still selects thinking.
export function HomeIdlePebble({ thinking }: { thinking: boolean }) {
  if (thinking) return <PixelPebble thinking />
  return <svg className="pt-pebble pt-pixel-art pt-pixel-pebble" viewBox={characterViewBox} aria-hidden="true" data-expression="happy">
    {[
      { name: 'normal', x: 0, y: 0, width: 1254, height: 1254 },
      { name: 'compressed', x: -4, y: 8, width: 1262, height: 1246 },
      { name: 'stretched', x: 4, y: -8, width: 1246, height: 1262 },
    ].map(pose => <svg key={pose.name} className="pt-home-idle-frame" data-home-pose={pose.name}
      x={pose.x} y={pose.y} width={pose.width} height={pose.height} viewBox="0 0 1254 1254" preserveAspectRatio="none">
      <image href={pebbleAssets.happy} width="1254" height="1254" />
    </svg>)}
  </svg>
}
