import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import type { DemoState } from './demo'

// Remounted for each transaction; cleanup also handles route changes and reset.
export function RewardFeedback({ feedback, world = false }: { feedback: NonNullable<DemoState['feedback']>; world?: boolean }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 2300)
    return () => window.clearTimeout(timer)
  }, [])
  if (!visible) return null
  if (world) return <div className="pebble-grow-feedback" aria-hidden="true"><span className="pebble-grow-ring" /><span className="pebble-grow-spark a">✦</span><span className="pebble-grow-spark b">✧</span><span className="pebble-grow-spark c">✦</span><span className="pebble-grow-label">A little more belonging.</span></div>
  return <span className={`pebble-balance-feedback ${feedback.kind}`} aria-hidden="true">{feedback.kind === 'earn' ? '+' : '−'}{feedback.amount}<Icon name="pebble" size={14} /></span>
}
