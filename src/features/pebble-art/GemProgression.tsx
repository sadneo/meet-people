import type { GemFamily, MineralStage } from '../prototype/museum-model'

// Small code-native pixel sprites: four mineral silhouettes, one shared light
// direction and rock palette. No image generation or changes to supplied PNGs.
const palettes: Record<GemFamily, { edge: string; shadow: string; body: string; light: string; glint: string }> = {
  garnet: { edge: '#673d42', shadow: '#8e434b', body: '#bb5960', light: '#df8782', glint: '#f6bab0' },
  sapphire: { edge: '#354c73', shadow: '#466b9d', body: '#6497c7', light: '#99c5e5', glint: '#d4e7ed' },
  emerald: { edge: '#365e4c', shadow: '#498268', body: '#70a882', light: '#a5ce9e', glint: '#d8e9bd' },
  citrine: { edge: '#94703e', shadow: '#bf913e', body: '#e4bb56', light: '#f2d985', glint: '#fff0b7' },
}
const silhouettes: Record<GemFamily, string> = {
  garnet: 'M22 8h20v4h8v8h6v22h-6v8h-8v4H22v-4h-8v-8H8V20h6v-8h8Z',
  sapphire: 'M26 6h12v6h8v8h6v10h4v14h-8v8H16v-8H8V30h4V20h6v-8h8Z',
  emerald: 'M20 6h24v6h6v36h-6v8H20v-8h-6V12h6Z',
  citrine: 'M28 4h8v6h8v8h6v12h4v20h-8v6H18v-6h-8V30h4V18h6v-8h8Z',
}
function GemFace({ family }: { family: GemFamily }) {
  return <g fill="#343e39" data-expression={family}>
    {family === 'garnet' && <><path d="M19 27h4v2h4v3h-4v-2h-4Zm26 0h-4v2h-4v3h4v-2h4Z" /><path d="M22 33h5v6h-5Zm15 0h5v6h-5ZM27 44h10v3H27Z" /></>}
    {family === 'sapphire' && <><path d="M19 29h4v-2h5v3h-5v2h-4Zm26 0h-4v-2h-5v3h5v2h4Z" /><path d="M22 34h4v5h-4Zm16 0h4v5h-4ZM27 46v-3h3v-2h4v2h3v3h-3v-2h-4v2Z" /></>}
    {family === 'emerald' && <><path d="M20 33h3v3h5v-3h3v5H20Zm15 0h3v3h5v-3h3v5H35ZM28 43h3v2h3v-2h3v4h-9Z" /></>}
    {family === 'citrine' && <><path d="M19 35v-4h3v-3h3v3h3v4h-3v-2h-3v2Zm17 0v-4h3v-3h3v3h3v4h-3v-2h-3v2Z" /><path d="M26 40h13v7h-3v3h-7v-3h-3Z" /><path fill="#e5987f" d="M29 46h7v3h-7Z" /></>}
    <path fill="#e9a18a" opacity=".7" d="M16 39h6v3h-6Zm27 0h6v3h-6Z" />
  </g>
}
export function GemProgression({ family, stage }: { family: GemFamily; stage: MineralStage }) {
  const p = palettes[family]
  return <svg className="pt-pixel-art pt-mineral-sprite" viewBox="0 0 64 64" aria-hidden="true" shapeRendering="crispEdges" stroke="none" data-gem-family={family} data-gem-stage={stage}>
    <path fill="#c4ccbf" d="M12 55h40v5H12Z" />
    {stage < 3 && <g><path fill="#777565" d="M22 10h20v6h8v8h6v26h-6v6H14v-6H8V28h6V18h8Z" /><path fill="#b8b59a" d="M22 14h18v6h9v9h4v18h-7v6H16v-7h-5V29h7V20h4Z" /><path fill="#ded7b8" d="M22 16h15v6H25v7h-7v12h-5V29h5V20h4Z" /><path fill="#94947a" d="M39 21h8v9h5v16h-7v6H32v-6h8v-9h4V27h-5ZM17 43h7v7h-7Z" /></g>}
    {stage === 0 ? <><path fill={p.edge} d="M33 15h5v12h-6v9h6v13h-6V38h-6V25h7Z" /><path fill={p.light} d="M34 18h2v10h-6v6h-2v-8h6Zm0 21h2v8h-2Z" /><path fill={p.body} d="M44 40h5v5h-5Z" /></> : <g transform={stage === 1 ? 'translate(12 15) scale(.65)' : stage === 2 ? 'translate(3 2) scale(.92)' : undefined}>
      <path fill={p.edge} d={silhouettes[family]} />
      <path fill={p.body} d="M24 12h16v5h6v8h4v17h-6v7H20v-7h-6V25h4v-8h6Z" />
      <path fill={p.light} d="M25 14h7v15h-7v8H16V26h5v-7h4Z" />
      <path fill={p.shadow} d="M35 14h4v6h6v7h4v15h-6v6H32V36h7V24h-4Z" />
      <path fill={p.glint} d="M25 15h5v7h-5v5h-5v-7h5ZM17 28h4v5h-4ZM25 48h9v3h-9Z" />
      {stage === 3 && <GemFace family={family} />}
    </g>}
    {stage === 1 && <path fill="#aaa88e" d="M10 37h8v6h7v8h15v-8h6v-7h7v14h-7v6H16v-6h-6Z" />}
    {stage === 2 && <><path fill="#9a9981" d="M8 45h7v-6h5v10h9v7H12v-4H8Zm38-5h5v8h5v7H38v-6h8Z" /><path fill="#d6d0b1" d="M10 45h5v6h9v3H12Zm37 1h4v5h-9v-3h5Z" /></>}
  </svg>
}
