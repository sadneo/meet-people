import { useRef, useState } from 'react'
import { Icon } from '../../ui/common'

export function ProfilePreview() {
  const [mode, setMode] = useState<'Friends' | 'Dating'>('Friends')
  const indicator = useRef<HTMLSpanElement>(null)
  const dating = mode === 'Dating'
  function select(next: typeof mode) {
    if (next === mode) return
    const from = indicator.current ? getComputedStyle(indicator.current).transform : null
    setMode(next)
    if (from && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      indicator.current?.animate?.([
        { transform: from, backgroundColor: dating ? '#64444d' : '#524c3d' },
        { transform: next === 'Dating' ? 'translateX(100%)' : 'translateX(0)', backgroundColor: next === 'Dating' ? '#64444d' : '#524c3d' },
      ], { duration: 220, easing: 'cubic-bezier(.22,1.12,.36,1)' })
    }
  }
  return <div className="landing-visual">
    <div className="landing-mode" role="group" aria-label="Preview a matching mode">
      <span ref={indicator} className={`landing-mode-indicator${dating ? ' dating' : ''}`} aria-hidden="true" />
      {(['Friends', 'Dating'] as const).map(item => <button type="button" key={item} aria-pressed={mode === item} onClick={() => select(item)}><Icon name={item}/><span>{item}</span></button>)}
    </div>
    <div className="landing-profile">
      <img src={dating ? '/garden/preview-maya.jpg' : '/garden/preview-alex.jpg'} alt={`${dating ? 'Maya' : 'Alex'}, a fictional ${mode} profile in the demo`} width="800" height="1200" />
      <div className="landing-profile-shade" />
      <div className="landing-profile-info"><h3>{dating ? 'Maya, 21' : 'Alex, 22'}</h3></div>
    </div>
  </div>
}
