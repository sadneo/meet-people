import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { supabase } from "../supabase";
import { apiUrl } from "../platform/native";
import { safeReturnTo } from "../auth/returnTo";
import { parseCallbackGrant } from "../auth/callback-grant";
import { authCallbackUrl, validPassword } from "../auth/credential-policy";
import {
  getLocalDevelopmentEnvironment,
  isLocalDevelopment,
} from "../auth/localDevelopment";
import { useAction } from "./hooks";
import { ActionButton, Brand, ErrorMessage } from "./common";

export function Auth({
  mode = "login",
}: {
  mode?: "login" | "register" | "forgot" | "reset";
}) {
  const action = useAction(),
    navigate = useNavigate(),
    [search] = useSearchParams();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [stage, setStage] = useState<"email" | "password">("email"),
    [notice, setNotice] = useState("");
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    await action.run(async () => {
      if (!supabase)
        throw new Error("Sign-in is unavailable. Try again later.");
      if (mode === "login" && stage === "email") {
        const response = await fetch(apiUrl("/api/auth/email"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
          signal: AbortSignal.timeout(15000),
        });
        const value: unknown = await response.json();
        if (
          !response.ok ||
          !value ||
          typeof value !== "object" ||
          !("exists" in value) ||
          typeof value.exists !== "boolean"
        )
          throw new Error("Could not check your email. Try again.");
        if (!alive.current) return;
        if (value.exists) setStage("password");
        else navigate(`/register?${new URLSearchParams({ email, returnTo })}`);
        return;
      }
      if (forgot) {
        const result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authCallbackUrl(returnTo, true),
        });
        if (result.error)
          throw new Error("Could not send recovery email. Wait and try again.");
        if (alive.current)
          setNotice(
            "If an account exists, a recovery link has been sent. Check your inbox.",
          );
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
          setNotice("Check your email to verify your account, then sign in.");
          if (result.data.session) navigate(returnTo, { replace: true });
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
  const developer =
    import.meta.env.DEV && isLocalDevelopment(getLocalDevelopmentEnvironment());
  return (
    <main className="auth-screen">
      <Brand />
      <div className="auth-card">
        <h1>
          {reset
            ? "Set a new password"
            : forgot
              ? "Forgot your password?"
              : register
                ? "Find your people."
                : "Welcome to Pebble."}
        </h1>
        <form onSubmit={(event) => void submit(event)}>
          {!reset && (
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email || (register ? (search.get("email") ?? "") : "")}
                onChange={(event) => setEmail(event.target.value)}
                disabled={
                  action.busy || (mode === "login" && stage === "password")
                }
              />
            </label>
          )}
          {!forgot && (stage === "password" || register || reset) && (
            <>
              <label>
                Password
                <input
                  type="password"
                  autoComplete={
                    register || reset ? "new-password" : "current-password"
                  }
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {(register || reset) && (
                <label>
                  Confirm password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <ErrorMessage>
            {action.error ||
              (!supabase ? "Sign-in is unavailable. Try again later." : "")}
          </ErrorMessage>
          {notice && <p role="status">{notice}</p>}
          <button className="btn" disabled={action.busy || !supabase}>
            {action.busy
              ? "Please wait…"
              : reset
                ? "Update password"
                : forgot
                  ? "Send recovery link"
                  : register
                    ? "Create account"
                    : stage === "email"
                      ? "Continue"
                      : "Sign in"}
          </button>
        </form>
        {mode === "login" && (
          <>
            <button
              className="text-link"
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
            <button
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
              to={`/auth/forgot-password?${new URLSearchParams({ returnTo })}`}
            >
              Forgot password?
            </Link>
            {stage === "password" && (
              <ActionButton
                secondary
                onClick={() => {
                  setStage("email");
                  setPassword("");
                }}
              >
                Use a different email
              </ActionButton>
            )}
            {developer && (
              <ActionButton
                secondary
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
                Sign in as development user
              </ActionButton>
            )}
          </>
        )}
        <Link to="/login">{register || forgot ? "Back to sign in" : ""}</Link>
        <p className="account-note">
          By continuing, you agree to our <Link to="/terms">Terms</Link> and{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}

export function AuthCallback() {
  const navigate = useNavigate(),
    [incoming] = useState(() => new URL(window.location.href)),
    [status, setStatus] = useState<
      "pending" | "failure" | "information" | "recovery"
    >("pending");
  const completion = useRef<Promise<string> | null>(null);
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
      return parsed.recovery || incoming.pathname === "/reset-password"
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
      <Brand />
      <h1>Account verification</h1>
      {status === "failure" ? (
        <>
          <ErrorMessage>
            This link could not be verified. Request a new link.
          </ErrorMessage>
          <Link to="/auth/forgot-password">Request recovery link</Link>
          <Link to="/login">Sign in</Link>
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
