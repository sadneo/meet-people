# Accounts and authentication

## Flow

Authentication starts with email only. `POST /api/auth/email` validates the email
and uses the server's service-role client to call `auth_email_exists`. Existing
accounts proceed to password sign-in; new emails proceed to registration. Google
is available at either step, including for Google-only accounts. Supabase still
performs all password verification, registration, confirmation, OAuth and recovery.
Only a valid session enters account loading/onboarding or the requested internal
destination. Email/step navigation uses router history state; passwords stay in
component memory and are cleared when the email changes. Recovery reuses the email.

### Email lookup security and privacy

Automatic branching **reveals whether an email is registered**. This is an
intentional product/privacy tradeoff; it cannot be eliminated while retaining
account-existence branching. The response contains only a boolean, never user
IDs, providers, passwords or profile data. Recovery messages remain non-enumerating.

The migration `20261016120000_auth_email_lookup.sql` is required. Its fixed-search-path
function performs one exact email lookup (using the non-SSO email index), excludes
deleted/anonymous accounts, and grants execution only to `service_role`, with
`PUBLIC`, `anon` and `authenticated` explicitly revoked. No users are listed or
enumerated in application code. Service credentials stay in the API environment.
Missing keys/migrations and database failures fail closed; the UI never guesses
that an email is new after a lookup failure. SAML SSO accounts are outside this
app's supported email/Google provider flow.

The API accepts JSON only, rejects browser cross-site requests, returns no-store
responses and generic errors, and bounds lookups to 10 attempts per socket IP
and 1,000 total per ten-minute window. It does not trust `X-Forwarded-For`.
These limits are in-memory and single-process: restarts reset them, and multiple
replicas each have their own budget. Deploy shared gateway/WAF rate limiting and
bot protection before scaling or exposing this endpoint to sustained automated
abuse. Behind a proxy, socket-IP limits conservatively group all traffic from
that proxy; configure client-IP limits at the trusted edge, not by trusting
arbitrary forwarded headers in Express. Supabase's own Auth rate limits remain
in effect for sign-in, registration and recovery, but do not protect this lookup.
Do not log submitted emails or request bodies at the API or gateway.

Supabase Auth supplies identity. After login, the app loads
`GET /api/matchmaking/account` using the access token. New or incomplete
accounts enter `/onboarding`; completed accounts return to their requested
internal route. Each chapter saves before advancing. Refresh resumes the
first unfinished chapter. Profile and settings edits use the same account.

`PUT /api/matchmaking/account` validates the account snapshot and calls
`save_account` under the user's JWT. The RPC derives ownership from
`auth.uid()` and atomically writes:

| Table | Data |
| --- | --- |
| `profiles` | Display name, username, bio, nullable avatar URL, area, birthdate |
| `user_interests` | Interest labels |
| `availability` | Weekly matching time windows |
| `account_settings` | Private settings, social intent, time presets, distance/group preferences, completed chapters |

Settings are readable only by their owner. Browser roles cannot directly
write the private table. Public profiles retain their existing public-read
policy. Signing out or changing accounts unmounts the old workspace; late
responses cannot populate the next account. Failed saves retain the last
confirmed data and show an error.

Photos are optional and default to `null`, displayed as a silhouette.
Users may set an HTTPS image URL in onboarding or profile editing. Google
photos are not automatically imported. Upload/storage support is separate.

Availability presets populate campus-time windows: mornings 08:00–12:00,
afternoons 12:00–17:00, evenings 17:00–21:00 daily, weekends 08:00–21:00
Saturday/Sunday. Matchmaking preferences edit the underlying weekly windows.
Profile edits preserve custom windows unless time presets change.
Distance/group preferences are saved; they do not introduce new ranking
rules or geolocation enforcement.

Interest embedding is optional enrichment. Provider failure leaves the label
saved with a null embedding rather than rolling back onboarding. Semantic
matching still requires a configured provider; null embeddings do not claim
semantic similarity. No automatic backfill is added.

Guest preview remains available. Sample people, messaging, safety controls,
plans, and community progression remain prototype features. Guest state is
not imported into authenticated accounts. Profile, settings, interests,
preferences, and onboarding progress are database-backed.

## Local setup

```bash
pnpm supabase:start
pnpm exec supabase migration up --local
pnpm env:local
pnpm dev
```

After auth configuration changes, restart without resetting data:

```bash
pnpm supabase:stop
pnpm supabase:start
```

Email confirmation is enabled; passwords require eight characters.
Local confirmation and recovery emails appear at
[Mailpit](http://127.0.0.1:54324), not in external inboxes.
An existing email-link account can use **Forgot your password?** to establish
a password, then sign in with email/password.

## Google setup

Create a Google Cloud **Web application** OAuth client. Configure:

| Setting | Local | Hosted |
| --- | --- | --- |
| JavaScript origin | `http://127.0.0.1:3000` | Your app origin |
| Google redirect URI | `http://127.0.0.1:54321/auth/v1/callback` | Callback copied from Supabase's Google provider panel |

Export these variables in the shell that starts local Supabase (or source
them from an ignored secrets file):

```bash
export SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID='your-client-id'
export SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET='your-client-secret'
```

Set `[auth.external.google].enabled = true` in `supabase/config.toml`, then
restart the stack. Keep credentials out of `VITE_*` variables and git.
Add test users to Google's consent screen while the OAuth app is in testing.

For hosted Supabase, enable Google and enter the client ID/secret in
**Authentication → Sign In / Providers → Google**. The app's
`Continue with Google` button uses that provider configuration.

## Hosted setup

1. Apply the checked-in migrations to the intended Supabase project.
2. Set browser URL/publishable key and API URL/publishable/service-role keys.
3. Set the Site URL to your app origin; allow its `/auth/callback` redirects,
   including the `returnTo` query string, and `/reset-password` URL with its
   `returnTo` query string. Use
   environment-specific allowlists. Google redirects to Supabase first,
   then Supabase redirects to the app.
4. Enable email confirmation and minimum password length eight.
5. Configure custom SMTP for delivery to real inboxes.
6. Configure the Google provider as above.
7. Ensure static hosting rewrites app routes to `index.html` and forwards
   `/api/*` to Express.

Recovery emails return to `/reset-password`. The recovery session can set a
new password before normal account/onboarding redirects resume. Supabase's
browser session handling persists and refreshes tokens.

## Verification

```bash
pnpm test:auth
pnpm test tests/account.test.tsx
pnpm test:e2e e2e/auth.spec.ts
pnpm verify
```

The auth check creates disposable accounts, verifies password login/recovery,
sequential onboarding, persistent edits, optional photos and private-data
isolation, then deletes those accounts. The browser check reads ignored
`.env.local` server credentials only in its test process, requires local
Supabase, and checks real login, onboarding resume, profile/settings
persistence, logout, and switching accounts. Google's complete round trip
requires configured credentials and a manual check.

Sources: [password auth](https://supabase.com/docs/guides/auth/passwords),
[Google auth](https://supabase.com/docs/guides/auth/social-login/auth-google),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
