import type { RoofColor } from './demo'

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

export function World({ stage, roof, flowers }: { stage: number; roof: RoofColor; flowers: boolean }) {
  return <svg className="pebble-world" viewBox="0 0 800 420" preserveAspectRatio="xMidYMid slice" role="img" aria-label={['A single smiling pebble in a sunlit meadow', 'A small pile of stones gathered in the meadow', 'A cozy stone cottage with one smiling foundation stone', 'Two stone cottages, a gathering table, and a blooming community garden'][stage]}>
    <defs>
      <linearGradient id="pebble-sky" x2="0" y2="1"><stop stopColor="#edf0df" /><stop offset="1" stopColor="#faf0ce" /></linearGradient>
      <linearGradient id="pebble-grass" x2="0" y2="1"><stop stopColor="#c4d296" /><stop offset="1" stopColor="#99b875" /></linearGradient>
    </defs>
    <path fill="url(#pebble-sky)" d="M0 0h800v420H0z" />
    <g shapeRendering="crispEdges">
      <path fill="#fffaf0" opacity=".7" d="M57 83h16V71h30V59h37v10h24v14h27v12H57zM520 62h26V49h34V38h35v12h22v14h22v10H520zM698 126h22v-12h32v-10h33v12h15v21H698z" />
      <path fill="#d8dfb6" d="M0 163h40v-14h55v-9h56v12h56v-12h49v-18h47v-11h53v10h42v17h50v16h74v-17h53v-17h52v14h38v20h55v14h80v-18h40v100H0z" />
      <path fill="#b7c997" d="M0 182h60v-12h63v13h63v-15h82v12h80v-17h85v18h88v-10h79v-19h75v23h67v-13h58v110H0z" />
      <path fill="url(#pebble-grass)" d="M0 210h49v-10h70v9h57v-7h110v12h142v-9h93v-12h87v9h89v15h103v203H0z" />
      <path fill="#91ad77" opacity=".24" d="M0 283h95v-8h130v10h151v-9h113v15h134v-8h177v137H0z" />
      <path fill="#d8d3a0" d="M402 282h42v15h-18v16h-25v20h-36v18h-29v22h-20v21h-25v26h-69v-20h22v-24h27v-24h34v-22h39v-19h32v-15h26z" />
      <path fill="#e6dfb1" d="M408 285h20v10h-19v17h-24v17h-33v19h-30v23h-20v23h-25v26h-24v-17h21v-26h27v-24h31v-23h33v-19h28v-14h15z" />
      <path fill="#709c90" d="M663 199h29v28h-12v34h14v38h31v29h32v25h43v67H657v-27h-31v-37h-18v-33h13v-39h17v-34h16v-28h9z" />
      <path fill="#a3c7b5" d="M670 200h14v30h-12v33h13v39h29v30h31v27h55v61H671v-30h-30v-35h-14v-30h11v-38h14v-34h12v-28h6z" />
      <path fill="#d4e4c8" opacity=".8" d="M665 255h13v3h-13zM643 307h22v3h-22zM660 340h31v3h-31zM688 383h35v3h-35zM727 365h27v3h-27z" />
      {Array.from({ length: 74 }, (_, i) => { const x = (i * 137 + 29) % 800; const y = 215 + ((i * 41) % 205); return <path key={i} fill={i % 3 === 0 ? '#d9dea1' : '#7ea267'} opacity=".65" d={`M${x} ${y}h3v5h3v-8h3v11h-9z`} /> })}
      <Tree x={68} y={135} scale={1.35} light /><Tree x={131} y={171} scale={.78} /><Tree x={28} y={192} scale={1.25} />
      <Tree x={746} y={125} scale={1.5} /><Tree x={693} y={155} scale={.9} light /><Tree x={793} y={185} scale={1.1} />
      <g fill="#a18a60"><path d="M136 248h7v40h-7zM179 241h7v40h-7zM223 236h7v39h-7z" /><path d="m132 257 102-13v7l-102 13zM132 273l102-13v6l-102 14z" /></g>
      <g fill="#c8b080"><path d="M137 249h3v38h-3zM180 243h3v36h-3zM224 237h3v36h-3z" /></g>
      <Stone x={571} y={246} scale={.6} motion={stage >= 2 ? 'wander' : 'none'} /><Stone x={90} y={317} scale={.75} />
      <g key={stage} className="pebble-world-build">
        {stage === 0 && <Stone x={378} y={247} scale={1.7} face motion="bob" />}
        {stage === 1 && <g><Stone x={349} y={265} scale={1.3} /><Stone x={404} y={268} scale={1.2} motion="bob" /><Stone x={375} y={233} scale={1.65} face /><Stone x={379} y={282} scale={.85} /></g>}
        {stage >= 2 && <Cottage x={348} y={205} roof={roof} />}
        {stage === 3 && <g><Cottage x={497} y={200} roof="sage" small /><path fill="#cfbe90" d="M466 283h43v9h-43zM493 260h13v28h-13z" /><path fill="#8f7551" d="M495 315h61v7h-61zM499 322h5v14h-5zM546 322h5v14h-5zM488 329h73v5h-73z" /><path fill="#ad9469" d="M491 310h67v7h-67z" /><Stone x={466} y={318} scale={.6} face motion="bob" /><Flower x={522} y={311} color="#e6b58c" /><path fill="#9d8b61" d="M204 306h66v39h-66z" /><path fill="#74694e" d="M209 311h56v29h-56z" />{[217, 233, 250].map(x => <g key={x}><Flower x={x} y={318} color="#e7b48d" /><Flower x={x + 3} y={337} /></g>)}</g>}
      </g>
      {[[183, 308], [310, 265], [467, 287], [544, 355], [339, 383], [118, 356], [602, 246], [238, 227]].map(([x, y], i) => <Flower key={x} x={x} y={y} color={i % 3 === 0 ? '#e9bd92' : '#fff6d8'} />)}
      {stage >= 2 && flowers && [331, 345, 457, 470].map((x, i) => <Flower key={x} x={x} y={300 + i % 2 * 8} color={i % 2 ? '#edd09e' : '#d99883'} />)}
      <Tree x={22} y={299} scale={1.9} /><Tree x={85} y={367} scale={1.4} light /><Tree x={782} y={310} scale={1.9} /><Tree x={725} y={382} scale={1.5} light />
      <g className="pebble-butterfly" fill="#e8af78"><path d="M291 215h5v5h-5zM299 212h5v7h-5z" /><path fill="#68744e" d="M296 218h3v5h-3z" /></g>
    </g>
  </svg>
}
