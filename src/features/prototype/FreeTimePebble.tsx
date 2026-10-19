import type { CSSProperties } from 'react'
import { Pebble } from './ui'

export function FreeTimePebble({ count = 1, compact = false }: { count?: number; compact?: boolean }) {
  return <div className={`pt-ripple ${compact ? 'pt-ripple-compact' : ''}`} aria-hidden="true"><span /><span /><span />{Array.from({ length: count }, (_, i) => <div key={i} className="pt-ripple-stone" style={{ '--i': i, '--count': count } as CSSProperties}><Pebble expression={i === 2 ? 'surprised' : 'happy'} /></div>)}</div>
}
