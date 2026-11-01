import { PasswordField } from "./PasswordField";
import { canShowDating } from './age-visibility'
import { useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import type { Account } from "../../shared/account";
import type { DetailedSettings } from "../../shared/detailed-settings";
import { supabase } from "../supabase";
import { authCallbackUrl, validPassword } from "../auth/credential-policy";
import { useDetailedSettings } from "../features/account/useDetailedSettings";
import { useAction } from "./hooks";
import { ActionButton, ErrorMessage, Icon, ResourceState } from "./common";
import { useCurrent } from "./current";
import { Blocklist } from "./Safety";
import { settingsCategories } from './settings-navigation';
import { MatchingSchedule } from './MatchingSchedule';

function MasterSettings({ category }: { category: 'discovery' | 'notifications' }) {
  const current = useCurrent(),
    [source, setSource] = useState(current.account!.settings),
    [draft, setDraft] = useState(current.account!.settings),
    [notice, setNotice] = useState("");
  // A confirmed save/read may include another tab's changes. Keep the form
  // aligned with that snapshot so later edits cannot restore older choices.
  if (source !== current.account!.settings) {
    setSource(current.account!.settings);
    setDraft(current.account!.settings);
  }
  // The legacy account availability flag is persisted but is not consulted by
  // discovery_details or group proposal projections. Do not present it as a
  // sharing gate or copy it into the independent scoring-settings opt-in.
  const labels: Record<Exclude<keyof Account["settings"], 'availability'>, string> = {
    notifications: "Notifications",
    discoverable: "Discovery",
    location: "Allow device location for search areas",
  };
  return (
    <section className="account-panel">
      <h3>{category === 'notifications' ? 'Activity notifications' : 'Discovery & location'}</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void current
            .save({ ...current.account!, settings: draft })
            .then((ok) => setNotice(ok ? "Preferences saved." : ""));
        }}
      >
        <fieldset disabled={current.busy || !current.available}>
          {(Object.keys(labels) as (keyof typeof labels)[]).filter(key => category === 'notifications' ? key === 'notifications' : key === 'discoverable' || key === 'location').map((key) => (
            <label className="settings-switch" key={key}>
              <span>{labels[key]}</span>
              <input
                type="checkbox"
                role="switch"
                checked={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.checked })
                }
              />
            </label>
          ))}
          <p className="account-note">
            {category === 'discovery' ? 'Allows “Use my current location” when choosing a search area in Discover. Your device asks permission when you use it; this switch alone does not request coordinates. You can still search or move the map manually when it is off.' : 'Choose whether to receive activity notifications. Delivery depends on your device and notification permissions.'}
          </p>
          <button className="btn">Save</button>
        </fieldset>
        <ErrorMessage>{current.error}</ErrorMessage>
        {current.error && (
          <ActionButton secondary onClick={current.reload}>
            Reload account and replace draft
          </ActionButton>
        )}
        {notice && <p role="status">{notice}</p>}
      </form>
    </section>
  );
}
function DetailedForm({
  initial,
  disabled,
  save,
  category,
}: {
  initial: DetailedSettings;
  disabled: boolean;
  save: (value: DetailedSettings["settings"]) => Promise<void>;
  category: 'discovery' | 'notifications';
}) {
  const [value, setValue] = useState(initial.settings);
  const adult = canShowDating(useCurrent().account?.profile?.birthdate);
  const labels = {
    messages: "Message notifications",
    plans: "Plan notifications",
    matches: "Match notifications",
    friendsDiscovery: "Friends discovery",
    datingDiscovery: "Dating discovery",
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(value);
      }}
    >
      <fieldset disabled={disabled}>
        {(Object.keys(labels) as (keyof typeof labels)[]).filter(key => key !== 'datingDiscovery' || adult).filter(key => category === 'discovery' ? key === 'friendsDiscovery' || key === 'datingDiscovery' : key === 'messages' || key === 'plans' || key === 'matches').map((key) => (
          <label className="settings-switch" key={key}>
            <span>{labels[key]}</span>
            <input
              role="switch"
              type="checkbox"
              checked={value[key]}
              onChange={(event) =>
                setValue({ ...value, [key]: event.target.checked })
              }
            />
          </label>
        ))}
        <p className="account-note">
          {category === 'discovery' ? 'Global discovery takes priority. Pausing a mode keeps existing chats available.' : 'Global notification preferences take priority. Saving a preference doesn’t verify delivery.'}
        </p>
        <button className="btn">Save</button>
      </fieldset>
    </form>
  );
}
function Credentials() {
  const current = useCurrent(),
    action = useAction(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [nonce, setNonce] = useState(""),
    [notice, setNotice] = useState(""),
    [reauth, setReauth] = useState(false);
  const methods = useMemo(
    () => [
      ...new Set(
        current.session.user.identities?.map((item) => item.provider) ?? [],
      ),
    ],
    [current.session.user.identities],
  );
  return (
    <section className="account-group credential-settings">
      <details><summary><span><b>Email</b><small>{current.session.user.email || "Your account email"}</small></span><Icon name="ChevronRight"/></summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            if (!supabase) return;
            const result = await supabase.auth.updateUser(
              { email: email.trim() },
              { emailRedirectTo: authCallbackUrl("/settings") },
            );
            if (result.error)
              throw new Error(
                "Email change could not be confirmed. Try again after checking your inboxes.",
              );
            setEmail("");
            setNotice(
              "Check your old and new inboxes to confirm the email change.",
            );
          });
        }}
      >
        <fieldset disabled={action.busy}>
          <label>
            New email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <button className="btn light">Change email</button>
        </fieldset>
      </form>
      </details>
      <div className="account-row"><span><b>Sign-in methods</b><small>{methods.join(", ") || "Provider information unavailable"}</small></span></div>
      <details><summary><span><b>Change password</b><small>Confirm your identity before changing it.</small></span><Icon name="ChevronRight"/></summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action.run(async () => {
            if (!supabase) return;
            if (!validPassword(password) || password !== confirmation)
              throw new Error(
                "Use 8–128 characters and make sure both passwords match.",
              );
            const result = await supabase.auth.updateUser({
              password,
              ...(reauth ? { nonce } : {}),
            });
            if (result.error) {
              if (
                [
                  "reauthentication_needed",
                  "reauthentication_not_valid",
                ].includes(result.error.code ?? "")
              )
                setReauth(true);
              throw new Error(
                "Password change could not be confirmed. Check the verification code or request a new one.",
              );
            }
            setPassword("");
            setConfirmation("");
            setNonce("");
            setReauth(false);
            setNotice("Password updated.");
          });
        }}
      >
        <fieldset disabled={action.busy}>
          <PasswordField
              label="New password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          <PasswordField
              label="Confirm password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          {reauth && (
            <>
              <label>
                Verification code
                <input
                  autoComplete="one-time-code"
                  required
                  value={nonce}
                  onChange={(event) => setNonce(event.target.value)}
                />
              </label>
              <ActionButton
                secondary
                onClick={() => {
                  void action.run(async () => {
                    const result = await supabase!.auth.reauthenticate();
                    if (result.error)
                      throw new Error("Could not send a verification code.");
                    setNotice("Check your inbox for the verification code.");
                  });
                }}
              >
                Send verification code
              </ActionButton>
            </>
          )}
          <button className="btn light">Update password</button>
        </fieldset>
      </form>
      </details>
      <ErrorMessage>{action.error}</ErrorMessage>
      {notice && <p role="status">{notice}</p>}
      <Link className="account-row" to="/logout"><span><b>Sign out</b><small>End your session on this device</small></span><Icon name="ChevronRight"/></Link>
    </section>
  );
}
export function ProfileSettingsLinks() {
  const adult=canShowDating(useCurrent().account?.profile?.birthdate);
  return <div className="account-group profile-settings-links">{settingsCategories.map(([id, title, detail, icon]) => <Link className="account-row" key={id} to={`/profile?section=${id}`}><span className="account-row-icon"><Icon name={icon}/></span><span className="account-row-copy"><b>{title}</b><small>{id==='discovery'&&!adult?'Friends & location':detail}</small></span><Icon name="ChevronRight"/></Link>)}</div>;
}

export function Settings() {
  const [search] = useSearchParams();
  const category = settingsCategories.find(item => item[0] === search.get('section'));
  return <Navigate replace to={category ? `/profile?section=${category[0]}` : '/profile?section=settings'}/>;
}

export function ProfileSettings({ section }: { section: string }) {
  const current = useCurrent(),
    detailed = useDetailedSettings(
      current.session.user.id,
      current.session.access_token,
      current.busy,
    ),
    [notice, setNotice] = useState("");
  const category = settingsCategories.find(item => item[0] === section);
  if (!category) return <Navigate replace to="/profile"/>;
  return (
    <div className="account-page settings-page">
      <Link className="account-back" to="/profile?section=settings"><Icon name="Back"/>Settings</Link>
      <div className="pagehead"><h2>{category[1]}</h2></div>
      <div className="settings-detail" key={category[0]}>
          {(category[0] === 'discovery' || category[0] === 'notifications') && <MasterSettings category={category[0]}/>}
          {category[0] === 'privacy' && <section className="account-panel">
            <h3>Shared availability</h3>
            <p className="account-note">Manage shared-time explanations below or in Edit profile → Interests & Availability. Both places use the same setting. Weekly time windows are edited in your profile.</p>
            <MatchingSchedule token={current.session.access_token} disabled={current.busy} onSaved={() => window.dispatchEvent(new Event('pebble:matching-changed'))}/>
          </section>}
          {(category[0] === 'discovery' || category[0] === 'notifications') && <>
          <section className="account-panel">
            <h3>{category[1]} preferences</h3>
            <ResourceState
              loading={detailed.loading}
              error={detailed.error}
              reload={() => void detailed.reload()}
            />
            {detailed.snapshot && (
                <DetailedForm
                  category={category[0]}
                key={detailed.snapshot.revision}
                initial={detailed.snapshot}
                disabled={!detailed.canWrite}
                save={async (settings) => {
                  if (
                    await detailed.save({
                      expectedRevision: detailed.snapshot!.revision,
                      settings,
                    })
                  )
                    setNotice("Detailed preferences saved.");
                }}
              />
            )}
            {notice && <p role="status">{notice}</p>}
          </section>
          </>}
          {category[0] === 'discovery' && <div className="account-group"><Link className="account-row" to="/matchmaking?mode=friends&preferences=true"><span><b>Friends preferences</b><small>Who you’d like to meet & search area</small></span><Icon name="ChevronRight"/></Link>{canShowDating(current.account?.profile?.birthdate) && <Link className="account-row" to="/matchmaking?mode=dating&preferences=true"><span><b>Dating preferences</b><small>Who you’d like to date & search area</small></span><Icon name="ChevronRight"/></Link>}</div>}
          {category[0] === 'account' && <Credentials/>}
          {category[0] === 'safety' && <Blocklist/>}
          {(category[0] === 'privacy' || category[0] === 'safety') && <section className="account-panel">
            <h3>Help & privacy</h3>
            <p>
              For support, account deletion or a data request, use the contact
              information in our <Link to="/privacy">Privacy Policy</Link>.
            </p>
            <div className="row wrap">
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/cookies">Cookies</Link>
            </div>
          </section>}
      </div>
    </div>
  );
}
