import { Route, Routes } from 'react-router'
import { AppShell } from './design-system'
import Home from './routes/Home'
import NotFound from './routes/NotFound'
import { EventDetail, EventsScreen } from './features/events/Browse'
import EventsLayout from './routes/Events'
import { eventDetailRoute, eventsPath } from './features/events/routes'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
      </Route>
      <Route element={<EventsLayout />}>
        <Route path={eventsPath} element={<EventsScreen />} />
        <Route path={eventDetailRoute} element={<EventDetail />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
