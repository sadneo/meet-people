import { Navigate, Route, Routes } from 'react-router'
import NotFound from './routes/NotFound'
import Community from './routes/Community'
import PebbleApp, { ImmersiveLayout, IntroScreen } from './routes/PebbleApp'
import { AppShell } from './features/prototype/AppShell'
import { AuthScreen } from './auth/AuthScreen'
import NativeBridge from './platform/NativeBridge'
import MessagesWorkspace from './features/messaging/Feature'
import { EventDetail, EventsScreen } from './features/events/Browse'
import { eventDetailRoute, eventsPath } from './features/events/routes'
import { ActivityPaths, ConfirmedPlan, FreeTime, Matches, Planning, ReviewPlan } from './features/prototype/Planning'
import { Connection, ProfileScreen, Settings } from './features/prototype/Social'
import { Home } from './features/prototype/Home'
import { PebbleGarden } from './features/prototype/PebbleGarden'
import MatchmakingHome from './features/prototype/MatchmakingHome'
import DowntimeMatchmaking from './features/prototype/DowntimeMatchmaking'
import { AuthCallback, ForgotPassword } from './auth/CredentialRoutes'
import { PublicAuthLayout, SessionRequired } from './auth/AppAccess'
import { PublicLayout } from './features/public/PublicLayout'
import { MarketingPage } from './features/public/MarketingPage'
import { LegalPage } from './features/public/LegalPage'
import { GuestEventDetail, GuestEvents } from './features/public/GuestEvents'
import { publicEventsPath } from './features/public/links'

function App() {
  return (
    <><NativeBridge /><Routes>
      <Route element={<PublicLayout />}>
        <Route path="welcome" element={<MarketingPage />} />
        <Route path="terms" element={<LegalPage document="terms" />} />
        <Route path="privacy" element={<LegalPage document="privacy" />} />
        <Route path="cookies" element={<LegalPage document="cookies" />} />
        <Route path={publicEventsPath} element={<GuestEvents />} />
        <Route path={`${publicEventsPath}/:id`} element={<GuestEventDetail />} />
      </Route>
      <Route element={<PublicAuthLayout />}>
        <Route path="login" element={<AuthScreen />} />
        <Route path="register" element={<AuthScreen mode="register" />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route path="auth/forgot-password" element={<ForgotPassword />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<AuthCallback />} />
      </Route>
      <Route element={<SessionRequired />}>
      <Route path="complete-profile" element={null} />
      <Route path="onboarding" element={null} />
      <Route element={<PebbleApp />}>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="home" element={<Home />} />
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
          <Route path="profile/account" element={<Navigate to="/profile" replace />} />
          <Route path="profile/person" element={<ProfileScreen other />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route element={<ImmersiveLayout />}>
          <Route path="intro" element={<IntroScreen />} />
        </Route>
      </Route>
      <Route path="/prototype/yzcommunity" element={<Community />} />
      <Route path="*" element={<NotFound />} />
      </Route>
    </Routes></>
  )
}

export default App