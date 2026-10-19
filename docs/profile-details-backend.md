# Optional profile facts — bounded source foundation

This sprint authors contracts, owner HTTP/UI wiring, offline tests and candidate
SQL. It does **not** apply SQL to the existing DB, establish live availability or
fix broader legacy profile/discovery/block privacy surfaces. Downtime is deferred,
framework undefined; existing matching behavior and active priority are unchanged.

## Owner HTTP contract

Existing Express `/api/matchmaking` mounting authenticates with the existing
verified-user transport, then mounts `GET` / `PUT /profile-details`.
No service-role actor writes, actor IDs in payloads, query parameters, or public
profile lookup are accepted. All responses use `Cache-Control: no-store`.

```json
{
  "expectedRevision": 0,
  "facts": {
    "education": "",
    "occupation": "",
    "languages": ["English"],
    "visibility": {"education": false, "occupation": false, "languages": false}
  }
}
```

PUT replaces the complete facts/visibility resource atomically. GET and successful
PUT return `{ "revision": 1, "facts": { ... } }`, not the account document.
There is no row initially: GET returns empty strings/list, all visibility hidden,
revision zero, without inserting. First save with expectedRevision zero creates
revision one. Every accepted PUT increments once, including an unchanged payload.
Strings/order are preserved. Education/occupation allow empty strings and at most
120 Unicode code points. Languages allow at most 12 nonblank values of at most
60 code points; the pinned comparison keys below reject duplicates without
rewriting stored labels. Revision numbers are safe nonnegative integers; the
maximum safe integer is readable but cannot be incremented (PUT is rejected).
The frontend preview's defaults are not persisted or implicitly opted in.

### Exact text policy: Pebble comparison v1

Every fact/error string rejects NUL (U+0000) and unpaired UTF-16 surrogates. Valid
surrogate pairs are accepted and counted as one Unicode scalar, matching UTF8
PostgreSQL `char_length`. SQL requires UTF8; JSONB rejects NUL and invalid surrogate
escapes before RPC execution. Encoding errors `22P05` / `22021` map to invalid 400.
No existing account, interest, schedule or label data is rewritten.

Comparison removes only leading/trailing code points from this exact set:
U+0009–000D, U+0020, U+00A0, U+1680, U+2000–200A, U+2028–2029, U+202F, U+205F,
U+3000 and U+FEFF. Interior whitespace remains. U+0085 and U+200B are **not** in
that set. The set is explicitly pinned, not inferred from runtime regex/locale.

Case keys use identical numeric range/exception tables in
`shared/profile-details.ts` and the SQL candidate. Each range is
`[first,last,step,delta]`; matching scalars map to `scalar+delta`. Exceptions
take precedence and can expand to multiple scalars. These tables, rather than
the host Unicode library version, fully define v1. They cover ASCII, Latin-1,
specified Latin Extended pairs, Greek (including final-sigma equivalence),
specified Cyrillic pairs, Armenian and specified supplementary/fullwidth pairs.
`I` maps to `i`, `İ` maps to `i` + U+0307, and dotless `ı` stays distinct.
`ß` and `ẞ` map to `ss`. Comparison is code-point-exact after mapping; SQL uses
explicit `COLLATE "C"`, not the database's default collation.

**Limitation:** this is a deliberately bounded multilingual case-equivalence
policy, NOT full Unicode Default Case Folding. Every valid Unicode scalar label
is accepted (no ASCII-only restriction), but unlisted scalars remain unchanged:
unlisted case pairs such as Cherokee `Ꭰ` / `ꭰ` remain distinct. There is no NFC,
NFKC, accent removal, context-sensitive casing, locale-specific Turkish casing,
or confusable matching: composed `é` and decomposed `e` + U+0301 remain distinct.
Expanding the table is a future policy-version/data-collision review, not a
silent runtime upgrade or permission to normalize stored labels. Do not advertise
universal Unicode case-insensitive deduplication. Static tests compare the full
SQL/TypeScript tables and paired corpus; the candidate also contains SQL corpus
assertions for parent execution. Those static tests do not execute PostgreSQL.

Errors are bounded `{code,error}`: `auth` 401, `invalid` 400, `conflict` 409,
`unavailable` 503, `provider` 503, `malformed` 502. SQL `PD409` maps exclusively
to conflict in Express. A custom `PD409` suffix does not itself request HTTP 409
from PostgREST: tests inject non-2xx upstream envelopes through the actual SDK
and assert the Express mapping. Missing RPC/schema/permissions and unsupported
write isolation fail unavailable, not empty success.
Malformed/unexpected save readback is not success, even if the database might
have committed. After conflict or an uncertain outcome, read and reconcile;
never automatically retry a mutation or overwrite with a guessed revision.

## Storage, isolation and public boundary

`docs/profile-details-migration.sql` is a **candidate, not an applied migration**.
It depends only on existing Auth users/uid/roles and a trusted parent-reviewed
DDL owner. Parent must review function/table ownership, effective grants, default
privileges and the schema ACL before installation. Definitions intentionally fail
on object collisions instead of replacing unknown existing functions or tables.
It is installed once, transactionally; repeated application is not supported.
This is not an alternative installer for the prior account reconciliation.

`profile_details` is separate from `profiles`, `account_profiles` and
`account_settings`. Existing strict account payloads and whole-account writers
are unchanged and have no path to this table. No backfill, triggers, provider
calls or matching consumption are added. Browser roles receive no direct table
access, including SELECT; RLS is enabled with no browser policies. Only owner-bound
security-definer RPCs are granted to authenticated. Each RPC checks `auth.uid()`
and uses a fixed empty search_path and qualified application objects. CAS uses
the actor primary key and an UPDATE revision predicate, not HTTP read/merge/write.
Values, visibility and revision commit or roll back together.
Writes explicitly require READ COMMITTED and reject all other isolation levels
with `25001` before validation or writes. Under that supported isolation, initial
and established same-revision contention must produce exactly one winner and
`PD409` for the loser. Other transaction failures remain uncertain/unavailable;
neither the API nor its transport blindly retries a mutation. Parent still must
run barrier-based database contention tests and actual PostgREST acceptance.

`PublicProfileDetailsSchema` defines only optional allowlisted fact values:
hidden keys must be omitted; owner revisions/visibility/IDs/private columns are
not public fields. **No public projection helper, SQL function, transport method
or HTTP route is provided.** A visibility flag alone is not permission to expose
a record. Public reads remain unavailable until global/mode discovery and
bilateral blocks are enforced across direct SQL/RPC as well as HTTP. Do not pass
an owner snapshot to the public schema as a substitute for authorization.

## Acceptance and execution boundaries

The profile-details suites use the real Express routing stack in memory and
synthetic actors, with injected RPC/fetch implementations. The parser suite uses
real Express/body-parser over synthetic Node streams. Production and tests mount
the same narrow parser-error helper on `/api/matchmaking` before authentication:
Express itself applies case-insensitive path/boundary matching. Malformed, scalar
and oversized JSON return bounded JSON/no-store without auth/resource calls; a
sibling path is not captured. No configured production app is imported. No listener, live DB,
Auth/provider call, environment file or service is needed. Contract/SQL assertions
are static source tests, **not SQL execution, ACL/RLS or concurrency evidence**.

Required parent-only acceptance in a separately approved network-none disposable
database, synthetic Auth only:

1. Missing JWT/anon deny; actor A cannot read/write B by payload or direct table/
   column DML/SELECT. Internal validator EXECUTE denied to browser roles.
2. Empty GET does not create a row. Complete values and visibility round-trip;
   limits, wrong types, unknown keys, missing fields and duplicate languages reject
   atomically. Run the paired corpus (BOM/NBSP, Turkish variants, Greek sigma,
   supplementary scalars and explicitly unchanged characters) and verify exact
   stored-label preservation and UTF8 lengths. Test raw JSON NUL/unpaired-surrogate
   escapes through PostgREST as well as shared-schema rejection; the DB rejects
   such JSONB input before entering the function. Verify actual error envelopes.
3. Two independent sessions/barriers save expected revision zero, then the same
   established revision: exactly one succeeds and the loser gets `PD409`. No
   sleep-only races. REPEATABLE READ and SERIALIZABLE must reject `25001` before
   any row change, not promise `PD409` under unsupported isolation.
4. Rejected stale writes leave values/visibility/revision unchanged, including
   stale first saves; malformed writes and revision exhaustion have no partial row.
5. Save the old account document after facts: facts/revision are unchanged. Facts
   saves do not change account/profile/interests/windows/queues.
6. Inspect definitions/owners/grants before and after; no public RPC exists and no
   network/provider trigger executes. Record actual SQL commands and outputs.

Initial slice execution status: tests authored before implementation, but
the attempted isolated red run and later regression run were denied by shell
permission. Typecheck was also denied. Parent subsequently reports 29 tests,
frontend/API typechecks and diff check passing for the pre-repair slice; this is
parent-reported evidence, not an agent-run result or evidence for these repairs.
Repair tests were added before their implementation; red/regression execution
and frontend/API typechecks were denied by shell policy. `git diff --check` passed
in the initial slice; separate
`git diff --no-index --check /dev/null <new-file>` checks emitted no whitespace
diagnostics (exit 1 reflects new-file differences). No red/green execution,
typecheck success or SQL result is claimed. Parent verification commands:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/profile-details-api.test.ts tests/profile-details-contracts.test.ts tests/matchmaking-body-errors.test.ts tests/matchmaking-contracts.test.ts tests/account-profile-api.test.ts
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
git diff --check
```

## Parent-reported independent acceptance after backend repairs

Parent reports **35 tests across five focused suites**, frontend typecheck, API
`tsc --noEmit`, and diff check PASS for the repaired backend foundation. Parent
also reports actual PostgreSQL 17 acceptance in a network-none disposable DB:

- Candidate installation and embedded Unicode corpus passed.
- Empty GET created no row; owner isolation, anonymous/helper denial, and direct
  table/column denial passed.
- Invalid saves rejected atomically; stale revision and unsupported isolation
  rejection passed.
- Deterministic observed-lock barriers covered initial and established CAS:
  loser conflict, plus winner rollback allowing the waiting writer to succeed.

Parent reports the disposable container was removed and the existing DB was
never targeted. The agent did not execute or independently observe these tests;
no SQL commands, traces, container identifiers or exact invocation were supplied
here, so none are invented. **Limits:** no full migration replay, live PostgREST,
legacy integration or running-deployment acceptance. This evidence predates the
frontend integration below and does not establish that its tests passed.

## Canonical owner optional-facts frontend integration

`ProfileDetails` takes its actor/session from the existing loaded `AccountContext`,
not a new Auth flow or a per-request replacement session. It remounts its private
resource on actor change; read/save continuations are also generation/token fenced
and aborted on unmount. No facts go into the legacy account payload or device
storage. `AccountUiPreviewProvider` now retains only picture and Settings previews.

The typed client validates the shared request/response/error contracts, preserves
exact string values, bounds requests through body consumption, and never retries
a write. A successful owner GET is required before editing/saving is offered.
Missing/malformed backend data is unavailable, never a fictitious empty resource.
An actual server-returned revision-zero empty resource is valid capability readback.

The editor submits all facts/visibility with its explicit baseline revision. PUT
is followed by a separate GET; both revision and all values must agree before
the editor closes and reports success. Pending writes lock fields and dismissal.
Conflict, uncertain transport/malformed outcome, or failed/divergent readback
keeps the draft, with saving locked until a user-requested authoritative GET.
"Reload saved details" explicitly replaces the draft and revision; it does not
resubmit it. Cancel discards a draft, not an in-flight mutation; read-only reloads
may be cancelled by closing the editor. Fields remain mounted during ordinary
updates so focus/cancel behavior is retained. The existing outer auth boundary's
token-keyed remount policy is unchanged; this slice does not promise draft
survival across an app-shell session refresh/remount.

Validation uses the same `ProfileFactsSchema` and comparison-v1 keys as the API,
without trimming or collapsing saved labels. Input validation counts code points,
not native HTML UTF-16 maxlength units. The picture editor remains explicitly
visit-only. The public viewer only illustrates saved visible facts locally and
still says it is not proof of live redaction/discovery/public sharing. No public
endpoint or matching consumption is added.

Frontend tests cover capability/unavailable, atomic values/visibility, pending
readback, conflicts, uncertain outcomes, explicit reload, late reads/saves across
actor changes, cancellation/focus, exact labels and shared duplicate rules. The
browser fixture uses a separate synthetic facts CAS resource and rejects external
traffic. Its screenshot assertions are authored, not executed by the agent.

Parent commands for the new frontend cycle (isolated, no production env load):

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/profile-details-client.test.ts tests/profile-details-ui.test.tsx tests/frontend-preference-rules.test.tsx tests/account-profile-ui.test.tsx tests/shared-user-profile.test.tsx
pnpm --config.verify-deps-before-run=false typecheck
git diff --check
```

The agent attempted the new tests before and after implementation and typecheck;
shell policy denied execution. No red/green result is claimed. Screenshots were
not captured: the agent did not start a browser/Vite test service under the
no-service restriction. Parent-only isolated screenshot command:

```text
pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/account-matchmaking-readiness.spec.ts --grep 'Profile canonical facts|unavailable optional facts|new dialogs'
```

Ordinary integration is approved sprint scope. Existing DB application/activation
and public privacy dependencies remain gates; they are not an extra UI approval
request. Next review targets are actor/session interruption, uncertain-save
reconciliation, real deployed PostgREST contract, and the isolated rendered
screenshots. Picture storage, geo, Dating/matching activation, Settings/safety,
groups, notifications, post-match lifecycle and downtime redesign stay excluded.

## Mounted-hook capability/reconciliation repair checkpoint

Parent reports the **pre-repair** frontend slice passed 50 focused units, frontend
and API no-emit typechecks, diff check, and five isolated Playwright cases covering
320/390/1440 facts/picture preview, unavailable facts and short-mobile dialogs.
These are parent-reported mocked/browser results, not live deployment evidence,
and do not establish execution success for the repairs below. Exact parent
invocations were not supplied; no additional commands/results are invented.

Two hook-contract defects are repaired without changing the auth shell or UI:

- An authoritative synchronous snapshot now owns capability, phase and revision.
  Every transition publishes to that snapshot before notifying React. Retained
  save callbacks check the current owner/client, phase, reconciliation requirement
  and revision rather than a ready render captured earlier. Capability closes
  before PUT, and rejected/stale callbacks issue no mutation.
- `reconcileRequired` is independent of an in-flight write. Conflict and uncertain
  outcomes establish it, including interrupted saves and failed/divergent save
  readback. Same-owner token changes preserve it and do not automatically GET or
  unlock, even after repeated refreshes or a failed/interrupted reconciliation.
  Only a successful explicit reload clears an established requirement. An actual
  owner change resets the private resource instead of carrying the previous
  account's data or requirement into the new account.

Normal saves still require exact PUT response plus canonical GET readback. Known
invalid-input rejection can keep the unchanged baseline writable; it is not an
uncertain outcome. Initial capability discovery (with no reconciliation requirement)
may still read on token change. Neither path retries writes. Generation/client/
owner fences reject late completions, old-session callbacks and unmounted entry.
The requirement is local to the mounted hook lifetime: the documented existing
auth-shell token-keyed remount policy is unchanged, not weakened, and no module,
device, cross-account cache or new persistence is introduced.

Focused regression sources:

- `tests/profile-details-hook.test.ts`: retained ready callbacks after uncertainty,
  conflict and readback failure; failed explicit reload; current revision checks;
  synchronous pending lock; repeated refresh after interrupted/completed uncertain
  writes and failed reconciliation; interrupted reconciliation GET; owner reset and
  old-owner/unmounted callback denial. Exactly one PUT remains until successful
  explicit reconciliation and a subsequent deliberate valid save.
- `tests/profile-details-ui.test.tsx`: failed reconciliation keeps the draft and
  save lock; deferred read-only reload permits Cancel/native cancel, restores opener
  focus, does not resurrect a dismissed draft, and never issues a PUT. The native
  cancel event is simulated in jsdom, not a new hardware/browser result.

Tests were added before the hook repair. The attempted isolated red command was:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/profile-details-hook.test.ts tests/profile-details-ui.test.tsx
```

Shell permission denied that command and the later regression/typechecks below;
there is **no executed red/green or new typecheck result**. Parent checkpoint:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/profile-details-hook.test.ts tests/profile-details-ui.test.tsx tests/profile-details-client.test.ts tests/frontend-preference-rules.test.tsx tests/account-profile-ui.test.tsx tests/shared-user-profile.test.tsx
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
git diff --check
```

Source self-review: capability updates precede unlocking, failed/obsolete GETs do
not clear reconciliation, actor changes discard the old resource, and exact-fact
readback/no-retry behavior is retained. No related UI source, Auth gates, SQL,
picture/Settings/public/matching or downtime behavior was changed. Parent owns
fresh checks, staging and any scoped commit; the agent stops at this checkpoint
and performs no Git mutation or next-feature work.
