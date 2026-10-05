import { useSyncExternalStore } from 'react'
import { Route, Routes } from 'react-router'
import { usePrototype } from './features/prototype/context'
import NotFound from './routes/NotFound'
import Community from './routes/Community'
import PebbleApp, { ImmersiveLayout, IntroScreen } from './routes/PebbleApp'
import { AppShell } from './features/prototype/AppShell'
import { Auth, Onboarding } from './features/prototype/Onboarding'
import { EventDetail, EventsScreen } from './features/events/Browse'
import { eventDetailRoute, eventsPath } from './features/events/routes'
import { ActivityPaths, ConfirmedPlan, FreeTime, Matches, Planning, ReviewPlan } from './features/prototype/Planning'
import { Chat, ChatDetails, Connection, Messages, ProfileScreen, Settings } from './features/prototype/Social'
import { PebbleGarden } from './features/prototype/PebbleGarden'
import MatchmakingHome from './features/prototype/MatchmakingHome'
import DowntimeMatchmaking from './features/prototype/DowntimeMatchmaking'

function subscribeToCompactLayout(callback: () => void) {
  const query = window.matchMedia('(max-width: 800px)')
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function MessagesWorkspace() {
  const { scene } = usePrototype()
  const compact = useSyncExternalStore(subscribeToCompactLayout, () => window.matchMedia('(max-width: 800px)').matches)
  const chatVisible = !compact || scene === 'Chat'
  return <div className="pt-messages-workspace"><section className="pt-inbox-pane" aria-label="Conversation inbox"><Messages chatVisible={chatVisible} /></section><section className="pt-conversation-pane" aria-label="Selected conversation"><Chat visible={chatVisible} /></section><aside className="pt-chat-details" aria-label="Conversation details"><ChatDetails /></aside></div>
}

function App() {
  return (
    <Routes>
      <Route element={<PebbleApp />}>
        <Route element={<AppShell />}>
          <Route index element={<PebbleGarden />} />
          <Route path="matchmaking" element={<MatchmakingHome />} />
          <Route path="downtime-matchmaking" element={<DowntimeMatchmaking />} />
          <Route path={eventsPath} element={<EventsScreen />} />
          <Route path={eventDetailRoute} element={<EventDetail />} />
          <Route path="free-time" element={<FreeTime />} />
          <Route path="free-time/matches" element={<Matches />} />
          <Route path="free-time/activities" element={<ActivityPaths />} />
          <Route path="free-time/plan" element={<Planning />} />
          <Route path="free-time/review" element={<ReviewPlan />} />
          <Route path="free-time/confirmed" element={<ConfirmedPlan />} />
          <Route path="free-time/connection" element={<Connection />} />
          <Route path="messages" element={<MessagesWorkspace />} />
          <Route path="messages/chat" element={<MessagesWorkspace />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="profile/person" element={<ProfileScreen other />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route element={<ImmersiveLayout />}>
          <Route path="intro" element={<IntroScreen />} />
          <Route path="login" element={<Auth />} />
          <Route path="register" element={<Auth register />} />
          <Route path="onboarding" element={<Onboarding />} />
        </Route>
      </Route>
      <Route path="/prototype/yzcommunity" element={<Community />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
