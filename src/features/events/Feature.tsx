import type { ReactNode } from 'react'
import './events.css'

// Feature styling only: the host supplies main, navigation, and page gutters.
export function EventsFeature({ children }: { children: ReactNode }) {
  return <div className="ev-feature">{children}</div>
}
