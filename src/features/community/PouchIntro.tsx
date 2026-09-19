import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from './Icon'

type Expression = 'happy' | 'sad' | 'angry' | 'surprised' | 'neutral'
const pebbles: { x: number; y: number; rotation: number; expression: Expression }[] = [
  { x: -29, y: -25, rotation: -18, expression: 'happy' },
  { x: 27, y: -24, rotation: 14, expression: 'surprised' },
  { x: -36, y: 1, rotation: -12, expression: 'sad' },
  { x: 34, y: 5, rotation: 22, expression: 'angry' },
  { x: -22, y: 27, rotation: 16, expression: 'neutral' },
  { x: 21, y: 29, rotation: -17, expression: 'happy' },
  { x: -9, y: -16, rotation: 12, expression: 'surprised' },
  { x: 12, y: 12, rotation: -10, expression: 'sad' },
  { x: 1, y: 35, rotation: 8, expression: 'happy' },
]

function LittlePebble({ expression }: { expression: Expression }) {
  return <svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M26 6C15 7 5 30 6 44c1 13 14 15 29 14 18 0 25-4 24-16C58 28 46 5 34 5Z" fill="#bab5a0" stroke="#7a7b65" strokeWidth="2" />
    <path d="M27 10c-8 3-14 17-15 26" fill="none" stroke="#e3dbc3" strokeWidth="4" strokeLinecap="round" />
    <path d="M44 47h5M23 18h2" stroke="#9b9985" strokeWidth="3" strokeLinecap="round" />
    <g fill="#434939" stroke="#434939" strokeWidth="2.4" strokeLinecap="round">
      <path d="M23 32v3m18-3v3" />
      {expression === 'happy' && <path d="M28 39q4 6 9 0" fill="none" />}
      {expression === 'sad' && <path d="M28 43q4-6 9 0" fill="none" />}
      {expression === 'angry' && <><path d="m20 26 6 3m12 0 6-3M29 42h7" fill="none" /></>}
      {expression === 'surprised' && <ellipse cx="33" cy="42" rx="3" ry="4" />}
      {expression === 'neutral' && <path d="M29 41h7" />}
    </g>
    <path d="M18 39h4m22 0h4" stroke="#d69f88" strokeWidth="3" strokeLinecap="round" />
  </svg>
}

export function PouchIntro({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'open' | 'fade'>('idle')

  useEffect(() => {
    if (phase !== 'open') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fade = window.setTimeout(() => setPhase('fade'), reducedMotion ? 800 : 1750)
    return () => window.clearTimeout(fade)
  }, [phase])

  useEffect(() => {
    if (phase !== 'fade') return
    const finish = window.setTimeout(onFinish, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 450)
    return () => window.clearTimeout(finish)
  }, [phase, onFinish])

  return <button className={`pebble-pouch-intro ${phase}`} aria-label="Open Pebble pouch" aria-disabled={phase !== 'idle'} onClick={() => { if (phase === 'idle') setPhase('open') }}>
    <span className="pebble-intro-wordmark">Pebble<Icon name="leaf" size={29} /></span>
    <span className="pebble-pouch-anchor" aria-hidden="true">
      <svg className="pebble-pouch" viewBox="0 0 140 150" fill="none">
        <ellipse className="pebble-pouch-shadow" cx="70" cy="133" rx="37" ry="6" fill="#786449" opacity=".12" />
        <g className="pebble-pouch-body">
          <path d="M49 46c-5 15-29 35-29 59 0 25 21 28 49 28s51-4 51-28c0-24-26-45-31-59Z" fill="#cba575" stroke="#9b7954" strokeWidth="2" />
          <path d="M51 52c-4 17-24 35-24 53 0 13 6 18 15 20-8-23 10-46 16-70Z" fill="#e0bd8c" />
          <path d="M85 54c4 24 27 47 16 69" stroke="#b48c5d" strokeWidth="6" strokeLinecap="round" />
          <path d="M37 114q30 15 65 0" stroke="#b69062" strokeWidth="1.5" strokeDasharray="3 4" />
          <path d="M58 95c-2-13 7-20 24-17 0 15-10 23-23 18m-3 6 17-18" stroke="#7c8757" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <g className="pebble-pouch-mouth">
          <path d="m50 47-9-28 14 5 13-7 13 7 17-5-11 28Z" fill="#dcc095" stroke="#9b7954" strokeWidth="2" strokeLinejoin="round" />
          <path d="m55 26 6 19m23-18-6 18M69 23v21" stroke="#b5956d" strokeWidth="2" />
          <path d="M49 48q20-7 41 0" stroke="#6e7950" strokeWidth="5" strokeLinecap="round" />
          <path d="M73 47c18-17 31-9 15-1-9 4-17 0-17 0s-11-12-16-7c-8 9 17 7 17 7m0 2 16 23m-17-23-6 19" stroke="#77845a" strokeWidth="3" strokeLinecap="round" />
        </g>
      </svg>
    </span>
    {phase !== 'idle' && <span className="pebble-scatter" aria-hidden="true">{pebbles.map((pebble, index) => <span key={index} className="pebble-scattered-stone" data-expression={pebble.expression} style={{ '--scatter-x': `${pebble.x}vw`, '--scatter-y': `${pebble.y}dvh`, '--scatter-rotation': `${pebble.rotation}deg`, '--scatter-delay': `${index * 23}ms` } as CSSProperties}><LittlePebble expression={pebble.expression} /></span>)}</span>}
    <span className="pebble-pouch-hint">{phase === 'idle' ? 'Tap to begin' : 'A little world is waiting.'}</span>
  </button>
}
