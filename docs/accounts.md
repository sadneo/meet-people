# Accounts and authentication

## Current product and source flow

There is **no guest preview, skip or anonymous login**. Public login/register,
callback and recovery routes sit outside the private shell. After verified Auth,
`GET /api/matchmaking/account` supplies the unified document. Null/incomplete
profiles require `/onboarding`; errors block with read-only retry/logout. Internal
return path/query/hash is preserved and validated. `/complete-profile` is a legacy
redirect. Native links and `/reset-password` use the same scrub-and-verify callback,
not a second AuthScreen or automatic grant exchange. Google is not activated.

`/` and `/home` remain private product routes. Only `/welcome` and the separate
legal routes are public marketing/legal pages; they never mount the private shell.
The incoming public-root preview and email-existence/service-role lookup flow are
not adopted. The existing verified email/password/link flow remains routed; incoming
`AuthScreen` is not an alternate entry point. Any incoming API lookup source outside
the nine-file resolution scope still requires parent security review/removal before
this merge can be considered safe to run. No provider or schema activation is claimed.

Four sequential saved chapters:

1. Explicit username and display name; bio/photo are optional, avatar starts null.
2. At least three unique real interests, using shared chips/custom labels.
3. At least one social intent.
4. Valid birthdate, nonempty city/campus area, at least one valid weekly availability
   window, explicit distance and group choices.

Each chapter requires unified PUT plus authoritative GET before advancing. Existing
valid data maps to the first missing chapter; a fully valid saved account with no
marker does not repeat onboarding. No prototype/email/metadata fields are imported
or generated. No queue starts automatically. Photo uploads remain separate work.

## One source and preserved boundaries

`shared/account.ts` owns the document contract. `save_account` uses the verified
user JWT/`auth.uid()` and, after approved reconciliation, transactionally coordinates:

| Storage | Ownership |
| --- | --- |
| `account_profiles` | Canonical identity; existing namespace lock/projector retained |
| `profiles` | Identity projection, birthdate and city for existing algorithms |
| `user_interests` | Exact interest labels; embedding is optional derived data |
| `availability` | Actual weekly windows, including custom/late times |
| `account_settings` | Owner-private settings, social intent, distance/group and progress |

Compatibility identity/preferences endpoints delegate to the unified writer, not
parallel unsynchronized identity stores. Browser direct writes/internal primitive
execution remain denied. No historical migrations, data or projector are removed.
Profile alone edits display name/bio/location/birthdate; Profile and matching share
interests/windows. Required minima survive editing. Settings owns downtime opt-in
and explicit active-queue replacement consent. Live Dating remains disabled; its
recommendation UI is local-only with no persistence or backend actions. Distance
and group are stored preferences, not new matching/geolocation enforcement.

Owner/token changes unmount old state and fence retained callbacks. Uncertain saves
keep drafts and require read-only reconciliation, never automatic resubmission.
Preflight rejects dirty-field baseline conflicts and merges independent fresh
fields; this is **not** atomic cross-tab lost-update prevention. Readback accepts
SQL ordering of exact interest sets/window tuples, but not missing or changed data.
Same-owner matching refresh restores focus to the new Preferences opener.

## Source versus installation and live readiness

The merge source is not a running database installation. **Do not blindly apply
pending migrations or run resets/auth provisioning to validate this integration.**
The candidate needs upstream accounts schema/RPC creation before reconciliation;
without it, default settings-table grants correctly trip the ACL gate. See
[dev-account-reconciliation.md](dev-account-reconciliation.md) for both installation
orders and parent-reported disposable network-none tests. Any running-DB application
still requires explicit user approval.

Optional embedding policy preserves labels with NULL vectors when enrichment
fails. Parent tested provider-RAISE behavior offline; no fake vectors, trigger bypass
or claim of semantic matching readiness is made. Live provider availability and
dedicated-account population remain unverified. The guarded one-click DEV account
option is authentication only, not provisioning; see
[development-onboarding.md](development-onboarding.md).

## Verification boundaries

Source checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`git diff --check`. Parent owns isolated Playwright/screenshot review. Browser Auth
coverage uses explicit mocked SDK/network fixtures, with no env/admin access or
real account creation. `pnpm test:auth` and local Auth provisioning scripts perform
real operations and are not source-only checks. API authorization/RLS remains
server-owned; SPA gating does not protect static bundle downloads.

### Local Auth acceptance script

`scripts/test-local-auth.mjs` is a separately authorized **live local acceptance
check**, not a unit test. It obtains local status through the existing wrapper,
requires a plain HTTP `127.0.0.1` origin, and creates only two disposable users via
signup, out-of-band local email confirmation and password login. Passwords and
addresses are generated per run; credentials/tokens/provider diagnostics are not
printed or embedded. It does not provision the dedicated development account.

The first user saves four sequential chapters through `save_account`: identity;
three unique interests; social intent; then birthdate, synthetic campus area, an
actual availability window, distance and group. Each save (including a later
profile/settings edit) is followed by independent `get_account` readback. Exact
labels/window tuples are compared independent of SQL ordering, with no missing
fields accepted. The script also checks own-settings readback, the second user's
empty account and private-row isolation, denied direct settings writes, rejected
skipped onboarding with unchanged state, anonymous denial, logout/password login,
and recovery/password-change/password login with account preservation.

The `finally` block attempts deletion only for IDs returned by this run's signup
calls. It attempts all recorded deletions even if one fails; cleanup failures are
reported generically and suppress the success message. A server/network failure
can still prevent deletion, so success is never claimed in that case. There is no
user enumeration, bulk cleanup, schema change, environment/config rewrite or reset.

`tests/local-auth-script.test.ts` executes the script with mocked status/client
boundaries, SQL-sorted synthetic readbacks and injected failures. These tests need
no local services, credentials or real users. They do **not** establish live Auth,
RPC/RLS installation, recovery delivery or optional-embedding/provider readiness.
Real execution requires a separately approved local stack with the reconciled
account contract and approved interest-trigger/provider behavior; no provider or
trigger bypass is introduced by the script repair.
