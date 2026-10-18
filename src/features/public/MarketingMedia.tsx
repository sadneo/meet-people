import { useEffect, useId, useRef, useState } from 'react'
import props from '../../assets/pebble/community/village-props.png'
import rocks from '../../assets/pebble/community/expressive-pebbles.png'
import emptyIsland from '../../assets/pebble/community/village-empty.png'
import landscape from '../../assets/pebble/community/village-landscape.png'
import village from '../../assets/pebble/community/community-village.png'
import { landscapeRegions, landscapeTrees } from '../prototype/community-landscape'

// An optional build-time asset: no missing-file request or code edit is needed.
const videos = import.meta.glob<string>('../../assets/public/community-demo.mp4', { eager: true, query: '?url', import: 'default' })
const communityVideo = Object.values(videos)[0]

// Existing measured sprite-sheet crops, painted at fixed sizes. Raster art is
// never rotated or continuously scaled; only the vector pouch squashes.
const spriteCrops = {
  pebble: [455, 155, 175, 170], garnet: [7, 179, 528, 463],
  sapphire: [561, 179, 500, 463], emerald: [1093, 176, 518, 466],
  citrine: [1646, 172, 518, 470], cottage: [695, 705, 330, 300],
  bench: [1080, 145, 310, 200], lanterns: [65, 408, 255, 250],
} as const
type Sprite = keyof typeof spriteCrops
function MarketingSprite({ kind, x, y, width }: { kind: Sprite; x: number; y: number; width: number }) {
  const crop = spriteCrops[kind]
  const rare = ['garnet', 'sapphire', 'emerald', 'citrine'].includes(kind)
  const height = Math.round(width * crop[3] / crop[2])
  return <svg x={x} y={y} width={width} height={height} viewBox={crop.join(' ')} aria-hidden="true">
    <image href={rare ? rocks : props} width={rare ? 2172 : 1448} height={rare ? 724 : 1086} />
  </svg>
}

export function PebblePouch() {
  return <svg className="marketing-pouch" viewBox="0 0 600 480" role="img" aria-label="Different Pebbles find their way into one little green pouch">
    <ellipse cx="300" cy="430" rx="150" ry="15" fill="var(--pt-ink)" opacity=".08" />
    <g className="marketing-pouch-back"><path d="M202 249Q300 216 398 249L383 288H217Z" fill="var(--pt-ink)" /><ellipse cx="300" cy="249" rx="98" ry="24" fill="var(--pt-ink)" /><ellipse cx="300" cy="249" rx="78" ry="13" fill="#153e2a" /></g>
    <g className="marketing-arrival marketing-arrival-one"><MarketingSprite kind="pebble" x={-38} y={-74} width={76} /></g>
    <g className="marketing-arrival marketing-arrival-two"><MarketingSprite kind="citrine" x={-38} y={-68} width={76} /></g>
    <g className="marketing-arrival marketing-arrival-three"><MarketingSprite kind="sapphire" x={-36} y={-67} width={72} /></g>
    <g className="marketing-arrival marketing-arrival-four"><MarketingSprite kind="emerald" x={-38} y={-68} width={76} /></g>
    <g className="marketing-pouch-front">
      <path d="M208 257Q300 286 392 257C383 286 415 324 416 366Q415 430 300 429Q185 430 184 366C185 324 217 286 208 257Z" fill="var(--pt-green)" stroke="var(--pt-ink)" strokeWidth="3" />
      <path d="M213 271Q300 298 387 271M206 365Q207 407 254 409" fill="none" stroke="var(--pt-fresh)" strokeWidth="2" strokeLinecap="round" opacity=".6" />
      <path d="M218 278C179 269 171 295 189 300C203 304 217 287 219 280C224 309 228 320 235 326M382 278C421 269 429 295 411 300C397 304 383 287 381 280C376 309 372 320 365 326" fill="none" stroke="var(--pt-sand)" strokeWidth="5" strokeLinecap="round" />
    </g>
    <g className="marketing-pouch-rest"><MarketingSprite kind="garnet" x={110} y={358} width={58} /><MarketingSprite kind="pebble" x={429} y={362} width={58} /></g>
  </svg>
}

function CommunityBuildScene() {
  const id = useId()
  return <svg className="marketing-build-scene" viewBox="0 70 1448 1040" aria-hidden="true">
    <defs>{Object.entries(landscapeRegions).map(([key, value]) => <clipPath id={`${id}-${key}`} key={key}><path d={value.outline} /></clipPath>)}
      {landscapeTrees.map(tree => <clipPath key={tree.id} id={`${id}-${tree.id}`}><path d={tree.outline} /></clipPath>)}
    </defs>
    <image href={emptyIsland} width="1448" height="1086" />
    <g className="marketing-build-layer marketing-build-nature">
      {['river', 'walkway', 'flower-meadow', 'grass-detail'].map(key => <image key={key} clipPath={`url(#${id}-${key})`} href={landscape} width="1448" height="1086" />)}
      {landscapeTrees.slice(0, 3).map(tree => <image key={tree.id} clipPath={`url(#${id}-${tree.id})`} href={landscape} width="1448" height="1086" />)}
    </g>
    <MarketingSprite kind="pebble" x={686} y={520} width={76} />
    <g className="marketing-build-layer marketing-build-home"><MarketingSprite kind="cottage" x={465} y={313} width={218} /><MarketingSprite kind="lanterns" x={825} y={534} width={95} /></g>
    <g className="marketing-build-layer marketing-build-friends"><MarketingSprite kind="bench" x={852} y={697} width={182} /><MarketingSprite kind="emerald" x={610} y={690} width={68} /><MarketingSprite kind="citrine" x={790} y={576} width={68} /></g>
    <image className="marketing-build-layer marketing-build-nature" clipPath={`url(#${id}-tree-front)`} href={landscape} width="1448" height="1086" />
  </svg>
}

export function CommunityMedia({ reducedMotion }: { reducedMotion: boolean }) {
  const frame = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const [failed, setFailed] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [playRequested, setPlayRequested] = useState(false)
  const showVideo = !!communityVideo && !failed
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .05 })
    if (frame.current) observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const media = video.current
    if (!media || !showVideo) return
    let cancelled = false
    if (visible && !reducedMotion) {
      void media.play().then(() => { if (!cancelled) setBlocked(false) }).catch(() => { if (!cancelled) setBlocked(true) })
    } else media.pause()
    return () => { cancelled = true; media.pause() }
  }, [visible, reducedMotion, showVideo, playRequested])
  return <div ref={frame} className="marketing-community-media" data-visible={visible} data-media={showVideo ? 'video' : 'illustration'}>
    {showVideo ? <video ref={video} src={communityVideo} muted loop playsInline autoPlay={!reducedMotion && visible} preload="metadata" poster={village} aria-label="Pebble Community being built over time" onError={() => setFailed(true)} />
      : <div className="marketing-build-loop" role="img" aria-label="An illustrated Community preview: an island grows from one Pebble to trees, a cottage and friends"><CommunityBuildScene /></div>}
    {showVideo && blocked && !reducedMotion && <button className="marketing-video-play" onClick={() => { void video.current?.play().catch(() => undefined); setPlayRequested(value => !value) }}>Play Community preview</button>}
  </div>
}
