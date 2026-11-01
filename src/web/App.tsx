import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { SessionQueryProvider } from '../data/SessionQueryProvider'
import { Events, EventDetail } from '../ui/Events'
import { Landing, Legal } from '../ui/Public'

const DevelopmentNavigator = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true'
  ? lazy(() => import('../ui/DevelopmentNavigator'))
  : null

export default function Web() {
  return <SessionQueryProvider scope="public">
    {DevelopmentNavigator && <Suspense fallback={null}><DevelopmentNavigator product="web" /></Suspense>}
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/welcome" element={<Navigate replace to="/" />} />
      <Route path="/explore" element={<Events publicView />} />
      <Route path="/explore/:id" element={<EventDetail publicView />} />
      <Route path="/terms" element={<Legal kind="terms" />} />
      <Route path="/privacy" element={<Legal kind="privacy" />} />
      <Route path="/cookies" element={<Legal kind="cookies" />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  </SessionQueryProvider>
}
