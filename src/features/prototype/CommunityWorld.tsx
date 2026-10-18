import { useId, useRef, useState, type PointerEvent } from 'react'
import { constrainPlacement, defaultPlacements, type MovableId, type Position, type Positions } from './community-placement'
import landscape from '../../assets/pebble/community/village-landscape.png'
import rarePebbles from '../../assets/pebble/community/expressive-pebbles.png'
import { isLandscapeUpgrade, type MovableUpgradeId, type UpgradeId } from './economy'
import { landscapeRegions, landscapeTrees as trees } from './community-landscape'
import village from '../../assets/pebble/community/community-village.png'
import emptyIsland from '../../assets/pebble/community/village-empty.png'
import props from '../../assets/pebble/community/village-props.png'
import './village-art.css'
import { GrassBreeze, TreeBreeze } from './CommunityBreeze'

// Measured sprite bounds, rather than equal cells: the generated sheet has
// uneven margins. Both Build previews and placed objects use these same crops.
const crops = {
  tree: [85, 105, 255, 260], pebble: [455, 155, 175, 170],
  flowers: [715, 140, 325, 220], bench: [1080, 145, 310, 200],
  lanterns: [65, 408, 255, 250], picnic: [370, 425, 325, 235],
  bridge: [715, 420, 335, 270], garden: [1070, 410, 335, 265],
  cafe: [45, 697, 300, 310], stage: [365, 720, 335, 288],
  cottage: [695, 705, 330, 300], hall: [1025, 705, 398, 300],
  garnet: [7, 179, 528, 463], sapphire: [561, 179, 500, 463], emerald: [1093, 176, 518, 466], citrine: [1646, 172, 518, 470],
} satisfies Record<string, [number, number, number, number]>
type SpriteId = keyof typeof crops
const isRare = (id: string) => ['garnet', 'sapphire', 'emerald', 'citrine'].includes(id)

function Sprite({ id, x, y, width, idle = false }: { id: SpriteId; x: number; y: number; width: number; idle?: boolean }) {
  const crop = crops[id]
  const height = idle ? Math.round(width * crop[3] / crop[2]) : width * crop[3] / crop[2]
  if (idle) {
    // Three independently painted, nearest-neighbor frames. Only visibility
    // changes: never transform a composited PNG or interpolate SVG geometry.
    const quiet = id === 'garnet' || id === 'emerald'
    const widen = isRare(id) && id !== 'citrine' ? 2 : 4
    const poses = [
      { name: 'normal', width, height },
      { name: 'compressed', width: width + widen, height: height - (quiet ? 2 : 3) },
      { name: 'stretched', width: width - 2, height: height + (id === 'sapphire' ? 1 : quiet ? 2 : 3) },
    ]
    return <>{poses.map(pose => <svg key={pose.name} className="pt-idle-frame" data-idle-pose={pose.name}
      x={Math.round(x - pose.width / 2)} y={Math.round(y - pose.height)} width={pose.width} height={pose.height}
      viewBox={crop.join(' ')} preserveAspectRatio="none" aria-hidden="true">
      <image href={isRare(id) ? rarePebbles : props} width={isRare(id) ? 2172 : 1448} height={isRare(id) ? 724 : 1086} />
    </svg>)}</>
  }
  return <svg x={x - width / 2} y={y - height} width={width} height={height} viewBox={crop.join(' ')} aria-hidden="true">
    <image href={isRare(id) ? rarePebbles : props} width={isRare(id) ? 2172 : 1448} height={isRare(id) ? 724 : 1086} />
  </svg>
}

export function UpgradePicture({ id }: { id: UpgradeId }) {
  const previewId = useId()
  if (isLandscapeUpgrade(id)) {
    const crop = id === 'tree-cluster' ? [687, 140, 215, 220] : landscapeRegions[id].crop
    const outline = id === 'tree-cluster' ? trees[0].outline : landscapeRegions[id].outline
    return <svg className="pt-upgrade-picture pt-village-art" viewBox={crop.join(' ')} aria-hidden="true">
      <defs><clipPath id={previewId}><path d={outline} /></clipPath></defs>
      <image clipPath={`url(#${previewId})`} href={landscape} width="1448" height="1086" />
    </svg>
  }
  return <svg className="pt-upgrade-picture pt-village-art" viewBox="0 0 180 150" aria-hidden="true"><Sprite id={id} x={90} y={140} width={125} /></svg>
}

// Use Saturday's original shadow for every day, excluding the platform pixels.
// Generated terrain layers are clipped to the complementary island silhouette,
// so their independently baked shadows can never darken the common shadow.
const islandClip = 'M0 0H1448V570H1364V660L716 1015 84 660V570H0Z'
const revealDay: Record<MovableUpgradeId, number> = { flowers: 2, bridge: 3, garden: 4, bench: 4, picnic: 5, lanterns: 5, cafe: 6, stage: 6, cottage: 6, hall: 6, garnet: 6, sapphire: 6, emerald: 6, citrine: 6 }
const baseItems: { id: MovableId; sprite: SpriteId; day: number; name: string }[] = [
  { id: 'pebble', sprite: 'pebble', day: 0, name: 'your Pebble' },
  { id: 'base-cottage', sprite: 'cottage', day: 4, name: 'Cottage' },
  { id: 'friend', sprite: 'pebble', day: 5, name: 'Pebble friend' },
  { id: 'friend-two', sprite: 'pebble', day: 6, name: 'Little Pebble' },
  { id: 'base-bench', sprite: 'bench', day: 6, name: 'Village bench' },
]

export function CommunityWorld({ owned, stage = 6, positions = {}, onMove, freshStart = false }: { owned: UpgradeId[]; stage?: number; positions?: Positions; freshStart?: boolean; onMove?: (id: MovableId, position: Position) => void }) {
  const [emote, setEmote] = useState(0)
  const [preview, setPreview] = useState<{ id: MovableId; position: Position } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const drag = useRef<{ id: MovableId; pointer: number; start: Position; origin: Position; position: Position; moved: boolean } | null>(null)
  const coordinates = useRef<SVGSVGElement>(null)
  const clipId = useId()
  const complete = stage >= 6
  // Historical snapshots keep their original progression; only the current
  // village starts over. New purchases remain visible on that empty terrain.
  const terrainStage = complete && freshStart ? 0 : stage
  const purchasedLandscape = complete ? owned.filter(isLandscapeUpgrade) : []
  const purchasedTrees = purchasedLandscape.includes('tree-cluster')
  const editable = complete && !!onMove
  const pointFromEvent = (event: PointerEvent<SVGElement>): Position | null => {
    const matrix = coordinates.current?.getScreenCTM()
    if (!matrix) return null
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  }
  const commit = (id: MovableId, position: Position) => {
    onMove?.(id, position)
    setAnnouncement('Position saved. Use arrow keys to move the selected item.')
  }
  const items = [
    ...baseItems.filter(item => terrainStage >= item.day),
    ...owned.filter((id): id is MovableUpgradeId => !isLandscapeUpgrade(id)).filter(id => stage >= revealDay[id]).map(id => ({ id, sprite: id as SpriteId, name: id, day: revealDay[id] })),
  ].map(item => {
    const [x, y, width] = defaultPlacements[item.id]
    const origin = item.id === 'pebble' && terrainStage === 0 ? { x: 724, y: 595 } : { x, y }
    const position = preview?.id === item.id ? preview.position : complete ? positions[item.id] ?? origin : origin
    return { ...item, ...position, width }
  })
  const layers = [
    ...items.map(item => ({ id: item.id, depth: item.y, item })),
    ...trees.filter(tree => purchasedTrees || terrainStage >= tree.day).map(tree => ({ id: tree.id, depth: tree.depth, item: null })),
  ].sort((a, b) => a.depth - b.depth)
  return <div id="community-diorama" className="pt-diorama" data-stage={stage} data-editable={editable}>
    <svg className="pt-community-world pt-village-art" viewBox="0 0 800 455" role="group" aria-label={`Your Pebble virtual community, growth stage ${stage}`}>
      <svg ref={coordinates} width="800" height="455" viewBox="60 110 1320 925"
        onPointerMove={event => {
          const active = drag.current, point = pointFromEvent(event)
          if (!active || active.pointer !== event.pointerId || !point) return
          const dx = point.x - active.start.x, dy = point.y - active.start.y
          if (Math.hypot(dx, dy) < 8 && !active.moved) return
          active.moved = true
          active.position = constrainPlacement({ x: active.origin.x + dx, y: active.origin.y + dy }, active.id)
          setPreview({ id: active.id, position: active.position })
        }}
        onPointerUp={event => {
          const active = drag.current
          if (!active || active.pointer !== event.pointerId) return
          if (active.moved) commit(active.id, active.position)
          else if (active.id === 'pebble') setEmote(value => value + 1)
          drag.current = null
          setPreview(null)
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onPointerCancel={() => { drag.current = null; setPreview(null) }}
        onLostPointerCapture={event => { if (event.target === event.currentTarget) { drag.current = null; setPreview(null) } }}>

        <defs>
          <radialGradient id={`${clipId}-lamp-light`}><stop stopColor="#fff4bb" stopOpacity=".9" /><stop offset=".45" stopColor="var(--pt-yellow)" stopOpacity=".6" /><stop offset="1" stopColor="var(--pt-yellow)" stopOpacity="0" /></radialGradient>
          <clipPath id={`${clipId}-island`}><path d={islandClip} /></clipPath>
          <clipPath id={`${clipId}-shadow`}><path clipRule="evenodd" d={`M0 0H1448V1086H0Z ${islandClip}`} /></clipPath>
          <clipPath id={`${clipId}-river`}><path d={landscapeRegions.river.outline} /></clipPath>
          <clipPath id={`${clipId}-path`}><path d="M511 472 601 473 615 504 675 544 748 579 800 611 770 645 722 676 776 711 841 753 919 796 886 832 804 811 735 766 670 724 596 695 582 675 603 644 649 612 620 586 562 548 492 513Z" /></clipPath>
          {Object.entries(landscapeRegions).map(([id, region]) => <clipPath key={id} id={`${clipId}-purchase-${id}`}><path d={region.outline} /></clipPath>)}
          {trees.map(tree => <clipPath key={tree.id} id={`${clipId}-${tree.id}`}><path d={tree.outline} /></clipPath>)}
        </defs>
        <image data-platform-shadow="shared" clipPath={`url(#${clipId}-shadow)`} href={village} width="1448" height="1086" />
        <image data-village-base={terrainStage >= 6 ? 'landscape' : 'empty'} clipPath={`url(#${clipId}-island)`} href={terrainStage >= 6 ? landscape : emptyIsland} width="1448" height="1086" />
        {terrainStage < 6 && <>
          {terrainStage >= 3 && <g data-terrain="river" clipPath={`url(#${clipId}-river)`}><image href={landscape} width="1448" height="1086" /></g>}
          {terrainStage >= 4 && <g data-terrain="path" clipPath={`url(#${clipId}-path)`}><image href={landscape} width="1448" height="1086" /></g>}
        </>}
        {purchasedLandscape.filter(id => id !== 'tree-cluster').map(id => <g key={id} data-upgrade={id} data-landscape={id} pointerEvents="none" clipPath={`url(#${clipId}-purchase-${id})`}><image href={landscape} width="1448" height="1086" /></g>)}
        {(terrainStage >= 3 || purchasedLandscape.includes('river')) && <g className="pt-river-flow" data-community-motion="river" aria-hidden="true" pointerEvents="none" clipPath={`url(#${clipId}-river)`}>
          <path d="M978 394 925 435 1008 482 980 535 1005 568 1060 620 1150 688 1136 726" />
          <path d="M997 400 953 435 1030 482 1005 535 1028 564 1081 615 1172 680 1154 713" />
        </g>}
        {(terrainStage >= 6 || purchasedLandscape.includes('grass-detail')) && <GrassBreeze />}
        {layers.map(layer => {
          const item = layer.item
          if (!item) return <g key={layer.id} data-object={layer.id} data-landscape={purchasedTrees ? "tree-cluster" : undefined} data-upgrade={purchasedTrees && layer.id === "tree-back" ? "tree-cluster" : undefined} clipPath={`url(#${clipId}-${layer.id})`} pointerEvents="none"><image href={landscape} width="1448" height="1086" /><TreeBreeze id={layer.id} /></g>
          const movable = editable
          const height = item.width * crops[item.sprite][3] / crops[item.sprite][2]
          return <g key={item.id} data-object={item.id} data-upgrade={owned.includes(item.id as UpgradeId) ? item.id : undefined} data-movable={movable ? 'true' : undefined} transform={`translate(${item.x} ${item.y})`}
            className={movable ? 'pt-village-movable' : item.id === 'pebble' ? 'pt-world-character' : undefined}
            onPointerDown={event => {
              if (!movable || event.button !== 0 || !event.isPrimary) return
              const start = pointFromEvent(event)
              if (!start) return
              event.preventDefault()
              event.currentTarget.querySelector('rect')?.focus()
              coordinates.current?.setPointerCapture(event.pointerId)
              drag.current = { id: item.id, pointer: event.pointerId, start, origin: { x: item.x, y: item.y }, position: { x: item.x, y: item.y }, moved: false }
            }}
            onClick={() => { if (!movable && item.id === 'pebble') setEmote(value => value + 1) }}
            onKeyDown={event => {
              if ((event.key === 'Enter' || event.key === ' ') && item.id === 'pebble') { event.preventDefault(); setEmote(value => value + 1) }
              const delta: Record<string, [number, number]> = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }
              if (movable && delta[event.key]) { event.preventDefault(); const [dx, dy] = delta[event.key]; commit(item.id, constrainPlacement({ x: item.x + dx, y: item.y + dy }, item.id)) }
              if (event.key === 'Escape') { drag.current = null; setPreview(null) }
            }}>
            <rect
              role={movable || item.id === 'pebble' ? 'button' : undefined} tabIndex={movable || item.id === 'pebble' ? 0 : undefined}
              aria-label={item.id === 'pebble' ? 'Say hello to your Pebble' : movable ? `Move ${item.name}` : undefined}
              aria-describedby={movable ? `${clipId}-help` : undefined}
              x={-item.width / 2 - 8} y={-height - 8} width={item.width + 16} height={height + 16} rx="12" fill="transparent" />
            <g pointerEvents="none" className={item.sprite === 'pebble' ? 'pt-village-idle' : isRare(item.sprite) ? 'pt-village-idle pt-village-rock-idle' : undefined} data-community-motion={item.sprite === 'pebble' || isRare(item.sprite) ? 'pebble' : undefined}>
              <Sprite id={item.sprite} x={0} y={0} width={item.width} idle={item.sprite === 'pebble' || isRare(item.sprite)} />
              {item.sprite === 'lanterns' && <g className="pt-lantern-glow" data-community-motion="lamp" fill={`url(#${clipId}-lamp-light)`}>
                <ellipse cx={-item.width * .37} cy={-height * .4} rx="18" ry="22" />
                <ellipse cx={item.width * .08} cy={-height * .63} rx="18" ry="22" />
                <ellipse cx={item.width * .26} cy={-height * .33} rx="18" ry="22" />
              </g>}
            </g>
            {item.id === 'pebble' && emote > 0 && <text key={emote} className="pt-character-heart" x="-12" y={-height - 10} fill="var(--pt-berry)" fontSize="38" pointerEvents="none">♥</text>}
          </g>
        })}
      </svg>
    </svg>
    <p id={`${clipId}-help`} className="pt-placement-hint">{editable ? 'Drag to arrange · Arrow keys move a selected item' : 'Community history · Select Saturday to arrange'}</p>
    <span className="pt-sr-only" role="status">{announcement}</span>
  </div>
}
