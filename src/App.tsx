import { Route, Routes } from 'react-router'
import { AppShell } from './design-system'
import Home from './routes/Home'
import NotFound from './routes/NotFound'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
