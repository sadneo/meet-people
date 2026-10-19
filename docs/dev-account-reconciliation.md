# Dev reconciliation — source candidate, not installed/live acceptance

## Ownership and merge decisions

`shared/account.ts` is the unified document contract. Private `account_settings`
retains upstream preferences/settings and sequential four-chapter progress.
Canonical `account_profiles` is retained as an internal identity store; the
installed projector remains responsible for legacy `profiles` identity columns.
Neither table nor historical migration is removed or rewritten.

`get_account` reads the canonical identity plus existing matchmaking data and
private settings. `save_account` is the only public document writer; identity and
matching compatibility RPCs delegate to it. The existing canonical/profile save
implementations become internal primitives with browser EXECUTE revoked. They
still enforce the symmetric namespace check, original field/window validation,
projection, and real label/window persistence. All paths take the common namespace
lock before actor/row locks, and reject non-READ-COMMITTED transactions. The new
candidate is `docs/dev-account-reconciliation.sql`, not an applied migration.

Four steps are identity (bio/photo optional), three unique interests, social intent,
then valid birthdate/nonempty city/real availability plus explicit distance/group.
Empty distance/group are honest incomplete values, not guessed choices. Saved
valid data maps to a prefix: complete legacy identity/interests skips those chapters;
missing social/private choices still requires only the missing steps. Fully valid
stored accounts with no marker do not repeat onboarding. Existing settings rows
receive data-derived markers without changing identity/preferences/settings;
missing rows are mapped on read and persisted by the next explicit save. A marker
alone never establishes readiness. Backend/API validation remains authoritative.

The local pre-shell session/readiness boundary, safe return path/query/hash and
credential callback verification remain. Native bridge mounts outside public and
private layouts and delegates grant exchange to the single scrub-and-verify
callback. Forest matching UI, save-before-join, Settings downtime consent and
disabled Dating remain; upstream Home/Community/Android assets are not discarded.
Supabase configuration is parent-owned and untouched by this source reconciliation.

## Prerequisite orders — not a standalone installer

`account_settings` and upstream account RPC creation from
`20261013120000_accounts.sql` are required **before** the candidate. Its
`IF NOT EXISTS` branch is not an alternative installation procedure: with the
tested default grants, creating settings there correctly aborts at the ACL gate.
Do not weaken that gate or silently revoke product permissions to get past it.

| Starting point | Ordered parent-only reconciliation plan |
| --- | --- |
| Fresh disposable historical installation | Existing matchmaking prerequisites → upstream `20261013120000_accounts.sql` (and historical optional enrichment where applicable) → `20261018160000_account_profile_identity.sql` → candidate → candidate repeat/data comparison. This chronological-order case still needs its own recorded execution. |
| Current local state with canonical 18 already applied and accounts 13 pending | In the approved disposable copy: matchmaking + canonical 18 → upstream accounts 13 → candidate → candidate repeat. Parent reports this exact order passing. Running-stack application and migration-history bookkeeping remain separately approved work. |

Never run upstream accounts CREATE statements after the candidate, rewrite a
historical migration, or mark pending history applied merely because frontend
tests pass. Inventory schema/function owners/ACLs and preserve existing data before
proposing installation. No running-DB application is authorized by this document.

## Parent-reported network-none evidence

Parent reports a disposable, network-none database using the second order above:

- Four actual authenticated-role onboarding chapters passed.
- Three interest labels persisted with NULL embeddings while the provider stub
  raised; no real provider or fake vector was used.
- Twelve invalid edits rolled back without changing the account.
- Own-settings RLS, no-JWT/anonymous denial, table-write denial and denied internal
  primitive EXECUTE passed.
- Candidate repeat preserved data.
- Deterministic two-session same-name account versus compatibility writes contended
  on the namespace lock, then the losing writer received `23505`.
- Candidate without upstream accounts first aborted on settings default grants,
  confirming the fail-closed ACL prerequisite rather than standalone readiness.

Parent-recorded unchanged candidate SHA-256:
`5e35834503485cf4d3695929cbac99002527695fea4d92a43c2bad5a6c09ee8b`.
The agent did not execute these database tests or independently hash/apply the SQL.
These results establish the reported isolated cases, not live provider readiness,
dedicated-account provisioning, every installation order or running-stack acceptance.

## Parent-only remaining disposable database test plan

**No SQL/database/concurrency test has been run by the agent. Ask the user before
any running database application.** Do not use a running app database to validate
this candidate. Parent must independently review owner/ACLs, function dependencies,
policies and this candidate before considering installation.

1. Create an explicitly approved disposable PostgreSQL instance with network NONE,
   isolated socket/directory, and synthetic Auth users/roles only. Install the
    exact prerequisite order being tested from the table above into that disposable
    DB, including upstream accounts before the candidate. Provide required extension signatures locally. Do not copy
   credentials, provider configuration, real profiles or location data.
2. Stub `get_gemini_embedding(text)` to **raise** in this disposable fixture, not
   call HTTP. Never substitute fake vectors in product storage. Optional enrichment
   should preserve each label with NULL embedding; original triggers remain enabled.
3. Apply `docs/dev-account-reconciliation.sql` with `psql -X -v ON_ERROR_STOP=1 -f`
   only against that isolated socket. Repeat it to prove idempotent function
   wrapping, constraints, data and prefix mapping. Inspect owner/ACLs before/after.
    Include upstream `account_settings` already present with private values saved,
    ensuring they are preserved. Do not replay the upstream
   accounts CREATE migration after reconciliation.
4. Test new/partial/complete accounts; optional bio/photo; reject <3/duplicate
   interests, invalid dates, blank city, empty/overlapping windows, missing/invalid
   intent/group/distance; reject skipped/regressed chapters. Assert atomic rollback
   of canonical identity, projected profile and settings on every rejected write.
5. Test canonical-only legacy, matching-only legacy, valid all-fields/no-marker,
   invalid old marker, and missing private preferences. Compare all before/after
   fields, labels, windows, coordinates and queue rows: no loss or automatic queues.
   Existing canonical identity must win over stale legacy identity projections.
6. Use persistent independent sessions and deterministic barriers for same-user
   account/compatibility writes and different-user identical usernames through
   BOTH compatibility paths. Exactly one namespace owner may commit. Test higher
   transaction isolation rejection and validate lock order; no sleep-only races.
7. Test anonymous/no JWT rejection, cross-user reads, own-settings-only SELECT,
   browser denied direct table/column writes, denied internal primitive EXECUTE,
   and unchanged legacy matcher/event contracts. Existing browser direct-write
   grants must abort installation for separate review, not be silently revoked.
8. Parent records exact commands, outputs, synthetic row comparisons, grants and
   concurrency traces. Static Vitest source assertions do not substitute for this
   execution. Only after passing and explicit user approval may installation into
   a running database be proposed.

## Runtime boundaries and pending acceptance

The DEV one-click helper must verify the unified account under the configured real
user token. It must not provision users, seed fields, start queues, bypass readiness
or revoke shared sessions on failure. Missing unified RPCs fail closed until the
separately approved reconciliation is installed.

Optional embeddings are an accepted source policy with parent-reported offline
failure-path evidence, **not a verified live fix**. Running provider availability
and dedicated-account provisioning remain unverified. No actual Auth/provider/DB requests, secret access, service
changes, installs or Android emulator/Gradle execution belong to this agent task.
Parent owns isolated Playwright and database acceptance; source merge completion
must be reported separately from migration installation and live readiness.
