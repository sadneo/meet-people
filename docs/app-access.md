# App access: authenticated session and required onboarding

## Product policy

The app has no signed-out product preview. Public routes are `/login`, `/register`,
`/auth/callback` and `/auth/forgot-password` only. Home, Events, Community (including
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
scrubbing remain owned by the existing public callback flow. No Supabase client,
provider or server authentication behavior is changed.

## Persisted onboarding prerequisite

A session is not a canonical account row. Before mounting any ordinary app page,
the gate reads the existing authenticated `/api/matchmaking/account-profile` and
`/api/matchmaking/profile` in parallel. Both must succeed:

- **Loading:** blocking status, no private context or feature requests.
- **Null or incomplete:** replace into `/onboarding?returnTo=…`. The legacy
  `/complete-profile` URL redirects here. There is no Cancel, skip, shell navigation
  or prototype-onboarding escape. Identity uses the shared explicit username and
  display-name form, optional bio and null avatar; ordinary users receive no
  prototype, email, metadata, example-interest, birthdate or location defaults.
- **Read failure or malformed data:** blocking Profile-unavailable state with
  read-only retry and logout, not a signed-out/login misclassification.
- **Ready persisted profile:** ordinary app access. Readiness requires valid
  canonical identity, at least three unique interests, valid birthdate, nonempty
  city/campus area and at least one valid non-overlapping availability window.
  It does not require photos, social intent, groups, distance, coordinates, a
  completion marker or a new schema. This supersedes identity-only access and the
  former optional-preferences policy.

Completion rechecks identity before PUT so another tab's existing identity is not
overwritten. A chosen identity save must be followed by authoritative GET readback
before preferences are enabled. The shared interest chips and availability table
then save the full real preferences with fresh canonical identity and require GET
readback of ready persisted data before the app unlocks. A save failure, null
readback or unavailable readback keeps
the draft and blocks automatic resubmission until explicit read-only reconciliation.
Onboarding saves preferences but never enrolls a queue or requests matching results.
Identity-saved/preferences-failed interruptions resume honestly from persisted
data. Profile and matching preference editors retain the same minimum requirements
so later editing cannot accidentally erase readiness. Dating stays inactive.

Direct onboarding refresh rereads both sources: partial stays required; a ready
profile returns to the validated destination. Subsequent login never repeats
onboarding for a ready saved profile. Unsaved drafts are not persisted
across a full page refresh. Minimal email/password recovery and logout controls are
available during setup/error states without mounting Settings or the private shell.

The gate/private tree is keyed by owner ID and access token. Signout/expiry removes
private access; owner/token changes close dialogs, discard old drafts and reread
both sources. Stale responses and completion callbacks cannot unlock a different owner.
Already-issued requests cannot be undone by an SPA; server authorization remains
responsible for every API call. There is no new polling or provider activation.

## Verification and parent browser handoff

Real `App` access/verification is covered in `tests/app-access.test.tsx` and
`tests/app-access-auth-lifecycle.test.tsx`. Lower-level Profile/editor and matching
component tests may compose private components with explicit mocked session/network
fixtures; those are not app-route authorization tests or production bypass flags.

The isolated browser specs use test-supplied SDK/network modules. StrictMode can
issue duplicate canonical GETs. Tests require zero private requests before auth,
then only canonical and matching-profile GETs while readiness is unresolved.
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

Development-account login is described in [development-onboarding.md](development-onboarding.md).
The Vite-only seam authenticates an already populated local user; it neither
creates data nor changes server authorization. The ordinary app gate still runs.
