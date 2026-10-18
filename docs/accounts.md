# Accounts and authentication

## Current product and source flow

There is **no guest preview, skip or anonymous login**. Public login/register,
callback and recovery routes sit outside the private shell. After verified Auth,
`GET /api/matchmaking/account` supplies the unified document. Null/incomplete
profiles require `/onboarding`; errors block with read-only retry/logout. Internal
return path/query/hash is preserved and validated. `/complete-profile` is a legacy
redirect. Native links and `/reset-password` use the same scrub-and-verify callback,
not a second AuthScreen or automatic grant exchange. Google is not activated.

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
and explicit active-queue replacement consent. Dating remains disabled. Distance
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
