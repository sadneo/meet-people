import { useEffect, useRef, useState } from 'react'
import { haptic } from './feedback'

const threshold = 72

function scrolledAncestor(target: EventTarget | null) {
  for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
    if (node.scrollTop > 0) return true
    if (node.closest('dialog[open], input, textarea, select, canvas')) return true
  }
  return (document.scrollingElement?.scrollTop ?? window.scrollY) > 0
}

// Touch-only pull-down at the top of a list. Buttons that already refresh stay
// available for keyboard, mouse and assistive technology.
export function PullToRefresh({ onRefresh, label = 'Refreshing' }: { onRefresh: () => unknown; label?: string }) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const distance = useRef(0)
  const refresh = useRef(onRefresh)
  useEffect(() => { refresh.current = onRefresh })
  useEffect(() => {
    const down = (event: TouchEvent) => {
      if (busy || event.touches.length !== 1 || scrolledAncestor(event.target)) { start.current = null; return }
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      distance.current = 0
    }
    const move = (event: TouchEvent) => {
      if (!start.current) return
      const dy = event.touches[0].clientY - start.current.y
      const dx = Math.abs(event.touches[0].clientX - start.current.x)
      if (dy <= 0 || dx > dy) { if (distance.current === 0) start.current = null; return }
      const next = Math.min(120, dy * 0.5)
      if (distance.current < threshold && next >= threshold) haptic('light')
      distance.current = next
      setPull(next)
    }
    const up = () => {
      if (!start.current) return
      start.current = null
      const reached = distance.current >= threshold
      distance.current = 0
      setPull(0)
      if (!reached) return
      setBusy(true)
      void Promise.resolve(refresh.current()).finally(() => setTimeout(() => setBusy(false), 400))
    }
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', up)
    document.addEventListener('touchcancel', up)
    return () => {
      document.removeEventListener('touchstart', down)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', up)
    }
  }, [busy])
  const visible = busy || pull > 8
  return <div className={`pull-refresh ${visible ? 'is-visible' : ''} ${busy ? 'is-busy' : ''}`}
    style={{ transform: `translate(-50%, ${busy ? 56 : Math.max(0, pull - 16)}px)` }} aria-hidden={!busy}>
    <span className="pull-refresh-icon" style={busy ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / threshold) }}/>
    {busy && <span className="sr-only" role="status">{label}</span>}
  </div>
}
