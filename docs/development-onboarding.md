# Required onboarding and local development login

## Ordinary accounts

Authenticate normally. Before any private shell mounts, Pebble reads canonical
identity and matching preferences. Missing/partial data enters `/onboarding`:
explicit username/display name (optional bio), then at least three unique interests,
valid birthdate, nonempty city/campus area and at least one availability window.
There are no ordinary-user defaults or local completion flags. Saves require
authoritative readback. Interrupted accounts resume; ready accounts return to the
validated original destination. Errors block with read-only retry/logout; uncertain
writes are not automatically resubmitted. No queues start during onboarding.

## One-click development account — operator prerequisite, not provisioning

The **Sign in as development user** control is build-time DEV plus loopback only.
It POSTs explicit JSON intent to `/__dev/login`. The handler exists only in Vite
`serve` mode `development`, with its existing strict `127.0.0.1` bind. Use the
`http://127.0.0.1:<Vite port>` origin, not a remote host, proxy or `localhost` alias.
Preview/build and the Express production server do not register this handler.
The production browser bundle must not contain its endpoint or control.

Separately authorized operator work must create and fully populate a dedicated
local account, then supply the fixed file
`~/.local/share/pebble/development-account.json` owned by the Vite OS user, mode
`0600`, a regular nonsymlink file, at most 8192 bytes. Its strict JSON keys are:

| Key | Requirement |
| --- | --- |
| `accountId` | Dedicated account UUID |
| `email` | Exact email verified by Auth readback |
| `password` | Dedicated account password; server-only, never returned |
| `url` | HTTP loopback local Supabase origin with explicit port; no path/query/userinfo |
| `publicKey` | Public publishable or legacy `anon` key only; never service-role/admin |

No browser-selected path, environment credential, `VITE_` password, embedded secret,
admin API, automatic seeding or provisioning endpoint exists. Do not put this file
or its contents into the repository, build output, logs, screenshots or notes.

The handler requires exact Host/Origin, loopback local/remote socket, POST,
`application/json` and only `{ "intent": "development-sign-in" }`. It rejects
forwarded/cross-site requests, has no CORS response, returns `no-store`, bounds body
size/time and local network calls, and never follows provider redirects. Missing,
invalid or unready provisioning yields a redacted 503. A busy request yields 429.

Server-side Supabase password authentication disables session persistence and auto
refresh. `getUser` must match configured UUID/email and be nonanonymous. Existing
`get_account_profile` and `get_matchmaking_profile` RPCs run directly against local
Supabase under that user token, avoiding proxy self-deadlock. Both must establish
readiness. Only normal short-lived session fields are returned; the browser uses
SDK `setSession` and `getUser` verification, then the ordinary readiness gate.
No rejected attempt revokes shared-account sessions. Normal password/email login
remains a separate fallback and never fills ordinary-user fields automatically.

## Current readiness and verification limits

**The dedicated account is not provisioned or demonstrated usable by this source
work.** Parent reports interest INSERT/UPDATE triggers invoke
`get_gemini_embedding` with unavailable placeholder/local provider configuration.
Do not bypass triggers, fake embeddings, disable constraints or claim population
complete. Provider readiness and authorized provisioning remain parent blockers.

All agent tests use explicit fake filesystem, SDK and network seams. No real
credential file, Auth, database or provider was accessed. Browser fixtures mock
the endpoint and SDK; they prove UI flow, not live account/provider readiness.
Parent owns isolated Playwright execution using `playwright.isolated.config.ts`
and final screenshot review. Source checks: `pnpm test`, `pnpm typecheck`,
`pnpm lint`, `pnpm build`, `git diff --check`. API authorization/RLS remains
server-owned; SPA readiness is not a new backend validation/security boundary.
