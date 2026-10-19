# First-time Profile — source support, backend not activated

Profile distinguishes successful `profile: null` responses from unavailable or
invalid reads. After successful reads, a missing account identity permits explicit
username, display-name and bio entry. The existing account-profile PUT is followed
by an authenticated GET readback before preferences are enabled. There is no
identity derived from prototype data, email, Auth metadata or generated handles.
Existing identity edits preserve the freshly read username and avatar.

The required `/onboarding` route now owns first-time completion before the private
shell; `/complete-profile` redirects there. With canonical identity confirmed and matching-profile null, the shared editor creates
interests, availability, city/campus area and birthdate through the existing full
matching-profile PUT, paired with freshly read canonical identity. GET readback is
required. At least three unique interests, valid birthdate, nonempty city/campus
area and one availability window are required. Partial older accounts resume here;
ready persisted accounts do not repeat onboarding. Ordinary Profile/matching edits
preserve these minimums. These actions do not enroll a queue or request results.
See [app-access.md](app-access.md) and [development-onboarding.md](development-onboarding.md).

## Unactivated dependency

The parent reports read-only live metadata showing `account_profiles`,
`get_account_profile()` and `save_account_profile(jsonb)` absent, while the legacy
matching-profile RPCs exist and legacy profiles are empty. This report is supplied
context, not a database inspection performed by this frontend task.

`docs/account-profile-matching-migration.sql` remains an **unapplied candidate**.
The parent owns isolated SQL validation and any separately authorized installation,
including table/RLS/grant/identity-projection review and preservation of existing
matching contracts. Source tests with isolated fixtures do not establish live
backend readiness. Until the required account RPC support exists, the real UI must
remain unavailable with read-only retry. No SQL, Docker, Supabase, migration,
running-database or live provider/Auth operation is part of this frontend repair.

## Frontend fail-closed review

Retained shared/identity save callbacks must reject entry after unmount or a token
change, not merely ignore a response after sending an old actor's request. Reload
immediately disables writes, keeps drafts, and requires successful reads. A fresh
preflight that finds a previously saved identity missing (or discovers an identity
while a creation form is open) invalidates write readiness until explicit reload.
Successful null still permits explicit creation; unavailable is not null. Neither
case requires fabricated identity or repeated sign-in. Unconfirmed save outcomes
remain errors, not local persistence or automatic queue enrollment.

## Cross-path username reservation — candidate source repaired, DB validation pending

Source reviewed: candidate `docs/account-profile-matching-migration.sql`, lines
72–85 and 87–109, and legacy
`supabase/migrations/20261008220000_matchmaking_profile_rpcs.sql`, lines 103–109.
The parent's reported isolated creation/RLS/projection/canonical-uniqueness and
same-actor concurrency passes do not establish cross-path username reservation.

Concrete interleaving, different actors A/B and identical username U:

1. A calls `save_account_profile`: its actor-specific advisory lock and
   `profiles WHERE id=A FOR UPDATE` cannot lock a missing A row or B's username.
2. A's check of `profiles.username=U AND id<>A` finds nothing.
3. B calls legacy `save_matchmaking_profile`: its distinct actor-specific lock
   does not contend with A. B has no canonical row, so the projection trigger
   leaves B's requested U unchanged.
4. A inserts `(A,U)` into `account_profiles`; B inserts `(B,U)` into `profiles`.
   Each table's separate unique constraint passes. A's update of existing legacy
   rows affects none when A is account-only. Both transactions can commit.

There is also a sequential hole: B can claim U after A's canonical-only save has
already committed, because the legacy path never checks another actor's canonical
reservation. A trigger check alone fixes this sequential case, but not a race
against an uncommitted canonical insert.

The revised unapplied candidate implements the bounded READ COMMITTED repair: one
common transaction advisory lock for the identity namespace **in both save RPCs,
before their existing actor/row locks and before any writes**, then perform
cross-table ownership checks under that lock. Canonical keeps its legacy check;
legacy must check the effective username (after applying its own canonical
identity) against other actors in `account_profiles`, raising `23505` on conflict.
Keep both unique constraints, own-actor projection, validation, RLS and grants.
A single namespace lock is the simplest correctness-first candidate, not a new
reservation service; it serializes these writes and can increase contention.
Do not add a late trigger-only lock that reverses row/namespace lock order.

Validation/installation gates (source repair is not installation):

- Cover every supported identity writer, including reviewed direct-write paths;
  restrict bypass paths rather than assuming RPC locks protect arbitrary SQL.
- Test both interleavings, both commit orders, rename/release, rollback, same actor,
  invalid legacy rows, lock timeout/deadlock behavior, and unrelated matching fields.
- Preserve exact existing username equality/collation and trimming behavior. Do
  not silently introduce case-insensitive names or rewrite stored identities.
- Advisory locking plus SELECT checks is not an isolation-independent unique
  constraint. At REPEATABLE READ an older snapshot may miss a committed owner.
  Explicitly reject unsupported isolation before writes, or separately approve a
  shared unique reservation constraint if broader isolation support is required.
  SERIALIZABLE behavior and retry requirements also need dedicated tests.
- Candidate source now contains the common lock, symmetric checks and rejection
  of non-READ-COMMITTED isolation. Historical migration files remain unchanged.
  Browser direct-write grants cause installation to fail rather than silently
  bypassing reservation or silently revoking product access. See the candidate
  README for the parent-owned privilege review prerequisite.
- `tests/account-profile-namespace-fixture.sql` and
  `scripts/test-account-profile-namespace.py` supply raising-provider and
  persistent-session deterministic tests. Typecheck/lint/diffcheck passed; policy
  denied the targeted source-test run, Python AST parse and hash command. All
  database/concurrency execution remains parent-owned and unexecuted here. No
  SQL, database, Docker or provider execution/installation occurred.

## Embedding activation/repair brief — provider work remains gated

### Actual source path and failure boundaries

`save_matchmaking_profile` retains unchanged interest rows and inserts only new
labels (`20261008220000_matchmaking_profile_rpcs.sql`, lines 110–120).
`trg_user_interests_embed` is a BEFORE INSERT / UPDATE OF text trigger calling
`get_gemini_embedding(new.text)` synchronously
(`20260925000002_embeddings.sql`, lines 28–79). It is part of the save transaction:
failure must roll back the preference save. Unchanged labels do not incur that
insert trigger; a removed and later re-added label does.

The SQL helper currently targets the hardcoded Docker-host Edge URL, uses a
placeholder API key, sends `apikey` and Content-Type only, and POSTs `{text}`.
The parent reports no Edge container. These are source/supplied-runtime blockers,
not evidence from a new live probe. The Edge source
`supabase/functions/embed-interest/index.ts` reads server environment variable
names `GEMINI_API_KEY` and optional `EMBED_SHARED_SECRET`; if the latter is enabled
it requires `x-embed-secret`, which the SQL caller currently omits. If disabled,
that application-level check is skipped. Gateway JWT behavior has not been
inspected or changed here; `apikey` alone is not proof of authorized internal use.

The handler accepts `{text}` or legacy `{interestText}`, invokes
`gemini-embedding-001` with the entire text, and returns the first embedding. It
only checks nonempty text/vector, not text length, dimensions or finite numeric
values. SQL also lacks an explicit 3072-dimensional validation before accepting
the array, although `user_interest_vector` assumes 3072. Error paths currently
log input text/provider errors and can return raw provider errors; SQL raises
with the raw Edge response content. These must not become privacy/error leaks.

### Minimal separately approved repair/activation scope

1. **Connectivity/configuration:** parent supplies a reachable internal Edge
   destination and explicit gateway mode appropriate to that environment. Remove
   hardcoded host/placeholder dependence through a reviewed server-only setting,
   not committed credentials or browser configuration. Verify readiness with
   synthetic offline transports before any approved live activation.
2. **Authentication:** require an internal caller credential on the Edge handler
   and the same header on SQL calls, deny missing/mismatched credentials before
   provider use, and keep keys only in approved server secret storage. Review
   gateway verification separately; do not publicly expose a no-verification,
   optional-secret endpoint or treat the public application key as authorization.
   Audit EXECUTE grants and fixed/qualified search paths on the SECURITY DEFINER
   helper and its callers; prevent arbitrary browser RPCs from spending quota.
3. **Validation/errors:** bound request bytes and text length for each existing
   call path, require exactly 3072 finite numeric values for the configured model,
   and reject malformed/empty/null responses without fake/zero vectors. Keep
   model/dimension/normalization and matching behavior unchanged. Return stable
   sanitized error codes, not provider messages, raw bodies or submitted text;
   logs should contain only safe correlation/status/timing information.
4. **Deadlines and transaction safety:** set explicit SQL HTTP, Edge/provider and
   overall operation deadlines, with the inner work finishing before the outer
   request budget. Browser client currently has a 15-second deadline through body
   consumption. A browser timeout does not prove SQL rollback or refund provider
   calls. Do not auto-retry a mutation or move work async/disable the trigger as
   an incidental repair. Reconcile by authoritative readback after uncertainty.
5. **Offline tests before activation:** synthetic transport tests for absent
   config, wrong/missing internal auth, non-POST/invalid/oversized JSON, provider
   401/429/5xx, timeout, malformed dimensions/nonfinite vectors, sanitized errors,
   and atomic rollback. No provider invocation for identity-only save, unchanged
   interests, unavailable identity, canceled consent or invalid preferences.

### Payload scope and request-budget approval

An interest insertion sends **one complete user-entered interest label**, including
custom/multiline text, to the external provider. That is not the only call site:
`profile_embedding(profile_text(...))` includes display name, bio, city, interest
labels and availability **day names**; `meetup_embedding` includes title,
description, category and location name. The active ranking path calls profile
embeddings for candidate pairs (`20260925000005_queue_and_matching.sql`, line
148); event scoring also calls meetup/profile embeddings. Do not activate these
other paths incidentally or claim only interest labels can leave the server.
Dates of birth, exact availability times, coordinates, JWTs and identity UUIDs
are not included by these shown text builders. Arbitrary sensitive text can
still be entered in labels/bio. Full-profile/location disclosure requires explicit
privacy/provider approval; if that scope is rejected, stop rather than silently
changing the algorithm or filtering its inputs.

Budget proposal requires parent approval of allowed payloads, cost ceiling and
retention terms before any live provider request. A first save permits up to
30 new labels, hence up to 30 synchronous provider requests; a later save incurs
one per newly inserted label. Rollback does not undo provider usage and a retry
can repeat the cost. Manual result/ranking operations can issue further calls
per candidate pair/evaluation, not one fixed call per screen. Require per-actor
rate limits and concurrency caps, bounded provider/SQL retries (zero mutation
auto-retries initially), explicit per-operation and daily quotas, 429 handling,
and measured synthetic call counts/time budgets at maximum contract sizes.
Do not enable a 30-label operation against a 15-second client budget without a
validated end-to-end deadline policy. No call counts/costs/latency here are live
execution measurements. Never bypass embeddings, seed fake vectors or alter
ranking to make a readiness check pass.
