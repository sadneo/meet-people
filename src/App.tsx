import { lazy, Suspense, useCallback, useEffect } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router";
import { MessagingActivitySchema } from "../shared/messaging";
import { messagingRequest } from "./features/messaging/client";
import { useSession } from "./auth/useSession";
import { supabase } from "./supabase";
import NativeBridge from "./platform/NativeBridge";
import { Private } from "./ui/session";
import { Auth, AuthCallback } from "./ui/Auth";
import { Discover } from "./ui/Discover";
import { Profile, Onboarding } from "./ui/Profile";
import { Settings } from "./ui/Settings";
import { Events, EventDetail } from "./ui/Events";
import { Messages } from "./ui/Messages";
import { Requests } from "./ui/Requests";
import { Activity } from "./ui/Activity";
import { Garden } from "./ui/Garden";
import { retainGardenFor } from './ui/garden-state';
import { Landing, Legal } from "./ui/Public";
import { useAction, useLoad } from "./ui/hooks";
import {
  ActionButton,
  Brand,
  Empty,
  ErrorMessage,
  Icon,
  Loading,
} from "./ui/common";

const DevelopmentNavigator = import.meta.env.DEV
  ? lazy(() => import('./ui/DevelopmentNavigator'))
  : null;

function Shell() {
  const location = useLocation(),
    garden = ["/", "/home", "/community"].includes(location.pathname);
  const activity = useLoad(
    useCallback(
      (signal) =>
        messagingRequest("/activity", MessagingActivitySchema, { signal }),
      [],
    ),
  );
  useEffect(() => {
    window.addEventListener("pebble:activity-changed", activity.reload);
    return () =>
      window.removeEventListener("pebble:activity-changed", activity.reload);
  }, [activity.reload]);
  const links = [
    ["Garden", "/"],
    ["Events", "/events"],
    ["Discover", "/matchmaking"],
    ["Messages", "/messages"],
    ["Profile", "/profile"],
  ];
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <nav className="app-navigation" aria-label="Main navigation">
          <Brand />
          {links.map(([label, to]) => (
            <NavLink key={label} end={to === "/"} to={to}>
              <Icon name={label} />
              <span>{label}</span>
              {label === "Messages" &&
                activity.value &&
                activity.value.incomingRequests +
                  activity.value.unreadConversations >
                  0 && (
                  <span className="activity-dot" aria-label="Unread activity" />
                )}
            </NavLink>
          ))}
          <div className="sub">
            <NavLink to="/activity">Activity</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </div>
        </nav>
        <main id="main" className={garden ? "sky-garden-main" : ""}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
function Logout() {
  const action = useAction(),
    navigate = useNavigate();
  return (
    <main className="auth-screen">
      <Brand />
      <h1>Sign out of Pebble?</h1>
      <ErrorMessage>{action.error}</ErrorMessage>
      <ActionButton
        disabled={action.busy}
        onClick={() => {
          void action.run(async () => {
            const result = await supabase?.auth.signOut({ scope: "local" });
            if (result?.error)
              throw new Error("Could not sign out. Try again.");
            navigate("/login", { replace: true });
          });
        }}
      >
        Sign out
      </ActionButton>
      <Link to="/">Back</Link>
    </main>
  );
}
function NotFound() {
  return (
    <Empty title="This page isn’t here.">
      <Link to="/">Back to Pebble</Link>
    </Empty>
  );
}
export default function App() {
  const { session, ready } = useSession();
  useEffect(() => { if (ready) retainGardenFor(session?.user.id ?? null) }, [ready, session?.user.id]);
  if (!ready)
    return (
      <main className="auth-screen">
        <Brand />
        <Loading />
      </main>
    );
  return (
    <>
      <NativeBridge />
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route
          path="/"
          element={session ? <Private session={session} /> : <Landing />}
        >
          <Route element={<Shell />}>
            <Route index element={<Garden />} />
          </Route>
        </Route>
        <Route path="/login" element={<Auth />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<AuthCallback />} />
        <Route path="/auth/forgot-password" element={<Auth mode="forgot" />} />
        <Route path="/forgot-password" element={<Auth mode="forgot" />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="/cookies" element={<Legal kind="cookies" />} />
        <Route path="/explore" element={<Events publicView />} />
        <Route path="/explore/:id" element={<EventDetail publicView />} />
        <Route element={<Private session={session} />}>
          <Route path="/messages/requests" element={<Requests />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<Shell />}>
            <Route path="/home" element={<Garden />} />
            <Route path="/community" element={<Garden />} />
            <Route path="/matchmaking" element={<Discover />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/chat" element={<Messages />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/matches" element={<Activity />} />
            <Route
              path="/downtime-matchmaking"
              element={<Navigate replace to="/settings" />}
            />
            <Route
              path="/complete-profile"
              element={<Navigate replace to="/onboarding" />}
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
      {DevelopmentNavigator && <Suspense fallback={null}><DevelopmentNavigator /></Suspense>}
    </>
  );
}
