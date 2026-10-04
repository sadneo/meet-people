import { useEffect, useRef, useState } from 'react'
import { type UpgradeId, upgrades } from './economy'
// Pixel primitives follow the existing Community artwork; the original stays untouched.
import type { RoofColor } from '../community/demo'

function Stone({ x, y, scale = 1, face = false, motion = 'none' }: { x: number; y: number; scale?: number; face?: boolean; motion?: 'none' | 'bob' | 'wander' }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path fill="#52744d" opacity=".22" d="M-3 29h37v7H-3z" />
    <g className={`pebble-stone-${motion}`}>
    <path fill="#62675a" d="M8 0h13v4h5v6h4v10h3v10h-5v4H4v-4H0V17h3V7h5z" />
    <path fill="#bdb9a1" d="M9 3h11v4h5v7h3v14h-5v3H6v-4H3v-9h3V9h3z" />
    <path fill="#ded7bf" d="M10 4h9v4h-6v5H8v6H5v-8h5zM20 22h6v5h-6z" />
    <path fill="#a19e88" d="M7 24h5v5H7zM20 10h4v4h-4zM15 5h3v3h-3z" />
    {face && <g><path fill="#3f4538" d="M10 18h3v4h-3zM22 18h3v4h-3zM15 24h2v2h3v-2h2v4h-7z" /><path fill="#d89379" d="M7 23h5v3H7zM24 23h4v3h-4z" /></g>}
    </g>
  </g>
}

function Tree({ x, y, scale = 1, light = false }: { x: number; y: number; scale?: number; light?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path fill="#3e694b" opacity=".16" d="M-19 66h47v7h-47z" />
    <path fill="#897354" d="M0 30h9v38H0z" /><path fill="#b4976c" d="M1 37h3v28H1z" />
    <path fill={light ? '#77966a' : '#517b58'} d="M-9 0h24v6h11v9h8v25h-7v10H13v6H-8v-6h-14V39h-6V18h8V7h11z" />
    <path fill={light ? '#a2b67b' : '#73965f'} d="M-9 3h22v7h11v13H12v8H-4v8h-17V20h7V10h5z" />
    <path fill={light ? '#b7c489' : '#8ba96d'} d="M-7 6h15v7H-3v9h-12v-7h8z" />
    <path fill="#355d45" opacity=".22" d="M21 30h9v10H18v9H-5v-7h17v-6h9z" />
  </g>
}

function Flower({ x, y, color = '#fff6d8' }: { x: number; y: number; color?: string }) {
  return <g transform={`translate(${x} ${y})`}><path stroke="#638753" strokeWidth="2" d="M0 0v10m0-3-4-3" /><path fill={color} d="M-2-7h4v4h4v4H2v4h-4V1h-4v-4h4z" /><path fill="#e4b663" d="M-2-3h4v4h-4z" /></g>
}

function Cottage({ x, y, roof, small = false }: { x: number; y: number; roof: RoofColor; small?: boolean }) {
  const colors = { terracotta: ['#af6f51', '#d2936b', '#e2ae80'], sage: ['#59705a', '#809568', '#a4b184'], blue: ['#567778', '#7e9d9b', '#b0c5b7'] }[roof]
  return <g transform={`translate(${x} ${y}) scale(${small ? 0.65 : 1})`}>
    <path fill="#4b7049" opacity=".22" d="M-12 86h126v12H-12z" />
    <path fill="#827d68" d="M2 29h98v62H2z" /><path fill="#c6bfa2" d="M6 30h88v55H6z" />
    {Array.from({ length: 4 }, (_, row) => Array.from({ length: 5 }, (_, col) => <rect key={`${row}-${col}`} x={7 + col * 18 - (row % 2) * 2} y={35 + row * 12} width={15} height={10} fill={['#d8ceb1', '#b6af92', '#d0c4a5'][(row + col) % 3]} />))}
    <path fill="#8a7158" d="M73-18h13v37H73z" /><path fill="#c4b79a" d="M70-22h20v7H70z" />
    <path fill={colors[0]} d="M-9 29v-8h10v-9h10V3h10v-9h10v-9h38v9h10v9h10v9h10v9h10v12H-9z" />
    <path fill={colors[1]} d="M-5 24h108v5H-5zM5 14h88v6H5zM15 4h68v6H15zM25-6h48v6H25zM35-14h28v4H35z" />
    <path fill={colors[2]} d="M7 14h21v3H7zM35-6h20v3H35zM60 4h19v3H60zM68 24h23v3H68z" />
    <path fill="#75634c" d="M39 51h23v37H39z" /><path fill="#aa8961" d="M43 54h15v32H43z" /><path fill="#edd18a" d="M54 68h3v3h-3z" />
    <path fill="#746e53" d="M13 45h18v21H13zM72 45h18v21H72z" /><path fill="#e5cd87" d="M16 48h12v15H16zM75 48h12v15H75z" /><path fill="#8d886b" d="M21 47h2v17h-2zM15 54h14v2H15zM80 47h2v17h-2zM74 54h14v2H74z" />
    <path fill="#8e9a68" d="M10 66h24v6H10zM69 66h24v6H69z" /><path fill="#ddab88" d="M15 63h4v4h-4zM26 64h4v4h-4zM74 63h4v4h-4zM84 63h4v4h-4z" />
    <path fill="#77725c" d="M9 76h2v2H9zM16 76h2v2h-2zM12 79h4v2h-4z" />
    <path fill="#d5c6a4" d="M34 86h33v5H34zM29 91h43v5H29z" />
    <path fill="#5e8556" d="M93 77h10v-9h5v19H89v-5h4z" />
  </g>
}

function UpgradeArt({ id }: { id: UpgradeId }) {
  switch (id) {
    case 'flowers': return <>{Array.from({ length: 18 }, (_, i) => <Flower key={i} x={10 + (i * 29) % 130} y={38 + (i * 17) % 60} color={['#fff6d8', '#d99883', '#e8bd79'][i % 3]} />)}</>
    case 'bench': return <><path fill="#8a7051" d="M19 53h110v9H19zM19 68h110v8H19zM16 86h116v8H16zM25 48h8v64h-8zM116 48h8v64h-8z" /><path fill="#c4a178" d="M21 51h106v8H21zM21 65h106v7H21zM15 81h119v7H15z" /><Stone x={62} y={52} scale={.8} face motion="bob" /><Stone x={91} y={56} scale={.7} face /></>
    case 'lanterns': return <>{[20, 73, 125].map((x, i) => <g key={x} transform={`translate(${x} ${i % 2 * 18})`}><path fill="#6f7958" d="M0 35h5v71h-5zM-7 35h19v4H-7z" /><path fill="#f0d28d" d="M-6 18h17v17H-6z" /><path fill="#7c7955" d="M-9 16h23v5H-9zM-7 34h20v5H-7zM-1 12h6v6h-6z" /><rect className="pt-lantern-light" x="-13" y="12" width="30" height="30" rx="12" fill="#ffdf90" opacity=".16" /></g>)}</>
    case 'picnic': return <><path fill="#d2a081" d="M6 80h137v40H6z" /><path fill="#ead1aa" d="M6 91h137v5H6zM6 108h137v5H6zM20 80h6v40h-6zM59 80h6v40h-6zM99 80h6v40h-6z" /><path fill="#8f7551" d="M28 59h90v11H28zM37 70h8v43h-8zM104 70h8v43h-8zM18 87h111v8H18z" /><path fill="#b99a6f" d="M23 53h100v10H23z" /><Stone x={128} y={74} scale={.8} face motion="bob" /><Flower x={67} y={53} /></>
    case 'bridge': return <><path fill="#786849" d="M1 83h152v30H1z" /><path fill="#bb9b6a" d="M0 62h154v35H0z" />{[8, 27, 46, 65, 84, 103, 122, 141].map(x => <path key={x} stroke="#91764f" strokeWidth="3" d={`M${x} 62v35`} />)}<path fill="#876d4b" d="M3 38h7v51H3zM72 30h7v49h-7zM144 37h7v52h-7zM1 41h150v7H1z" /><path fill="#d8bd88" d="M0 39h151v4H0zM0 97h155v6H0z" /></>
    case 'garden': return <>{[0, 1, 2].map(i => <g key={i} transform={`translate(${i * 51} 0)`}><path fill="#a1845d" d="M0 39h44v78H0z" /><path fill="#756b4c" d="M5 44h34v66H5z" />{[53, 78, 101].map((y, j) => <g key={y}><path fill="#82985d" d={`M12 ${y}h7v-8h5v8h7v6H12z`} /><Flower x={21} y={y} color={j % 2 ? '#e6ad77' : '#faf4d6'} /></g>)}</g>)}<Stone x={153} y={83} scale={.65} face /></>
    case 'cafe': return <><path fill="#917654" d="M21 60h109v46H21z" /><path fill="#d2bb8d" d="M25 65h101v33H25z" /><path fill="#645e47" d="M28 101h15v15H28zM108 101h15v15h-15z" /><path fill="#c07f62" d="M10 31h131v24H10z" /><path fill="#f1dfba" d="M30 31h19v24H30zM69 31h19v24H69zM108 31h19v24h-19z" /><path fill="#8d7755" d="M18 24h6v42h-6zM129 24h6v42h-6z" /><path fill="#f8eed7" d="M51 54h16v12H51zM78 54h16v12H78z" /><path fill="#819564" d="M67 76h21v14H67z" /><Stone x={126} y={108} scale={.75} face motion="bob" /></>
    case 'stage': return <><path fill="#887150" d="M7 71h143v43H7z" /><path fill="#bea275" d="M1 67h155v11H1zM18 116h118v7H18z" /><path fill="#7a7154" d="M18 20h6v48h-6zM132 20h6v48h-6z" /><path fill="#ba8465" d="M13 16h130v7H13z" /><path fill="#e9cf91" d="M26 23h7v10h-7zM61 23h7v10h-7zM96 23h7v10h-7zM128 23h7v10h-7z" /><path fill="#4f6047" d="M32 46h17v23H32zM109 46h17v23h-17zM78 38h4v29h-4zM72 36h15v5H72z" /><Stone x={59} y={116} scale={.65} face /><Stone x={91} y={122} scale={.6} face motion="bob" /></>
    case 'cottage': return <Cottage x={35} y={38} roof="sage" />
    case 'hall': return <><path fill="#aaa58b" d="M9 38h136v83H9z" /><path fill="#d0c5a6" d="M15 42h124v72H15z" /><path fill="#6b8155" d="M0 40v-9h15V18h19V7h89v11h18v13h15v12Z" /><path fill="#91a371" d="M20 24h116v7H20zM38 11h81v6H38z" /><path fill="#827057" d="M62 66h31v53H62z" /><path fill="#ddbd78" d="M24 61h19v27H24zM110 61h19v27h-19zM69 73h17v41H69z" /><path fill="#929773" d="M32 61h3v27h-3zM118 61h3v27h-3zM20 75h27v3H20zM106 75h27v3h-27z" /><path fill="#e4d7b2" d="M51 116h53v6H51zM44 122h67v7H44z" /><path fill="#b88567" d="M74-8h5v15h-5zM79-8h19v10H79z" /></>
  }
}

export function UpgradePicture({ id }: { id: UpgradeId }) {
  return <svg className="pt-upgrade-picture" viewBox="-6 0 180 150" aria-hidden="true" shapeRendering="crispEdges"><UpgradeArt id={id} /></svg>
}

export function CommunityWorld({ owned }: { owned: UpgradeId[] }) {
  const area = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1200, height: 850 })
  const [emote, setEmote] = useState(0)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      // Extend the landscape on larger displays, rather than cropping or enlarging a fixed image.
      const units = width < 760 ? 1.5 : Math.min(1, 1100 / height)
      setSize({ width: Math.max(480, width * units), height: Math.max(600, height * units) })
    })
    if (area.current) observer.observe(area.current)
    return () => observer.disconnect()
  }, [])
  const w = size.width, h = size.height
  const homeX = w * .46, homeY = h * .34
  const spots: Record<UpgradeId, [number, number]> = {
    flowers: [w * .18, h * .42], bench: [w * .2, h * .56], lanterns: [w * .46, h * .53],
    picnic: [w * .39, h * .76], bridge: [w * .77 - 77, h * .59], garden: [w * .08, h * .76],
    cafe: [w * .52 - 55, h * .66], stage: [w * .07, h * .29], cottage: [homeX - 112, homeY + 6], hall: [w * .38, h * .19],
  }
  const trees = Array.from({ length: Math.ceil(w / 110) }, (_, i) => i * 113)
  const river = `M${w * .77} ${h * .18}v${h * .12}h-20v${h * .16}h30v${h * .17}h-12v${h * .15}h25V${h + 100}`
  return <div ref={area} className="pt-community-canvas">
    <svg className="pt-community-world" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="group" aria-label="Your Pebble virtual community">
      <defs><linearGradient id="pt-meadow" x2="0" y2="1"><stop stopColor="#c5d49a" /><stop offset="1" stopColor="#9ebc7c" /></linearGradient><pattern id="pt-grass-tiles" width="147" height="123" patternUnits="userSpaceOnUse"><path fill="#85a66b" opacity=".45" d="M15 20h4v6h4v-9h4v13H15zM106 93h3v6h4v-9h4v13h-11z" /><path fill="#d4dc9e" opacity=".7" d="M57 59h12v5H57zM130 35h9v4h-9z" /></pattern></defs>
      <path fill="#e9edda" d={`M0 0h${w}v${h}H0z`} />
      <g shapeRendering="crispEdges">
        <path fill="#d2deb3" d={`M0 ${h * .09}h${w * .12}v-12h${w * .1}v-24h${w * .16}v12h${w * .18}v-18h${w * .16}v25h${w * .28}V${h}H0z`} />
        <path fill="url(#pt-meadow)" d={`M0 ${h * .2}h${w * .2}v-18h${w * .14}v13h${w * .22}v-21h${w * .25}v15h${w * .19}V${h}H0z`} />
        <path fill="url(#pt-grass-tiles)" d={`M0 ${h * .24}h${w}V${h}H0z`} />
        <path fill="#85a76b" opacity=".12" d={`M0 ${h * .52}h${w * .16}v18h${w * .15}v80H0zM${w * .82} ${h * .32}h${w * .18}v${h * .45}h-${w * .12}v-45h-${w * .06}z`} />
        <path d={river} stroke="#759f92" strokeWidth={84} fill="none" /><path d={river} stroke="#a4c7b3" strokeWidth={66} fill="none" />
        {Array.from({ length: 11 }, (_, i) => <path key={i} stroke="#d5e5c9" strokeWidth="3" d={`M${w * .77 - 15 + i % 3 * 12} ${h * .25 + i * h * .07}h${13 + i % 3 * 8}`} />)}
        <path d={`M${homeX + 50} ${homeY + 80}v${h * .15}h-35v${h * .17}h-30V${h}`} fill="none" stroke="#c0ba88" strokeWidth="62" />
        <path d={`M${homeX + 50} ${homeY + 80}v${h * .15}h-35v${h * .17}h-30V${h}`} fill="none" stroke="#e0d6a7" strokeWidth="48" />
        {owned.includes('bridge') && <path d={`M${homeX + 50} ${h * .59 + 83}H${w * .77}`} stroke="#dbd2a2" strokeWidth="25" />}
        {trees.map((x, i) => <Tree key={x} x={x} y={h * .13 + (i % 3) * 13} scale={1.2 + i % 2 * .2} light={i % 3 === 0} />)}
        {[0, 1, 2, 3, 4].map(i => <g key={i}><Tree x={w * .91 + (i % 2) * 25} y={h * .3 + i * 46} scale={1.4} light={i % 2 === 0} />{w > 900 && <Tree x={w * .03 + i % 3 * 46} y={h * .58 + i * 24} scale={1.3} light />}</g>)}
        <g transform={`translate(${w * .06} ${h * .35})`} fill="#ad9169"><path d="M0 15h105v7H0zM0 35h105v7H0zM4 0h8v58H4zM49 0h8v58h-8zM97 0h8v58h-8z" /></g>
        <Cottage x={homeX} y={homeY} roof="terracotta" />
        {owned.map(id => <g key={id} data-upgrade={id} aria-label={upgrades.find(item => item.id === id)!.name} transform={`translate(${spots[id][0]} ${spots[id][1]})`}><g className="pt-built"><UpgradeArt id={id} /></g></g>)}
        <g transform={`translate(${homeX - 24} ${homeY + 118})`} role="button" tabIndex={0} aria-label="Say hello to your Pebble" className="pt-world-character" onClick={() => setEmote(value => value + 1)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEmote(value => value + 1) } }}>
          <rect x="-10" y="-10" width="68" height="72" fill="transparent" />
          <g key={emote} className={emote ? 'pt-character-hop' : ''}><Stone x={0} y={0} scale={1.35} face motion="bob" />{emote > 0 && <text className="pt-character-heart" x="15" y="-10" fill="#b9775c" fontSize="24">♥</text>}</g>
        </g>
        <Stone x={w * .62} y={h * .47} scale={.9} face motion="wander" /><Stone x={w * .3} y={h * .69} scale={.85} face />
        {[0, 1, 2, 3].map(i => <g key={i}><Tree x={i % 2 ? w - 15 : 2} y={h * .4 + Math.floor(i / 2) * h * .35} scale={1.8} light={i % 2 === 0} /></g>)}
        {trees.filter((_, i) => i % 2 === 0).map(x => <Tree key={x} x={x} y={h - 55} scale={1.5} light />)}
      </g>
    </svg>
  </div>
}

