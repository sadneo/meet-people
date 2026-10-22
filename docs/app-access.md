# App access: authenticated session and required onboarding

## Product policy

The app has no signed-out product preview. Signed-out `/` renders the public welcome
page; signed-in `/` renders protected Home. Marketing, legal and guest-event pages
remain public, as do `/login`, `/register`, `/auth/callback`, `/auth/forgot-password`,
`/forgot-password` and `/reset-password`. Home, Events, Community (including
`/prototype/yzcommunity`), Matchmaking/Friends/Dating, Messages, Profile, Settings,
Intro, onboarding, planning and unknown routes are protected.

`SessionRequired` in `src/auth/AppAccess.tsx` sits outside the private shell,
`PebbleApp` prototype context, local prototype persistence and feature data hooks.
While session hydration is unknown, it renders only a session status. Signed-out
access replaces history with `/login?returnTo=…`; validated internal path, query
and hash are preserved. Auth/completion destinations, external/protocol-relative
URLs and encoded slash/backslash/control-character tricks are not valid returns.

An existing hydrated entry session at Login/Register follows validated `returnTo`
or `/` by default, through the same app gate. A self-initiated password `SIGNED_IN`
event does not trigger that entry redirect: the mounted form waits for its existing
`getUser` verification before navigating. Callback exchange/verification and URL
scrubbing remain owned by the single public callback flow. Automatic SDK URL
consumption is disabled on `/auth/callback` and `/reset-password` to avoid racing
explicit exchange/verification. The native bridge mounts outside both layouts and
delegates grants to this flow; it never performs a parallel exchange. Google is not
activated. Logout captures the safe original path/query/hash before signout and
replaces history only after success, including when SDK notifications unmount the
old shell. Failed logout stays on the current route with retry feedback.

## Persisted onboarding prerequisite

A session is not a canonical account row. Before mounting any ordinary app page,
the gate reads authenticated `GET /api/matchmaking/account`. `shared/account.ts`
owns the unified profile, private preferences/settings and four-chapter progress.
Compatibility identity/preferences endpoints project/delegate to this document;
they are not independent canonical writers.

Historical `completed` markers may predate current required fields. Account reads
validate the document shape without rejecting those markers; access and onboarding
derive readiness from the actual saved fields. Saves still validate claimed
completion. This lets older accounts supply missing birthdate/campus information
instead of failing account loading and being logged out.

- **Loading:** blocking status, no private context or feature requests.
- **Null or incomplete:** replace into `/onboarding?returnTo=…`. The legacy
  `/complete-profile` URL redirects here. There is no Cancel, skip, shell navigation
  or prototype-onboarding escape. Identity uses the shared explicit username and
  display-name form, optional bio and null avatar; ordinary users receive no
  prototype, email, metadata, example-interest, birthdate or location defaults.
- **Startup read failure or malformed data:** retry network/server failures once;
  rejected sessions skip retry. A persistent failure signs out locally and returns
  to login with an explanation. Failed signout offers a retry without private access.
  Save/reconciliation failures still retain drafts rather than signing out.
- **Ready persisted profile:** ordinary app access. Readiness requires valid
  canonical identity, at least three unique interests, valid birthdate, nonempty
   city/campus area, at least one valid non-overlapping availability window, social
   intent and explicit distance/group choices. It does not require photos or
   coordinates. Distance/group values do not enable Dating, geolocation or new
   ranking rules. This supersedes identity-only/optional-preferences access.

Each sequential chapter saves through unified PUT and authoritative GET readback:
identity, at least three unique interests, social intent, then real windows,
birthdate/city and distance/group. Bio is optional. Existing valid stored fields map
to a completed prefix; fully valid no-marker accounts never replay onboarding.
Missing new private choices require only the missing steps, not a second full flow.

The preflight rejects identity replacement and dirty fields whose baseline has
diverged in the fresh read; unchanged fields use fresh values. This is not atomic
cross-tab lost-update protection: a race after preflight still needs server-side
version/CAS support. Readback compares exact interest labels as a set and exact
window tuples independent of SQL sort order; identity/settings/private preferences
must otherwise match, preserving social-intent order. Missing values do not pass.
A failed or uncertain save retains drafts and blocks resubmission until explicit
read-only reconciliation.
Onboarding saves preferences but never enrolls a queue or requests matching results.
Identity-saved/preferences-failed interruptions resume honestly from persisted
data. Profile and matching preference editors retain the same minimum requirements
so later editing cannot accidentally erase readiness. Dating stays inactive.

Direct onboarding refresh rereads the unified account: partial stays required; a ready
profile returns to the validated destination. Subsequent login never repeats
onboarding for a ready saved profile. Unsaved drafts are not persisted
across a full page refresh. Minimal email/password recovery and logout controls are
available during setup/error states without mounting Settings or the private shell.

Password recovery uses the shared branded sign-in layout and preserves the entered
email. After explicit callback exchange and authoritative user verification, the
callback renders the new-password form directly, without reading the profile or
entering Settings/onboarding. Expired/reused grants offer another recovery link.
Recovery confirmation includes a resend action with a 60-second cooldown.

The gate/private tree is keyed by owner ID and access token. Signout/expiry removes
private access; owner/token changes close dialogs, discard old drafts and reread
the account. Stale responses and completion callbacks cannot unlock a different owner.
Already-issued requests cannot be undone by an SPA; server authorization remains
responsible for every API call. Same-owner authoritative matching refresh can
replace the private tree; Preferences focus is restored to its current opener only
on the same route/owner, never to a detached old button. There is no new polling.

## Verification and parent browser handoff

Real `App` access/verification is covered in `tests/unit/app-access.test.tsx` and
`tests/unit/app-access-auth-lifecycle.test.tsx`. Lower-level Profile/editor and matching
component tests may compose private components with explicit mocked session/network
fixtures; those are not app-route authorization tests or production bypass flags.

The isolated browser specs use test-supplied SDK/network modules. StrictMode can
issue duplicate account GETs. Tests require zero private requests before auth,
then only unified account GETs while readiness is unresolved.
Dating permits those gate reads but no matching status/result/queue behavior. No assertion is
weakened to allow writes or fabricated account data.

Parent runs the isolated access/profile/matching/settings/credential/Dating specs;
the agent does not execute Playwright in this continuation. Auth/completion tests
exercise the full guard, explicit PUT/readback, refresh, failed saves/readbacks,
expiry, safe returns and the existing verification lifecycle. Screenshots authored
by these specs are ignored artifacts under `worktree/app-access/`.

The SPA guard does not protect static bundle downloads or replace API authentication.
Mocked success does not prove live database/profile/provider readiness. Database,
credentials/provider setup, services, schema installation and publication remain
separately authorized work.
See [dev-account-reconciliation.md](dev-account-reconciliation.md) for parent-reported
network-none SQL evidence, required prerequisite order and pending live installation.

Development-account login is described in [development-onboarding.md](development-onboarding.md).
The Vite-only seam authenticates an already populated local user; it neither
creates data nor changes server authorization. The ordinary app gate still runs.
