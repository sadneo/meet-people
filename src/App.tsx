import { Route, Routes } from 'react-router'
import NotFound from './routes/NotFound'
import Community from './routes/Community'
import PebbleApp, { ImmersiveLayout, IntroScreen } from './routes/PebbleApp'
import { AppShell } from './features/prototype/AppShell'
import { Onboarding } from './features/prototype/Onboarding'
import { AuthScreen } from './auth/AuthScreen'
import { EventDetail, EventsScreen } from './features/events/Browse'
import { eventDetailRoute, eventsPath } from './features/events/routes'
import { ActivityPaths, ConfirmedPlan, FreeTime, Matches, Planning, ReviewPlan } from './features/prototype/Planning'
import { Connection, ProfileScreen, Settings } from './features/prototype/Social'
import MessagesWorkspace from './features/messaging/Feature'
import { Home } from './features/prototype/Home'
import { PebbleGarden } from './features/prototype/PebbleGarden'
import MatchmakingHome from './features/prototype/MatchmakingHome'
import DowntimeMatchmaking from './features/prototype/DowntimeMatchmaking'

function App() {
  return (
    <Routes>
      <Route element={<PebbleApp />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="community" element={<PebbleGarden />} />
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
          <Route path="login" element={<AuthScreen />} />
          <Route path="register" element={<AuthScreen mode="register" />} />
          <Route path="auth/callback" element={<AuthScreen mode="callback" />} />
          <Route path="forgot-password" element={<AuthScreen mode="forgot" />} />
          <Route path="reset-password" element={<AuthScreen mode="reset" />} />
          <Route path="onboarding" element={<Onboarding />} />
        </Route>
      </Route>
      <Route path="/prototype/yzcommunity" element={<Community />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
