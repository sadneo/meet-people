import { useId, useState } from 'react'
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
} satisfies Record<string, [number, number, number, number]>
type SpriteId = keyof typeof crops

function Sprite({ id, x, y, width }: { id: SpriteId; x: number; y: number; width: number }) {
  const crop = crops[id]
  const height = width * crop[3] / crop[2]
  return <svg x={x - width / 2} y={y - height} width={width} height={height} viewBox={crop.join(' ')} aria-hidden="true">
    <image href={props} width="1448" height="1086" />
  </svg>
}

export function UpgradePicture({ id }: { id: UpgradeId }) {
  return <svg className="pt-upgrade-picture pt-village-art" viewBox="0 0 180 150" aria-hidden="true"><Sprite id={id} x={90} y={140} width={125} /></svg>
}

// All positions are in the original PNG's coordinate system. The untouched
// reference is the completed scene, including its exact river and shading.
// New purchases add extra scenery; the reference's bench/flowers are base art.
const placements: Record<UpgradeId, [number, number, number]> = {
  flowers: [275, 650, 105], bench: [540, 840, 145], lanterns: [1030, 820, 100],
  picnic: [760, 873, 135], bridge: [1066, 628, 145], garden: [935, 830, 115],
  cafe: [235, 575, 145], stage: [886, 416, 155], cottage: [989, 425, 150], hall: [638, 360, 170],
}
const revealDay: Record<UpgradeId, number> = { flowers: 2, bridge: 3, garden: 4, bench: 4, picnic: 5, lanterns: 5, cafe: 6, stage: 6, cottage: 6, hall: 6 }

export function CommunityWorld({ owned, stage = 6 }: { owned: UpgradeId[]; stage?: number }) {
  const [emote, setEmote] = useState(0)
  const clipId = useId()
  const complete = stage >= 6
  const pebble = stage === 0 ? { x: 724, y: 595 } : { x: 706, y: 673 }
  const sayHello = () => setEmote(value => value + 1)
  return <div id="community-diorama" className="pt-diorama" data-stage={stage}>
    <svg className="pt-community-world pt-village-art" viewBox="0 0 800 455" role="group" aria-label={`Your Pebble virtual community, growth stage ${stage}`}>
      {/* Preserve the existing scene footprint while retaining the PNG's aspect ratio. */}
      <svg width="800" height="455" viewBox="60 110 1320 925">
        <image data-village-base={complete ? 'reference' : 'empty'} href={complete ? village : emptyIsland} width="1448" height="1086" />
        {!complete && <>
          <defs>
            {/* Reveal the actual reference river pixels, never an SVG imitation. */}
            <clipPath id={`${clipId}-river`}><path d="M960 377 987 378 1049 413 1012 447 1027 473 1085 507 1078 534 1047 552 1063 582 1145 628 1188 656 1207 675 1136 726 1093 700 1090 681 1050 650 1023 629 1017 600 969 578 936 568 884 558 884 533 919 512 940 503 922 483 884 466 865 448 909 416 940 400Z" /></clipPath>
            <clipPath id={`${clipId}-path`}><path d="M511 472 601 473 615 504 675 544 748 579 800 611 770 645 722 676 776 711 841 753 919 796 886 832 804 811 735 766 670 724 596 695 582 675 603 644 649 612 620 586 562 548 492 513Z" /></clipPath>
          </defs>
          {stage >= 3 && <g data-terrain="river" clipPath={`url(#${clipId}-river)`}><image href={village} width="1448" height="1086" /></g>}
          {stage >= 4 && <g data-terrain="path" clipPath={`url(#${clipId}-path)`}><image href={village} width="1448" height="1086" /></g>}
          {stage >= 1 && <g data-object="tree-back"><Sprite id="tree" x={795} y={358} width={214} /></g>}
          {stage >= 2 && <g data-object="tree-left"><Sprite id="tree" x={333} y={535} width={185} /></g>}
          {stage >= 4 && <g data-object="cottage-base"><Sprite id="cottage" x={550} y={483} width={310} /></g>}
          {stage >= 5 && <g data-object="tree-right"><Sprite id="tree" x={1166} y={569} width={193} /></g>}
          {stage >= 5 && <g data-object="friend"><Sprite id="pebble" x={879} y={741} width={82} /></g>}
        </>}
        {owned.filter(id => stage >= revealDay[id]).sort((a, b) => placements[a][1] - placements[b][1]).map(id => {
          const [x, y, width] = placements[id]
          return <g key={id} data-object={id} data-upgrade={id} className="pt-diorama-object"><Sprite id={id} x={x} y={y} width={width} /></g>
        })}
        <g data-object="pebble" transform={`translate(${pebble.x} ${pebble.y})`}>
          <g role="button" tabIndex={0} aria-label="Say hello to your Pebble" className="pt-world-character" onClick={sayHello} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sayHello() } }}>
            <rect x="-58" y="-108" width="116" height="116" fill="transparent" />
            {!complete && <Sprite id="pebble" x={0} y={0} width={100} />}
            {emote > 0 && <text key={emote} className="pt-character-heart" x="-12" y="-110" fill="var(--pt-berry)" fontSize="38">♥</text>}
          </g>
        </g>
      </svg>
    </svg>
  </div>
}
