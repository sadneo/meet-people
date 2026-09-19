import { Route, Routes } from 'react-router'
import Home from './routes/Home'
import NotFound from './routes/NotFound'
import Community from './routes/Community'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/community" element={<Community />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
