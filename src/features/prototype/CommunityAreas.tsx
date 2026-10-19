import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePrototype } from './context'
import { Icon } from './ui'
import { GeologyMuseum } from './GeologyMuseum'
import { demoMinerals } from './museum-model'
import './museum.css'

// Two independent scenes. Village keeps its existing history/economy state;
// museum specimens are an isolated art-direction exhibit.
export function CommunityAreas({ children, area, onAreaChange }: { children: ReactNode; area: number; onAreaChange: (area: number) => void }) {
  const { empty } = usePrototype()
  const panels = useRef<HTMLDivElement>(null)
  const move = (next: number) => {
    const element = panels.current
    if (!element) return
    element.scrollTo({ left: element.clientWidth * next, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  return <>
    {createPortal(<nav className={`pt-community-area-nav ${area ? 'is-museum' : ''}`} aria-label="Community areas">
      <button className="pt-area-control" aria-label={area ? 'Back to village' : 'Explore geology museum'} title={area ? 'Back to village' : 'Explore geology museum'} onClick={() => move(area ? 0 : 1)}>
        <Icon name={area ? 'tree' : 'museum'} size={32} />
        <span className={area ? 'pt-area-arrow is-return' : 'pt-area-arrow'}><Icon name="arrow" size={22} /></span>
      </button>
    </nav>, document.body)}
    <div ref={panels} className="pt-community-panels" role="region" aria-label="Village and geology museum, scroll horizontally" tabIndex={0} onScroll={event => { const element = event.currentTarget; if (element.clientWidth) onAreaChange(Math.max(0, Math.min(1, Math.round(element.scrollLeft / element.clientWidth)))) }} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : 0) } }}>
      <section className="pt-community-zone pt-village-zone" aria-label="Village" aria-hidden={area !== 0} inert={area !== 0 ? true : undefined}>{children}</section>
      <section className="pt-community-zone pt-museum-zone" aria-label="Museum collection" aria-hidden={area !== 1} inert={area !== 1 ? true : undefined}>
        <GeologyMuseum specimens={empty ? [] : demoMinerals} />
      </section>
    </div>
  </>
}
