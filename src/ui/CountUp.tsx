import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './feedback'

// Counts from the previous value to the new one. Increases also show a short
// "+N" badge beside the number; decreases (spending) just count down.
// `live` stays false until the value is real data, so the first load doesn't
// count up from a placeholder.
export function CountUp({ value, duration = 650, live = true }: { value: number; duration?: number; live?: boolean }) {
  const [shown, setShown] = useState(value)
  const [gain, setGain] = useState<{ amount: number; key: number } | null>(null)
  const from = useRef(value)
  const wasLive = useRef(live)
  useEffect(() => {
    const start = from.current
    const animated = wasLive.current && live
    from.current = value
    wasLive.current = live
    if (start === value) return
    const reduced = prefersReducedMotion() || !animated
    const began = performance.now()
    let frame = 0, first = true
    const step = (now: number) => {
      if (reduced) { setShown(value); return }
      if (first) { first = false; if (value > start) setGain({ amount: value - start, key: began }) }
      const progress = Math.min(1, Math.max(0, now - began) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setShown(Math.round(start + (value - start) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(frame); setShown(value) }
  }, [value, duration, live])
  useEffect(() => {
    if (!gain) return
    const timer = setTimeout(() => setGain(null), 1200)
    return () => clearTimeout(timer)
  }, [gain])
  return <>
    {shown.toLocaleString()}
    {gain && <span key={gain.key} className="count-gain" aria-hidden="true">+{gain.amount.toLocaleString()}</span>}
  </>
}
