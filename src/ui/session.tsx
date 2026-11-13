import { CurrentContext } from "./current";
import { useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Outlet, useLocation } from "react-router";
import { completedAccountChapters } from "../../shared/account";
import { AccountContext } from "../auth/account-context";
import { useUnifiedAccount } from "../auth/useUnifiedAccount";
import { safeReturnTo } from "../auth/returnTo";
import { supabase } from "../supabase";
import { ActionButton, Brand, Modal, ResourceState } from "./common";
import { BootLoading } from './loading/BootLoading';
import { meetsMinimumAge } from './age-visibility';
import { DeleteAccountPanel } from '../features/account/DeleteAccountPanel';

// Existing auth-screen layout: admission failure retains support and deletion.
function AdultAdmission() {
  const [deleting, setDeleting] = useState(false);
  return <main className="auth-screen"><Brand /><h1>Pebble is for adults 18 and older</h1>
    <p>Your saved birthdate does not meet the age requirement. Contact support if it is incorrect.</p>
    <a href="mailto:pebblesupport.help@gmail.com">Contact support</a>
    <ActionButton secondary onClick={() => setDeleting(true)}>Delete account</ActionButton>
    <ActionButton secondary onClick={() => { void supabase?.auth.signOut({ scope: 'local' }); }}>Sign out</ActionButton>
    {deleting && <Modal title="Delete account" close={() => setDeleting(false)}><DeleteAccountPanel close={() => setDeleting(false)} /></Modal>}
  </main>;
}

export function Private({ session }: { session: Session | null }) {
  const location = useLocation();
  if (!session)
    return (
      <Navigate
        replace
        to={`/login?${new URLSearchParams({ returnTo: safeReturnTo(location.pathname + location.search) ?? "/" })}`}
      />
    );
  return (
    <AccountLoader key={session.user.id} session={session}>
      <Outlet />
    </AccountLoader>
  );
}
function AccountLoader({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const account = useUnifiedAccount(session.access_token),
    location = useLocation();
  if (!account.account && account.loading && !account.error) return <BootLoading />;
  if (!account.account)
    return (
      <main className="auth-screen">
        <Brand />
        <ResourceState
          loading={account.loading}
          error={account.error}
          reload={account.reload}
        />
        <ActionButton
          secondary
          onClick={() => {
            void supabase?.auth.signOut({ scope: "local" });
          }}
        >
          Sign out
        </ActionButton>
      </main>
    );
   if (account.account.profile?.birthdate && !meetsMinimumAge(account.account.profile.birthdate)) return <AdultAdmission />;
   if (
    completedAccountChapters(account.account).length < 4 &&
    location.pathname !== "/onboarding"
  )
    return (
      <Navigate
        replace
        to={`/onboarding?${new URLSearchParams({ returnTo: safeReturnTo(location.pathname + location.search) ?? "/" })}`}
      />
    );
  return (
    <CurrentContext.Provider value={{ ...account, session }}>
      <AccountContext.Provider
        value={{
          session,
          account: account.account,
          loaded: true,
          busy: account.busy,
          error: account.error,
          save: account.save,
          reload: account.reload,
        }}
      >
        {children}
      </AccountContext.Provider>
    </CurrentContext.Provider>
  );
}
