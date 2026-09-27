import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import Home from './routes/Home'
import NotFound from './routes/NotFound'
import Community from './routes/Community'

const Prototype = lazy(() => import('./routes/Prototype'))

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/community" element={<Community />} />
      <Route path="/prototype" element={<Suspense fallback={<p role="status">Opening Pebble…</p>}><Prototype /></Suspense>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
