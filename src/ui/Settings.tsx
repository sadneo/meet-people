import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Account } from "../../shared/account";
import type { DetailedSettings } from "../../shared/detailed-settings";
import { supabase } from "../supabase";
import { authCallbackUrl, validPassword } from "../auth/credential-policy";
import { useDetailedSettings } from "../features/account/useDetailedSettings";
import { useMatchmaking } from "../features/matchmaking/useMatchmaking";
import { useAction } from "./hooks";
import { ActionButton, ErrorMessage, ResourceState } from "./common";
import { useCurrent } from "./current";
import { Blocklist } from "./Safety";

function MasterSettings() {
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
  const labels: Record<keyof Account["settings"], string> = {
    notifications: "Notifications",
    discoverable: "Discovery",
    availability: "Share availability",
    location: "Location preference",
  };
  return (
    <section className="account-panel">
      <h3>Your preferences</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void current
            .save({ ...current.account!, settings: draft })
            .then((ok) => setNotice(ok ? "Preferences saved." : ""));
        }}
      >
        <fieldset disabled={current.busy || !current.available}>
          {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
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
            The location preference doesn’t request device coordinates. Choose a
            search area separately in Discover.
          </p>
          <button className="btn">Save preferences</button>
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
}: {
  initial: DetailedSettings;
  disabled: boolean;
  save: (value: DetailedSettings["settings"]) => Promise<void>;
}) {
  const [value, setValue] = useState(initial.settings);
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
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
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
          Global notification and discovery preferences take priority. Saving a
          notification preference doesn’t verify delivery.
        </p>
        <button className="btn">Save detailed preferences</button>
      </fieldset>
    </form>
  );
}
function Downtime() {
  const current = useCurrent(),
    matching = useMatchmaking(current.session.access_token),
    action = useAction(),
    [confirm, setConfirm] = useState(false);
  return (
    <section className="account-panel">
      <h3>Downtime matching</h3>
      <p>
        Keep a Friends queue open when you’re away. An active search replaces it
        and doesn’t restart downtime automatically.
      </p>
      <ErrorMessage>{matching.error || action.error}</ErrorMessage>
      <p role="status">
        {matching.known
          ? matching.mode === "downtime"
            ? "Downtime is on"
            : matching.mode === "active"
              ? "Active Friends search is on"
              : "Downtime is off"
          : "Checking saved status…"}
      </p>
      <div className="row wrap">
        <ActionButton
          disabled={matching.busy || !matching.known || !matching.canJoin}
          onClick={() => {
            if (matching.mode === "active") setConfirm(true);
            else
              void matching.queue(
                matching.mode === "downtime" ? "leave" : "join",
                "downtime",
              );
          }}
        >
          {matching.mode === "downtime"
            ? "Turn off downtime"
            : "Turn on downtime"}
        </ActionButton>
        <ActionButton
          secondary
          disabled={matching.busy}
          onClick={() => void matching.queue("refresh")}
        >
          Refresh status
        </ActionButton>
      </div>
      {confirm && (
        <div className="notice">
          <p>Replace your active Friends search with downtime matching?</p>
          <ActionButton
            disabled={matching.busy}
            onClick={() => {
              setConfirm(false);
              void matching.queue("join", "downtime");
            }}
          >
            Replace active search
          </ActionButton>
          <ActionButton secondary onClick={() => setConfirm(false)}>
            Cancel
          </ActionButton>
        </div>
      )}
    </section>
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
    <section className="account-panel">
      <h3>Account & security</h3>
      <p>{current.session.user.email}</p>
      <p className="account-note">
        Sign-in methods: {methods.join(", ") || "Unavailable"}
      </p>
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
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
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
      <ErrorMessage>{action.error}</ErrorMessage>
      {notice && <p role="status">{notice}</p>}
      <p>
        <Link to="/logout">Sign out</Link>
      </p>
    </section>
  );
}
export function Settings() {
  const current = useCurrent(),
    detailed = useDetailedSettings(
      current.session.user.id,
      current.session.access_token,
      current.busy,
    ),
    [notice, setNotice] = useState("");
  return (
    <div className="account-page">
      <h2>Settings</h2>
      <div className="settings-layout">
        <div>
          <MasterSettings />
          <section className="account-panel">
            <h3>Discovery & notifications</h3>
            <ResourceState
              loading={detailed.loading}
              error={detailed.error}
              reload={() => void detailed.reload()}
            />
            {detailed.snapshot && (
              <DetailedForm
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
          <Downtime />
        </div>
        <div>
          <Credentials />
          <Blocklist />
          <section className="account-panel">
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
          </section>
        </div>
      </div>
    </div>
  );
}
