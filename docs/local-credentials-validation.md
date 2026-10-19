# Local credential validation — parent execution only

The frontend uses the existing **public Supabase client → Supabase Auth** for
`getUser`, `updateUser`, `reauthenticate`, password/email-link sign-in, recovery,
and callback verification. Passwords/nonces stay in the mounted form and are
cleared on submission; forms remount on actor change. There is no credential
table, matching-profile write, Express password proxy, admin browser key, or
custom password storage. Normal SDK session persistence is unchanged. Logout
explicitly uses `{ scope: 'local' }`.

Public `/profile` display name/bio/interests remain session-only and separate
from Auth credentials and authoritative matching identity. These credential
changes do not activate the account-profile SQL candidates.

## Required parent-owned configuration

The coding agent has not read or edited protected configuration. Parent reports
the following settings applied to both source configuration and running local Auth:

- `[auth] minimum_password_length = 8` (the frontend permits 8–128 characters;
  server-enforced strength rules remain authoritative).
- `[auth.email] secure_password_change = true`.
- Keep `[auth.email] secure_email_change = true` and `enable_confirmations = true`.
  Parent's real validation established that **`enable_confirmations = true` is
  also required** for the both-email confirmation behavior; secure email change
  alone was insufficient. Do not disable either confirmation rule to get a pass.
- Preserve existing redirects; add the exact `/auth/callback` URLs for approved
  app origins `http://127.0.0.1:{3000,3002,3004,3194}`. If using `localhost`, add
  those exact host/port callback URLs too. The app's callback query parameters
  are `returnTo=<validated relative path>` and, for recovery, `flow=recovery`.
  Verify local Auth accepts these query variants without broad external redirects.
- Keep local email capture routed to **Mailpit**. Parent identified container
  `supabase_inbucket_meet-people` as image `mailpit:v1.30.2`; its historical
  "inbucket" name does not imply the old Inbucket mailbox API. No hosted SMTP or
  provider is used.
- Anonymous sign-in must be enabled to exercise anonymous upgrade; an explicit
  Auth `anonymous_provider_disabled` result is reported as unsupported.

Do not alter migrations, tables, ranking, queues, JWT verification, email security
rules or public display profile behavior. An existing local app/API must already
be running. This script starts no services and reads no `.env` files.

Exact callback paths (retain all existing approved entries):

```text
http://127.0.0.1:3000/auth/callback
http://127.0.0.1:3002/auth/callback
http://127.0.0.1:3004/auth/callback
http://127.0.0.1:3194/auth/callback
http://localhost:3000/auth/callback
http://localhost:3002/auth/callback
http://localhost:3004/auth/callback
http://localhost:3194/auth/callback
```

## Reviewed real-browser script and admin seam contract

`scripts/validate-local-credentials.mjs` uses the pinned installed Playwright
**1.63.0**. It has no auth/API/module mocks, session injection, traces, screenshots,
password/token logging, or broad database cleanup. Its URL/address, Mailpit,
retry and diagnostic helpers are unit-tested. **The reconciled canonical live
entrypoint has not been executed by the coding agent.** Parent-reported live
evidence from the corrected scratch runner is recorded below separately.

Parent supplies these runtime values only after approving execution:

- `PEBBLE_CREDENTIALS_LIVE_AUTHORIZED=reviewed-local-only`
- `PEBBLE_LOCAL_APP_URL`: loopback origin on port 3000, 3002, 3004 or 3194
- `PEBBLE_LOCAL_MAILPIT_URL`: local Mailpit HTTP origin. The historical
  `PEBBLE_LOCAL_INBUCKET_URL` remains a compatibility alias, with Mailpit semantics.
- `PEBBLE_LOCAL_AUTH_SEAM_URL`: parent-authorized, server-only local seam origin
- `PEBBLE_LOCAL_AUTH_SEAM_CAPABILITY`: ephemeral process-only authorization;
  never forwarded to the browser, Auth client or reports
- Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`

The script discovers the existing app's public Auth URL through its actual
runtime client module. It refuses non-loopback configuration and blocks any
external browser request. This requires a local Vite app exposing the existing
`/src/supabase.ts` module, not a production static bundle.

The seam is **not implemented or published by this change**. Parent reports using
a reviewed, private disposable-only loopback create/cleanup seam; it remains
private scratch, not repository code. Subsequent runs require explicit parent
authorization. All endpoints below are POST under
`/credential-validation/runs/:runId`, protected with the ephemeral capability:

| Endpoint | Required behavior |
| --- | --- |
| `/open` | Register unique UUID run and its exact three `credentials-<runId>[suffix]@example.test` addresses; reject any other domain/address. Return JSON. |
| `/create` | Create exactly the run's first disposable Auth user with supplied random password and confirmed email. Ledger creation before responding. Return `{id,email}`. No application DB seed. |
| `/adopt-anonymous` | Ledger the exact newly created anonymous Auth ID after verifying it is anonymous and was created during this run; never adopt a preexisting actor. |
| `/cleanup` | In `finally`, remove only the exact ledgered disposable Auth IDs (including creations with lost responses). Cross-check run UUID, email allowlist, creation times and known IDs. Refuse unknown/preexisting users. Return `{cleaned:true}` only after authoritative deletion readback. |

Use only the local server-side Auth admin API for this seam. Do not expose a
service-role key, admin API or cleanup capability to the app/browser. Do not
log request bodies or retain passwords/nonces in the seam ledger. Do not
implement table deletes, reset, seed, list-all-and-delete, or domain-wide cleanup.
If cleanup cannot be confirmed, the script reports a cleanup failure category
and exits nonzero; parent retains the seam's private run ledger for followup.

After review, parent may invoke with the above runtime values and:

```text
pnpm exec node scripts/validate-local-credentials.mjs
```

The script creates unique `example.test` accounts and random passwords, changes
email through Settings, confirms both old/new captured local emails, reads Auth
back, sets/changes password, checks old-password rejection/new-password login,
reloads and verifies actor ID/email, and tests recovery. It verifies the same
session actor through authoritative `getUser` plus a successful authenticated
`GET /api/matchmaking/status` and rejected unauthenticated request. Missing
backend RPC support is a failure/prerequisite category, never a claimed pass.
It also verifies anonymous-to-email upgrade and password sign-in on the same ID
when supported. A server-required password challenge exercises `reauthenticate`
and the captured nonce; fresh sessions may legitimately not require that challenge.

### Mailpit contract, retry budget and diagnostics

Mail is fetched only after validating the exact run-scoped `example.test`
recipient. The canonical runner adopts the parent-proven parsing contract:

1. `GET /api/v1/search?query=<encodeURIComponent("to:" + email)>`.
2. Read the response's `messages` array and each message's uppercase `ID`.
3. `GET /api/v1/message/<encoded ID>`; combine `Text` and `HTML`, decoding
   `&amp;` for confirmation links.

There is no global inbox listing, old `/api/v1/mailbox` fallback, or email-body
output. Existing loopback Auth verification-origin, callback-path, run-email and
consumed-message checks remain in place.

Local JSON **GET reads only** have three total attempts, 15-second per-attempt
timeouts and 1s/2s backoff. Only transport/body errors and 429/500/502/503/504
responses are retryable; redirects and other status failures stop immediately.
All URLs must pass the loopback guard before any attempt. Auth/admin mutations
and cleanup are never automatically replayed. Mail arrival polling retains its
60-second outer deadline (an in-flight bounded read can finish after that
deadline). The runner waits 1100ms before recovery-email and reauthentication-code
requests to respect the local 1-second email frequency without weakening it.

Reports contain fixed category/status labels, an allowlisted failure stage, and
up to eight bounded canonical script source-line numbers. **Arbitrary error
messages, raw stacks and provider error codes are never report categories**, even
if they contain only letters/hyphens. Reports contain no identifiers, addresses,
paths, URLs, email bodies, passwords, nonces or tokens.

### Real-parent evidence and remaining validation

Parent reports the corrected ignored `worktree/credential-debug.mjs` runner passed:

- Both old-email and new-email confirmation, with authoritative final email readback.
- Password update, old-password rejection and new-password login.
- Reload retaining the same Auth actor ID/email and application backend accepting
  that authenticated actor.
- Password recovery and anonymous-to-verified-email/password upgrade on the same ID.
- Exact disposable-user cleanup through the private local seam.
- In a subsequent reviewed local run, secure password-change reauthentication:
  parent aged **only the disposable test account's** `auth.sessions.created_at`
  by 25 hours as fixture data, the real server demanded a nonce, the UI requested
  and used the captured email code, and password save passed. Parent reports that
  recovery, anonymous upgrade and cleanup also passed in that run. This was not
  a schema change and was not performed by the coding agent.

These are **parent-reported real local results**, not independently rerun results
from this followup. The canonical Mailpit reconciliation is covered by local
helper tests, not an additional live run. Fresh-session success or a
`not-required-by-server` category alone is not nonce-path evidence; the separately
reported aged-disposable-session run is that parent-owned evidence. The security
closure below has unit/mock-browser execution evidence and still needs parent
live regression after the changed callback ownership.

### Credential security closure

No direct password/token logging, custom credential storage, admin browser seam,
or Express password proxy was found in the inspected files. Server Auth rules and
authoritative `getUser` remain the credential boundary. The three corroborated
source-review observations were addressed in the approved closure:

- `useAuthRequest` gates completion on mount state, request generation, and the
  browser URL captured when the action began. Login/recovery forms remount on
  route-key changes, discarding drafts and pending UI. Late success/error/finally
  handlers cannot update or navigate after leaving, including the history-change
  window before React commits an unmount. Password mode changes clear drafts.
- The login entry distinguishes an existing entry session from its own pending
  sign-in. A `SIGNED_IN` notification cannot unmount password readback or trigger
  the entry-session redirect before that request completes. Existing-session
  safe-return and local anonymous-entry behavior remain supported. Only the Auth
  entry portion of `Onboarding.tsx` changed; public onboarding/profile behavior did not.
- The singleton `src/supabase.ts` disables automatic URL auth detection **only**
  for the callback route (including router-equivalent case, encoding and trailing
  slash). Other paths retain SDK defaults. No second client or config change.
- The callback captures the original URL and immediately replaces query/hash
  before awaiting any Auth operation. A StrictMode one-shot promise handles one
  explicit PKCE, OTP token-hash, or implicit token-pair grant. Duplicate, mixed,
  empty, partial, wrong-location and error-bearing grants reject without any
  exchange/readback; there is no `getSession` inference or old-session fallback.
- Successful exchanges must return a session actor, then `getUser` must verify
  that same actor. Sessionless exchanges reject even when an old user exists.
- A nonempty informational first-link message with no grant shows only a generic
  instruction to confirm from the other inbox and a Settings link. It makes no
  Auth call, does not echo provider text, and never claims new authentication.

These changes do not cancel or roll back an Auth operation already sent to the
server. They prevent stale UI completion/navigation; server outcomes still require
authoritative readback. No unresolved instance of the three reviewed source
findings remains in the exercised paths. Post-closure real local callback/login
regression is parent-owned and has not been run by the coding agent.
