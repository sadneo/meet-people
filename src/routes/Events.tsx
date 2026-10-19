import { Outlet } from 'react-router'
import BottomNav from '../design-system/BottomNav'
import './events-layout.css'

// Standalone adapter for this branch. Full-app shells render the screens directly.
export default function EventsLayout() {
  return <div className="events-standalone-shell">
    <main className="events-standalone-main"><Outlet /></main>
    <BottomNav />
  </div>
}
