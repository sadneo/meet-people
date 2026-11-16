import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from './feedback'

const width = 128

// Swipe a row left to reveal a secondary action. Tapping the row while it is
// open closes it instead of following the link. Keyboard and screen-reader
// users reach the same action from the conversation's options menu.
export function SwipeReveal({ action, children }: { action: ReactNode; children: ReactNode }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ id: number; x: number; y: number; from: number; active: boolean } | null>(null)
  const row = useRef<HTMLDivElement>(null)
  const open = offset < 0
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!row.current?.contains(event.target as Node)) setOffset(0) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  if (!action) return <>{children}</>
  return <div ref={row} className={`swipe-reveal ${open ? 'is-open' : ''}`}>
    <div className="swipe-reveal-action" aria-hidden={!open} inert={!open}>{action}</div>
    <div
      className={`swipe-reveal-front ${dragging ? 'is-dragging' : ''}`}
      style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      onPointerDown={event => {
        if (event.pointerType === 'mouse') return
        start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: offset, active: false }
      }}
      onPointerMove={event => {
        const state = start.current
        if (!state || state.id !== event.pointerId) return
        const dx = event.clientX - state.x, dy = event.clientY - state.y
        if (!state.active) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { start.current = null; return }
          if (Math.abs(dx) < 10) return
          state.active = true
          setDragging(true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        setOffset(Math.max(-width - 24, Math.min(0, state.from + dx)))
      }}
      onPointerUp={event => {
        const state = start.current
        start.current = null
        if (!state?.active || state.id !== event.pointerId) return
        setDragging(false)
        const next = offset < -width / 2 ? -width : 0
        if (next && !state.from) haptic('light')
        setOffset(next)
      }}
      onPointerCancel={() => { start.current = null; setDragging(false); setOffset(0) }}
      onClickCapture={event => {
        if (open || dragging) { event.preventDefault(); event.stopPropagation(); setOffset(0) }
      }}
    >{children}</div>
  </div>
}
