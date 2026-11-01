import { CurrentContext } from "./current";
import { type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, Outlet, useLocation } from "react-router";
import { completedAccountChapters } from "../../shared/account";
import { AccountContext } from "../auth/account-context";
import { useUnifiedAccount } from "../auth/useUnifiedAccount";
import { safeReturnTo } from "../auth/returnTo";
import { supabase } from "../supabase";
import { ActionButton, Brand, ResourceState } from "./common";

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
