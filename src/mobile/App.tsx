import { lazy, Suspense, useCallback, useEffect } from "react";
import { useQueryClient } from '@tanstack/react-query';
import { prefetchNavigation } from '../data/navigation';
import { useCurrent } from '../ui/current';
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
import { useCachedLoad } from "../data/useCachedLoad";
import { MessagingActivitySchema } from "../../shared/messaging";
import { messagingRequest } from "../features/messaging/client";
import { useSession } from "../auth/useSession";
import { supabase } from "../supabase";
import NativeBridge from "../platform/NativeBridge";
import { SessionQueryProvider } from "../data/SessionQueryProvider";
import { Private } from "../ui/session";
import { Auth, AuthCallback } from "../ui/Auth";
import { Discover } from "../ui/Discover";
import { Profile } from "../ui/Profile";
import { Onboarding } from "../ui/Onboarding";
import { Settings } from "../ui/Settings";
import { Events, EventDetail } from "../ui/Events";
import { EventGroup } from './EventGroup';
import { Messages } from "../ui/Messages";
import { Requests } from "../ui/Requests";
import { Activity } from "../ui/Activity";
import { Garden } from "../features/garden/Garden";
import { retainGardenFor } from '../features/garden/state';
import { Legal } from "../ui/Public";
import { useAction } from "../ui/hooks";
import {
  ActionButton,
  Brand,
  Empty,
  ErrorMessage,
  Icon,
  Loading,
} from "../ui/common";

const DevelopmentNavigator = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true'
  ? lazy(() => import('./DevelopmentNavigator'))
  : null;

function Shell() {
  const client = useQueryClient(), current = useCurrent();
  useEffect(() => {
    const warm = () => { prefetchNavigation(client, '/events', current.session.access_token); prefetchNavigation(client, '/messages', current.session.access_token); };
    if ('requestIdleCallback' in window) {
      const idle = window.requestIdleCallback(warm, { timeout: 1000 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(warm, 300);
    return () => clearTimeout(timer);
  }, [client, current.session.access_token]);
  const location = useLocation(),
    garden = ["/", "/home", "/community"].includes(location.pathname);
  const activity = useCachedLoad(
    useCallback(
      (signal) =>
        messagingRequest("/activity", MessagingActivitySchema, { signal }),
      [],
    ),
    ["activity"], 2000,
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
          {links.map(([label, to]) => label === 'Garden' ? (
            <Link key={label} to={to} className={garden ? 'active' : undefined} aria-current={garden ? 'page' : undefined}><Icon name={label}/><span>{label}</span></Link>
          ) : (
            <NavLink key={label} to={to} onPointerEnter={() => prefetchNavigation(client, to, current.session.access_token)} onFocus={() => prefetchNavigation(client, to, current.session.access_token)}>
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
            <NavLink to="/matches">Matches &amp; Plans</NavLink>
            <NavLink to="/activity">Activity</NavLink>
            <Link className={location.pathname === "/profile" && location.search.includes("section=settings") ? "active" : undefined} to="/profile?section=settings">Settings</Link>
          </div>
        </nav>
        <main id="main" className={garden ? "sky-garden-main" : location.pathname === '/matchmaking' ? 'mobile-dating-main' : ''}>
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
    <SessionQueryProvider scope={session?.user.id ?? "public"}>
      <NativeBridge />
      {DevelopmentNavigator && <Suspense fallback={null}><DevelopmentNavigator /></Suspense>}
      <Routes>
        <Route path="/welcome" element={<Navigate replace to="/" />} />
        {!session && <Route path="/" element={<Navigate replace to="/login" />} />}
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
        <Route element={<Private session={session} />}>
          <Route path="/messages/requests" element={<Requests />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<Shell />}>
            {session && <Route index element={<Garden />} />}
            <Route path="/home" element={<Garden />} />
            <Route path="/community" element={<Garden />} />
            <Route path="/matchmaking" element={<Discover />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail renderGroup={(id, available) => <EventGroup id={id} available={available} />} />} />
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
    </SessionQueryProvider>
  );
}
