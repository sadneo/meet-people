import { useId, type CSSProperties } from 'react'
import landscape from '../../assets/pebble/community/village-landscape.png'
import './community-breeze.css'

// Inset patches keep the baked silhouettes, trunks and ground untouched. Each
// pose is painted at integer coordinates; CSS only switches its visibility.
const canopies: Record<string, string> = {
  'tree-back': 'M745 183H841V205H871V260H850V285H740V265H718V220H745Z',
  'tree-left': 'M285 393H349V411H382V453H360V477H280V451H265V416H285Z',
  'tree-right': 'M1118 417H1188V437H1218V478H1200V502H1111V479H1098V443H1118Z',
  'tree-front': 'M479 688H521V707H547V740H472V720H460V702H479Z',
}

function BreezePatch({ outline, duration, delay, kind }: { outline: string; duration: number; delay: number; kind: 'tree' | 'grass' }) {
  const id = useId()
  return <g data-community-motion={kind} className="pt-breeze" pointerEvents="none" aria-hidden="true"
    style={{ '--breeze-duration': `${duration}s`, '--breeze-delay': `${delay}s` } as CSSProperties}>
    <defs><clipPath id={id}><path d={outline} /></clipPath></defs>
    <g clipPath={`url(#${id})`}>
      {[0, 2, -2].map((x, index) => <image key={x} className="pt-breeze-frame" data-breeze-pose={index}
        href={landscape} x={x} y="0" width="1448" height="1086" />)}
    </g>
  </g>
}

export function TreeBreeze({ id }: { id: string }) {
  const index = Object.keys(canopies).indexOf(id)
  return <BreezePatch outline={canopies[id]} duration={12 + index * 1.7} delay={-index * 3.1} kind="tree" />
}

export function GrassBreeze() {
  return <>{[
    'M786 632H801V645H814V658H786Z',
    'M585 589H605V601H617V609H585Z',
    'M936 739H954V749H971V758H936Z',
  ].map((outline, index) => <BreezePatch key={outline} outline={outline} duration={16 + index * 2.3} delay={-4 - index * 4.7} kind="grass" />)}</>
}
