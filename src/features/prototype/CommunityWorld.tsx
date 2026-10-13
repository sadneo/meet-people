import { useId, useRef, useState, type PointerEvent } from 'react'
import { constrainPlacement, defaultPlacements, type MovableId, type Position, type Positions } from './community-placement'
import landscape from '../../assets/pebble/community/village-landscape.png'
import rarePebbles from '../../assets/pebble/community/expressive-pebbles.png'
import { type UpgradeId } from './economy'
import village from '../../assets/pebble/community/community-village.png'
import emptyIsland from '../../assets/pebble/community/village-empty.png'
import props from '../../assets/pebble/community/village-props.png'
import './village-art.css'

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

function Sprite({ id, x, y, width }: { id: SpriteId; x: number; y: number; width: number }) {
  const crop = crops[id]
  const height = width * crop[3] / crop[2]
  return <svg x={x - width / 2} y={y - height} width={width} height={height} viewBox={crop.join(' ')} aria-hidden="true">
    <image href={isRare(id) ? rarePebbles : props} width={isRare(id) ? 2172 : 1448} height={isRare(id) ? 724 : 1086} />
  </svg>
}

export function UpgradePicture({ id }: { id: UpgradeId }) {
  return <svg className="pt-upgrade-picture pt-village-art" viewBox="0 0 180 150" aria-hidden="true"><Sprite id={id} x={90} y={140} width={125} /></svg>
}

// Use Saturday's original shadow for every day, excluding the platform pixels.
// Generated terrain layers are clipped to the complementary island silhouette,
// so their independently baked shadows can never darken the common shadow.
const islandClip = 'M0 0H1448V570H1364V660L716 1015 84 660V570H0Z'
const trees = [
  { id: 'tree-back', day: 1, depth: 358, outline: 'M687 140H902V306L849 320V360H768V316L695 299Z' },
  { id: 'tree-left', day: 2, depth: 537, outline: 'M240 355H372V371H404V412H422V471L354 501V537H308V499L242 473Z' },
  { id: 'tree-right', day: 5, depth: 569, outline: 'M1080 374H1204V399H1240V429H1260V493L1185 535V569H1141V532L1074 498Z' },
  { id: 'tree-front', day: 6, depth: 795, outline: 'M438 648H536V666H564V698H582V752L532 772V795H486V766L439 752Z' },
]
const revealDay: Record<UpgradeId, number> = { flowers: 2, bridge: 3, garden: 4, bench: 4, picnic: 5, lanterns: 5, cafe: 6, stage: 6, cottage: 6, hall: 6, garnet: 6, sapphire: 6, emerald: 6, citrine: 6 }
const baseItems: { id: MovableId; sprite: SpriteId; day: number; name: string }[] = [
  { id: 'pebble', sprite: 'pebble', day: 0, name: 'your Pebble' },
  { id: 'base-cottage', sprite: 'cottage', day: 4, name: 'Cottage' },
  { id: 'friend', sprite: 'pebble', day: 5, name: 'Pebble friend' },
  { id: 'friend-two', sprite: 'pebble', day: 6, name: 'Little Pebble' },
  { id: 'base-bench', sprite: 'bench', day: 6, name: 'Village bench' },
]

export function CommunityWorld({ owned, stage = 6, positions = {}, onMove }: { owned: UpgradeId[]; stage?: number; positions?: Positions; onMove?: (id: MovableId, position: Position) => void }) {
  const [emote, setEmote] = useState(0)
  const [preview, setPreview] = useState<{ id: MovableId; position: Position } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const drag = useRef<{ id: MovableId; pointer: number; start: Position; origin: Position; position: Position; moved: boolean } | null>(null)
  const coordinates = useRef<SVGSVGElement>(null)
  const clipId = useId()
  const complete = stage >= 6
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
    ...baseItems.filter(item => stage >= item.day),
    ...owned.filter(id => stage >= revealDay[id]).map(id => ({ id, sprite: id as SpriteId, name: id, day: revealDay[id] })),
  ].map(item => {
    const [x, y, width] = defaultPlacements[item.id]
    const position = preview?.id === item.id ? preview.position : complete ? positions[item.id] ?? { x, y } : item.id === 'pebble' && stage === 0 ? { x: 724, y: 595 } : { x, y }
    return { ...item, ...position, width }
  })
  const layers = [
    ...items.map(item => ({ id: item.id, depth: item.y, item })),
    ...trees.filter(tree => stage >= tree.day).map(tree => ({ id: tree.id, depth: tree.depth, item: null })),
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
          <clipPath id={`${clipId}-island`}><path d={islandClip} /></clipPath>
          <clipPath id={`${clipId}-shadow`}><path clipRule="evenodd" d={`M0 0H1448V1086H0Z ${islandClip}`} /></clipPath>
          <clipPath id={`${clipId}-river`}><path d="M960 377 987 378 1049 413 1012 447 1027 473 1085 507 1078 534 1047 552 1063 582 1145 628 1188 656 1207 675 1136 726 1093 700 1090 681 1050 650 1023 629 1017 600 969 578 936 568 884 558 884 533 919 512 940 503 922 483 884 466 865 448 909 416 940 400Z" /></clipPath>
          <clipPath id={`${clipId}-path`}><path d="M511 472 601 473 615 504 675 544 748 579 800 611 770 645 722 676 776 711 841 753 919 796 886 832 804 811 735 766 670 724 596 695 582 675 603 644 649 612 620 586 562 548 492 513Z" /></clipPath>
          {trees.map(tree => <clipPath key={tree.id} id={`${clipId}-${tree.id}`}><path d={tree.outline} /></clipPath>)}
        </defs>
        <image data-platform-shadow="shared" clipPath={`url(#${clipId}-shadow)`} href={village} width="1448" height="1086" />
        <image data-village-base={complete ? 'landscape' : 'empty'} clipPath={`url(#${clipId}-island)`} href={complete ? landscape : emptyIsland} width="1448" height="1086" />
        {!complete && <>
          {stage >= 3 && <g data-terrain="river" clipPath={`url(#${clipId}-river)`}><image href={landscape} width="1448" height="1086" /></g>}
          {stage >= 4 && <g data-terrain="path" clipPath={`url(#${clipId}-path)`}><image href={landscape} width="1448" height="1086" /></g>}
        </>}
        {layers.map(layer => {
          const item = layer.item
          if (!item) return <g key={layer.id} data-object={layer.id} clipPath={`url(#${clipId}-${layer.id})`} pointerEvents="none"><image href={landscape} width="1448" height="1086" /></g>
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
            <g pointerEvents="none"><Sprite id={item.sprite} x={0} y={0} width={item.width} /></g>
            {item.id === 'pebble' && emote > 0 && <text key={emote} className="pt-character-heart" x="-12" y={-height - 10} fill="var(--pt-berry)" fontSize="38" pointerEvents="none">♥</text>}
          </g>
        })}
      </svg>
    </svg>
    <p id={`${clipId}-help`} className="pt-placement-hint">{editable ? 'Drag to arrange · Arrow keys move a selected item' : 'Community history · Select Saturday to arrange'}</p>
    <span className="pt-sr-only" role="status">{announcement}</span>
  </div>
}
