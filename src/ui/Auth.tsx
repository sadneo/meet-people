import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { supabase } from "../supabase";
import { legalPublication } from "../features/public/legal-content";
import { safeReturnTo } from "../auth/returnTo";
import { parseCallbackGrant } from "../auth/callback-grant";
import { authCallbackUrl, validPassword } from "../auth/credential-policy";
import {
  getLocalDevelopmentEnvironment,
  isLocalDevelopment,
} from "../auth/localDevelopment";
import { useAction } from "./hooks";
import { ErrorMessage } from "./common";
import { useShakeOnError } from "./feedback";
import { BusyLabel } from "./FeedbackUi";

import { PasswordField } from "./PasswordField";

// Keep only non-secret form text during in-app policy navigation. Passwords
// remain component-local and are never written to history or browser storage.
const emailDrafts = new Map<string, string>();

const RESEND_COOLDOWN_SECONDS = 30;

type Sent = { kind: "signup" | "recovery"; email: string };

function CheckInbox({
  sent,
  returnTo,
  onResend,
  onChangeEmail,
}: {
  sent: Sent;
  returnTo: string;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS),
    [resent, setResent] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const signup = sent.kind === "signup",
    signIn = `/login?${new URLSearchParams({ email: sent.email, returnTo })}`;
  async function resend() {
    setError("");
    setResent(false);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    try {
      await onResend();
      setResent(true);
    } catch {
      setError("Could not resend the email. Wait a moment and try again.");
    }
  }
  return (
    <div className="auth-inbox">
      <p>
        {signup
          ? "We sent a link to confirm your account to"
          : "If an account exists, we sent a reset link to"}
      </p>
      <p className="auth-inbox-email">{sent.email}</p>
      <ErrorMessage>{error}</ErrorMessage>
      {resent && !error && <p role="status">Sent again. Check your inbox.</p>}
      <button
        type="button"
        className="auth-submit"
        disabled={cooldown > 0}
        onClick={() => void resend()}
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
      </button>
      <div className="auth-recovery-options">
        <button type="button" className="text-link" onClick={onChangeEmail}>
          Use a different email
        </button>
        <Link to={signIn}>Sign in</Link>
      </div>
      {signup && (
        <p className="auth-inbox-hint">
          Already have an account? <Link to={signIn}>Sign in</Link> or{" "}
          <Link to={`/auth/forgot-password?${new URLSearchParams({ email: sent.email, returnTo })}`}>
            reset your password
          </Link>
          .
        </p>
      )}
    </div>
  );
}

export function Auth({
  mode = "login",
}: {
  mode?: "login" | "register" | "forgot" | "reset";
}) {
  const action = useAction(),
    navigate = useNavigate(),
    [search] = useSearchParams();
  const [email, setEmail] = useState(() => search.get("email") ?? emailDrafts.get(mode) ?? ""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [notice, setNotice] = useState(""),
    [sent, setSent] = useState<Sent | null>(null);
  useEffect(() => { emailDrafts.set(mode, email); }, [mode, email]);
  const form = useRef<HTMLFormElement>(null);
  useShakeOnError(form, action.error);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const returnTo = safeReturnTo(search.get("returnTo")) ?? "/",
    reset = mode === "reset",
    forgot = mode === "forgot",
    register = mode === "register";
  // Keep the single-use reset form and live resend timer open while reading policies.
  const policyLink = reset || sent
    ? { target: "_blank", rel: "noopener" }
    : { state: { authFrom: forgot ? "/auth/forgot-password" : register ? "/register" : "/login", returnTo } };
  function changeEmail(value: string) {
    if (value === email) return;
    setEmail(value);
    setPassword("");
    setConfirm("");
    setNotice("");
    action.clearError();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    await action.run(async () => {
      if (!supabase)
        throw new Error("Sign-in is unavailable. Try again later.");
      if (forgot) {
        const result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authCallbackUrl(returnTo, true),
        });
        if (result.error)
          throw new Error("Could not send recovery email. Wait and try again.");
        if (alive.current) setSent({ kind: "recovery", email });
        return;
      }
      if (
        !validPassword(password) ||
        ((register || reset) && password !== confirm)
      )
        throw new Error(
          "Use 8–128 characters and make sure the passwords match.",
        );
      if (reset) {
        const result = await supabase.auth.updateUser({ password });
        if (result.error)
          throw new Error(
            "Could not update your password. Request a new recovery link and try again.",
          );
        if (alive.current) {
          setPassword("");
          setConfirm("");
          setNotice("Password updated.");
          navigate(returnTo, { replace: true });
        }
      } else if (register) {
        const result = await supabase.auth.signUp({
          email: email || search.get("email") || "",
          password,
          options: { emailRedirectTo: authCallbackUrl(returnTo) },
        });
        if (result.error)
          throw new Error(
            "Could not create your account. Check your email and password, or try signing in.",
          );
        if (alive.current) {
          setPassword("");
          setConfirm("");
          if (result.data.session) navigate(returnTo, { replace: true });
          else setSent({ kind: "signup", email: email || search.get("email") || "" });
        }
      } else {
        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error)
          throw new Error(
            "Could not sign in. Check your email and password, and verify your email first.",
          );
        if (alive.current) navigate(returnTo, { replace: true });
      }
    });
  }
  async function resend() {
    if (!supabase || !sent) throw new Error("Sign-in is unavailable.");
    const result =
      sent.kind === "signup"
        ? await supabase.auth.resend({
            type: "signup",
            email: sent.email,
            options: { emailRedirectTo: authCallbackUrl(returnTo) },
          })
        : await supabase.auth.resetPasswordForEmail(sent.email, {
            redirectTo: authCallbackUrl(returnTo, true),
          });
    if (result.error) throw result.error;
  }
  const developer =
    import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment());
  return (
    <div className="auth-page auth-centered">
    <main className="auth-main">
      <section className="auth-form-section" aria-labelledby="auth-title">
      <div className="auth-form-wrap">
        <div className="auth-centered-logo">
          <img src="/pebble/pebble-wordmark.svg" alt="Pebble" width="170" height="76" />
        </div>
        <h1 id="auth-title">
          {sent
            ? "Check your inbox"
            : reset
            ? "Set a new password"
            : forgot
              ? "Forgot your password?"
              : register
                ? "Find your people."
                 : "Welcome to Pebble"}
        </h1>
        {sent ? (
          <CheckInbox
            sent={sent}
            returnTo={returnTo}
            onResend={resend}
            onChangeEmail={() => setSent(null)}
          />
        ) : (<>
        {mode === 'login' && <p className="auth-introduction">Sign in or create an account to find your people.</p>}
        <form ref={form} onSubmit={(event) => void submit(event)}>
          {!reset && (
            <>
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => changeEmail(event.target.value)}
                disabled={action.busy}
              />
            </>
          )}
          {!forgot && (
            <>
              <PasswordField
                  label="Password"
                  id="auth-password"
                  autoComplete={
                    register || reset ? "new-password" : "current-password"
                  }
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              {(register || reset) && (
                <>
                  <PasswordField
                    label="Confirm password"
                    id="auth-confirm"
                      autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </>
              )}
            </>
          )}
          <ErrorMessage>
            {action.error ||
              (!supabase ? "Sign-in is unavailable. Try again later." : "")}
          </ErrorMessage>
          {notice && <p role="status">{notice}</p>}
          {mode === "login" && <div className="auth-recovery-options">
            <button
              type="button"
              className="text-link"
              disabled={action.busy || !supabase || !email}
              onClick={() => {
                void action.run(async () => {
                  const result = await supabase!.auth.signInWithOtp({
                    email,
                    options: {
                      shouldCreateUser: false,
                      emailRedirectTo: authCallbackUrl(returnTo),
                    },
                  });
                  if (result.error)
                    throw new Error("Could not send a sign-in link.");
                  setNotice("Check your inbox for your sign-in link.");
                });
              }}
            >
              Email me a sign-in link
            </button>
            <Link
              to={`/auth/forgot-password?${new URLSearchParams({ email, returnTo })}`}
            >
              Forgot password?
            </Link>
          </div>}
           <button className="auth-submit" disabled={action.busy || !supabase}>
            {action.busy
              ? <BusyLabel busy>Please wait…</BusyLabel>
              : reset
                ? "Update password"
                : forgot
                  ? "Send recovery link"
                  : register
                    ? "Create account"
                    : "Sign in"}
          </button>
        </form>
        {mode === 'login' && <Link className="auth-account-link" to={`/register?${new URLSearchParams({ email, returnTo })}`}>New to Pebble? Create an account</Link>}
        {mode === "login" && (
          <>
            <div className="auth-or" aria-hidden="true">or</div>
            <button
              className="auth-google"
              disabled={action.busy || !supabase}
              onClick={() => {
                void action.run(async () => {
                  const result = await supabase!.auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: authCallbackUrl(returnTo) },
                  });
                  if (result.error)
                    throw new Error("Google sign-in is unavailable.");
                });
              }}
            >
              Continue with Google
            </button>
            {developer && (
              <div className="auth-dev-section">
              <p className="auth-dev-label">Local development</p>
              <button
                type="button"
                className="auth-dev-button"
                disabled={action.busy || !supabase}
                onClick={() => {
                  void action.run(async () => {
                    const { signInDevelopmentUser } =
                      await import("../auth/developmentLogin");
                    await signInDevelopmentUser(supabase!, () => alive.current);
                    if (alive.current) navigate(returnTo, { replace: true });
                  });
                }}
              >
                 Sign in as dev
              </button>
              <p className="auth-demo-note">Local development account. No hosted accounts are changed.</p>
              </div>
            )}
          </>
        )}
        {(register || forgot) && <Link className="auth-home-link" to={`/login?${new URLSearchParams({ email, returnTo })}`}>Back to sign in</Link>}
        </>)}
        {mode !== "login" && <p className="account-note auth-consent">
          By continuing, you agree to our <Link to="/terms" {...policyLink}>Terms</Link> and{" "}
          <Link to="/privacy" {...policyLink}>Privacy Policy</Link>.
        </p>}
        <footer className="auth-footer">
          <Link to="/privacy" {...policyLink}>Privacy</Link>
          <Link to="/terms" {...policyLink}>Terms</Link>
          <a href={`mailto:${legalPublication.contactEmail}`}>Safety</a>
        </footer>
      </div>
      </section>
    </main>
    </div>
  );
}

export function AuthCallback() {
  const navigate = useNavigate(),
    [incoming] = useState(() => new URL(window.location.href)),
    [status, setStatus] = useState<
      "pending" | "failure" | "information" | "recovery"
    >("pending");
  const completion = useRef<Promise<string> | null>(null);
  const [failure] = useState(() => callbackFailure(incoming));
  useEffect(() => {
    let live = true;
    window.history.replaceState(window.history.state, "", "/auth/callback");
    completion.current ??= (async () => {
      const parsed = parseCallbackGrant(incoming);
      if (parsed.kind === "information") return "information";
      if (!supabase) throw new Error("Sign-in unavailable");
      const grant = parsed.grant;
      const result =
        grant.kind === "code"
          ? await supabase.auth.exchangeCodeForSession(grant.code)
          : grant.kind === "otp"
            ? await supabase.auth.verifyOtp({
                token_hash: grant.token,
                type: grant.type,
              })
            : await supabase.auth.setSession({
                access_token: grant.access,
                refresh_token: grant.refresh,
              });
      if (result.error || !result.data.session) throw new Error("Invalid link");
      const verified = await supabase.auth.getUser();
      if (
        verified.error ||
        verified.data.user?.id !== result.data.session.user.id
      )
        throw new Error("Invalid identity");
      const pathname = decodeURIComponent(incoming.pathname).replace(/\/+$/, '').toLowerCase();
      return parsed.recovery || pathname === "/reset-password"
        ? "recovery"
        : (safeReturnTo(incoming.searchParams.get("returnTo")) ?? "/");
    })();
    void completion.current
      .then((destination) => {
        if (live) {
          if (destination === "recovery" || destination === "information")
            setStatus(destination);
          else navigate(destination, { replace: true });
        }
      })
      .catch(() => {
        if (live) setStatus("failure");
      });
    return () => {
      live = false;
    };
  }, [incoming, navigate]);
  if (status === "recovery") return <Auth mode="reset" />;
  return (
    <main className="auth-screen">
      <img
        className="brand"
        src="/pebble/pebble-wordmark.svg"
        alt="Pebble"
        width="150"
        height="66"
      />
      <h1>{status === "failure" ? "Link expired" : "Account verification"}</h1>
      {status === "failure" ? (
        <>
          <p className="auth-callback-copy">
            {failure.code === "otp_expired" || failure.code === "access_denied"
              ? "This link was already used or has expired."
              : "This link could not be verified. It may have been used already or expired."}
          </p>
          <div className="auth-callback-actions">
            <Link className="auth-submit" to={`/login?${new URLSearchParams({ returnTo: failure.returnTo })}`}>
              Sign in
            </Link>
            {failure.recovery ? (
              <Link to={`/auth/forgot-password?${new URLSearchParams({ returnTo: failure.returnTo })}`}>
                Send a new reset link
              </Link>
            ) : (
              <ResendConfirmation returnTo={failure.returnTo} />
            )}
          </div>
        </>
      ) : (
        <p role="status">
          {status === "information"
            ? "Check both inboxes to finish confirming your email change."
            : "Verifying your account…"}
        </p>
      )}
    </main>
  );
}

// Supabase reports a used or expired link as error_code (query or hash). A
// recovery link is only identifiable from the flow we put on its redirect URL.
function callbackFailure(incoming: URL) {
  const hash = new URLSearchParams(incoming.hash.slice(1)),
    read = (key: string) => incoming.searchParams.get(key) ?? hash.get(key) ?? "",
    code = read("error_code");
  return {
    code,
    recovery:
      read("flow") === "recovery" ||
      incoming.pathname.replace(/\/+$/, "").toLowerCase() === "/reset-password",
    returnTo: safeReturnTo(read("returnTo")) ?? "/",
  };
}

function ResendConfirmation({ returnTo }: { returnTo: string }) {
  const action = useAction(),
    [email, setEmail] = useState(""),
    [sent, setSent] = useState(false);
  if (sent)
    return <p role="status">If that address is waiting for confirmation, a new link is on its way.</p>;
  return (
    <form
      className="auth-callback-resend"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          if (!supabase) throw new Error("Sign-in is unavailable. Try again later.");
          const result = await supabase.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: authCallbackUrl(returnTo) },
          });
          if (result.error)
            throw new Error("Could not send a new link. Wait and try again.");
          setSent(true);
        });
      }}
    >
      <label htmlFor="callback-email">Need a new confirmation link?</label>
      <input
        id="callback-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@example.com"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={action.busy}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      <button className="btn" disabled={action.busy || !supabase}>
        {action.busy ? <BusyLabel busy>Please wait…</BusyLabel> : "Resend confirmation"}
      </button>
    </form>
  );
}
