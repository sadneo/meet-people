import { Navigate, Route, Routes } from 'react-router'
import PebbleApp from '../../src/routes/PebbleApp'
import { AppShell } from '../../src/features/prototype/AppShell'
import { ProfileScreen } from '../../src/features/prototype/Social'
import { MatchingViews } from '../../src/features/matchmaking/MatchingViews'

// Source-level Profile/editor tests intentionally exercise null/error snapshots.
// No production bypass: full App's required completion is covered in app-access.
export default function ProfileFeatureRoutes() {
  return <Routes><Route element={<PebbleApp />}><Route element={<AppShell />}>
    <Route path="/profile" element={<ProfileScreen />} />
    <Route path="/profile/account" element={<Navigate replace to="/profile" />} />
    <Route path="/matchmaking" element={<MatchingViews mode="active" />} />
  </Route></Route></Routes>
}
