# Owner safety operations + legacy contact-mutation containment

## Independently executed checkpoint — 2026-10-19

Fresh post-repair verification in the reconciled worktree at starting HEAD
`2a615bee236f70639f2a51b33302edffce728be3`:

- 48 Node tests in seven files and two rendered jsdom tests passed; frontend and
  API typechecks and `git diff --check` passed.
- PostgreSQL 17 disposable `pebble-safety-review-20261019`, independently checked
  `NetworkMode=none`, no published ports. Actual historical core/RLS/04/08/07,
  exact pure `vec_similarity`/`shared_interest_labels`, synthetic Auth, prior guard.
  No provider/embedding functions or triggers loaded or called.
- Revised single-session acceptance passed and rolled back. This includes all
  24 inherited sequence grant rejection/atomic rollback cases, actual malformed
  historical sender rows and the legitimate blocked recipient receipt case.
- New candidate installed separately only in the disposable, then 32 concurrent
  cases executed with observed `pg_blocking_pids` waits and poststate assertions:
  24 canonical/legacy block/contact order/commit/rollback cases, two same-key
  report cases, two distinct-key hourly quota boundary cases, two DELETE/replay
  orders and two profile-FK cases.
- The profile-FK cases produced `40P01` on profile deletion; its transaction
  rolled back while receipt/acceptance committed. These are fail-closed deadlock
  rollbacks, **not** `42501` block-predicate exclusions. No history was deleted.
- An initial DELETE/replay harness attempt failed to observe its assumed row
  wait. An existing-row `ON CONFLICT DO NOTHING` replay need not wait on a
  row-only lock. The corrected orders observed the actual advisory waits:
  replay then explicit DELETE leaves no block; DELETE then replay leaves one.
  The failed attempt is not counted as a passing case.

Commands executed from this repository (isolated configuration, no env loading):

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment node tests/safety-owner-contracts.test.ts tests/safety-owner-api.test.ts tests/safety-owner-candidate.test.ts tests/safety-contact-candidate.test.ts tests/detailed-settings-api.test.ts tests/friends-search-preferences-api.test.ts tests/dating-api.test.ts
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/safety-opaque-ui.test.tsx
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.api.json --noEmit
git diff --check
python3 worktree/safety-owner-review/races.py
python3 worktree/safety-owner-review/edge-races.py
python3 worktree/safety-owner-review/replay-quota-races.py
```

Disposable scaffold, drivers and captured race evidence remain in ignored
`worktree/safety-owner-review/`. Acceptance ran with `psql -X -U postgres
-v ON_ERROR_STOP=1 -d pebble_safety_owner_disposable`, the documented session GUC,
and `-f tests/safety-owner-contact.sql` inside that isolated container.
These are actual SQL authorization/concurrency checks, not full historical
migration replay, live PostgREST, UUID Messaging, Events, discovery/privacy or
existing-app activation proof. Earlier “source only / parent not executed”
statements below describe the previous authoring checkpoint.


**Bounded operational subset, NOT authoritative all-surface blocking. UI remains
unwired/unavailable and active matcher integration remains blocked.**

Approved worktree `/home/Danuu/Projects/meet-people-worktrees/reconciled-ui-baseline`,
branch `feat/reconciled-ui-baseline`, starting HEAD
`2a615bee236f70639f2a51b33302edffce728be3`; initial Git status clean. Parent reports
the preceding 24-path Friends UI checkpoint passed 106 units, 64 browsers, both
typechecks/diff and review, plus actual readable 320px screenshot inspection. Those
results are baseline evidence, not execution of this safety slice.

## Reviewed source and concrete boundaries

- Actual historical `supabase/migrations/20260925000000_init_schema.sql`,
  `20260925000001_rls_policies.sql`, `20260925000004_connection_logic.sql`,
  `20260925000008_messaging.sql`: canonical blocks, bigint contact tables, permissive
  direct policies, request/accept triggers and definer inbox/receipt/unread bypasses.
- `20260925000005_queue_and_matching.sql` result/queue seams and
  `20260925000007_dating_track.sql`: provider-dependent scoring, raw discovery and
  direct Dating admissions do not consume the newer preferences/eligibility policy.
- `20261009060000_event_group_queue.sql` locking/proposal/eligibility seams: existing
  profile/social table SHARE fences and block checks are a separate integration,
  not replaced here. Listing/event compatibility is mapped below, not certified.
- `docs/safety-contact-guards-migration.sql` and the settings/safety enforcement map:
  prior scoped predicate/membership repair, historically scalar int4 read RPC, and
  unavailable blocklist pending metadata policy.
- `api/index.ts`, `api/matchmaking.ts`, Connections/Messaging clients and shared
  contracts: this checkout has no implemented `/api/connections` or
  `/api/conversations` Express router. The newer shared Messaging client expects
  UUID/group conversation contracts, unlike the historical bigint two-person tables.
  This candidate explicitly rejects incompatible conversation/message ID shape;
  it is not an invented replacement Messaging backend or a full replay claim.
- `SafetyControls.tsx`: production still has no blocklist/mutation adapter; block/
  report submission stays unavailable. Only nullable metadata representation changes.

No historical migration or existing DB was changed. New SQL is docs candidate
source; no provider, service, deployment, environment or secret was accessed.

## Real owner contracts and HTTP/RPC boundary

`shared/safety.ts` is strict. IDs are canonical lowercase UUIDs. Unknown fields,
actor selectors, self-target operations, unbounded/invalid Unicode report text,
live display names and fabricated moderation outcomes are rejected. `api/safety.ts`
mounts at `/api/matchmaking/safety` behind the existing verified-user middleware.
The existing public-key actor factory binds each fixed RPC to that user's JWT;
there is no service-role actor or caller-selected function/owner ID.

| HTTP | Fixed actor RPC | Result |
| --- | --- | --- |
| GET `/blocks` | `get_owner_blocklist()` | `{enforcement:'contact-mutations-only', blocks:[{targetId,displayName:null,blockedAt:ISO|null}]}` |
| GET `/blocks/:targetId` | `get_owner_block_state(target_in uuid)` | `{targetId,outgoingBlocked,enforcement:'contact-mutations-only'}` |
| PUT `/blocks/:targetId`, empty body | `block_owner_target(target_in uuid)` | Idempotent outgoing owner state, then separate GET confirmation |
| DELETE `/blocks/:targetId`, empty body | `unblock_owner_target(target_in uuid)` | Idempotent outgoing owner state, then separate GET confirmation |
| POST `/reports` | `submit_safety_report(report_in jsonb)` | Stored intake receipt, then separate owner lookup confirmation |
| GET `/reports/:requestId` | `get_owner_safety_report(request_id_in uuid)` | Owner-only stored receipt or 404 |

All responses are no-store. Outgoing ledger state is authoritative for that owner,
not evidence of completed bilateral discovery/contact/history enforcement. Reverse
blocks never appear in the owner list/state. The blocklist getter reads only
`blocks`: **no profile/name/avatar/home join**. `displayName` must be null, not an
omitted row, current hidden name, guessed old name or invented label. Dates come
from the actual nullable/finite legacy created_at; no request-time fallback date.
The prior unavailable getter is intentionally superseded by this approved opaque
contract, retaining its scalar jsonb signature/OID. Old partial acceptance expecting
PT503 belongs to the previous candidate stage, not this new contract.

Report input is exactly `{requestId,targetId,reason,context}`. Reason is the existing
five-choice enum; context is exact valid Unicode up to 1000 scalars without NUL.
No target profile lookup/FK exists for reports: receipt does not verify target
existence/audience. Stored receipts contain server-generated ID, request ID, submitted
target ID, original canonical UTC receivedAt and `status:'received'`, never context,
moderation decision, notification, delivery or a fabricated block. Same actor/key/
content replays the original receipt; changed target/reason/context conflicts.
Different owners cannot read each other's receipt even with the same request ID.
Replay precedes rate counting. An actor advisory lock serializes intake across keys:
**5 new reports per rolling hour, 20 per rolling 24h**, explicitly bounded policy for
parent review. Private ledger timestamps cannot be supplied/edited by browsers.

Errors: auth 401, invalid 400, report-key conflict 409, missing owner receipt 404,
rate limit 429, missing RPC/role/isolation prerequisite 503/unavailable, unknown
failure 503/provider, malformed output 502. Mutation result must match its target/
desired owner state or submitted request. After a valid mutation receipt, ANY failed
or divergent GET becomes uncertainty-aware 503/provider; it never asserts rollback.
Callers must read/reconcile, or reuse the original report key for an intentional
idempotent retry. There is no automatic write retry/compensation or partial success.

## Candidate containment and race protocol

`docs/safety-owner-contact-migration.sql` requires the reviewed partial candidate,
exact historical core/contact + real 04/08/07 definitions, reviewed table ownership
including profiles, and compatible function shapes/owners. New schema/name collisions
abort, not adopt. DDL/ACL changes are one transaction. Parent must inspect inherited
roles/default privileges; effective leftover grants cause installation failure.

1. Canonical state remains **public.blocks**, never a substitute block table.
   Canonical block/unblock and all legacy block INSERT/DELETE triggers share one
   canonical unordered UUID pair key, with ordered profile FK KEY SHARE locks before
   the transaction advisory lock. READ COMMITTED is mandatory; checks run in later
   volatile-trigger statements after lock acquisition, not a stale initial predicate.
   Hash collisions merely over-serialize. No new table-wide/coarse/advisory global
   lock is installed. Existing Events coarse fences remain an outstanding seam.
2. Browser table/column/sequence grants are withdrawn for blocks, connections,
   conversations, messages and dating_matches, including REFERENCES grants. RLS
   alone is not relied on to defeat permissive old policies. Private schema/table/
   helper privileges are also withheld and effective inherited access is checked.
3. Privileged legacy definer DML still traverses triggers: actor-bound pending
   request INSERT; immutable pair/id/initiator/created_at; recipient-only pending
   acceptance; accepted fresh relationship prerequisite for conversation/send;
   immutable conversation identities and message id/sender/body/conversation/time;
   recipient-only server-timestamp read updates. NULL/self pairs fail closed.
   Historical insert/after-update trigger OIDs are retained with pinned empty
   search paths and qualified lookups. Conversation creation remains the existing
   pending->accepted consequence, not a new lifecycle.
4. Every block quarantines existing pending/accepted **connection IDs** in a
   private revocation marker, including an installation backfill for already-blocked
   pairs. This is relationship deauthorization, not a block store. Block/unblock
   deletes no connection/conversation/message/history. Unblock removes only that
   actor's outgoing row and never clears quarantine, removes reverse blocks or
   recreates a relationship. A future legitimate explicit remove/new-request/accept
   path must establish a fresh relationship ID; no such new contact API is invented.
   Markers intentionally have no parent-row FK locks (nor automatic resurrection
   when an ID is reused). Their cleanup/retention is private maintenance work.
5. Historical inbox/incoming/sent/unread/read-receipt RPC grants are withdrawn,
   not changed to false empty success. Raw contact SELECT is also unavailable.
   Historical read visibility is undecided; preserve rows until policy exists.
   Legacy Dating result/request/accept/end grants are withdrawn and Dating INSERT/
   UPDATE guarded unavailable, rather than accidentally admitting live Dating
   without aggregate/reciprocal/global-discovery/safety policy.

Trigger maintenance bypass is restricted to real superuser/BYPASSRLS sessions with
no browser role set, never SECURITY DEFINER current_user alone. Browser-role tests
in an executor-owned psql session therefore still exercise actor checks. Profile FK
cascade cleanup is recognized for obsolete block/connection rows and still takes
pair locks; this is not a new account-deletion policy. Existing destructive account
FK cascades and privileged schema/trigger changes need separate production review.
Raw unordered bulk/maintenance writers can abort on deadlock; canonical operations
prelock endpoints/pair. Such abort is failure/uncertainty, not unsafe admission.
No claim is made about unsupported isolation or admin-disabled triggers.

## REQUIRED unfinished all-surface closure map

Do not call blocking authoritative or activate the Safety UI/active matcher from
this subset. The following are genuine remaining gates, not future niceties:

| Surface | Current state / required completion |
| --- | --- |
| Owner block/report resource | Implemented source with authoritative owner readback and explicit partial coverage; needs real disposable/API/role/race execution. |
| Known historical contact DML/definer mutation | Browser bypass grants withdrawn; guarded requests/accept/conversation/send/receipt source uses common locks. Requires observed races for canonical AND legacy block writer, both orders, commit/rollback, inherited grants/column-retarget attempts. |
| Historical contact reads/read receipts/unread | Candidate deliberately unavailable, data retained. Approved historical audience/projection/receipt policy and proper owner APIs must precede re-enabling. New UUID/group Messaging contracts are not covered by a bigint trigger candidate. |
| Profiles/interests/availability/queue raw SELECT | Historical public/all-row policies and column exposure remain. Need safe scoped projections/grants/RLS with bilateral blocking and global/mode privacy, not only HTTP filters. |
| `search_people`, `get_queue_match`, scoring helpers | Existing legacy readers remain unchanged and are NOT a complete enforcement gate. Need current bilateral permission/block evidence, pair-linearized delivery/result admission, revision consumption, safe cached scoring/provider seams and direct EXECUTE/ID-probing review. Nothing calls providers here. |
| `record_interaction`, raw `interaction_outcomes`, vector/reliability/collaborative helpers | Historical pair-controlled outcome writes and arbitrary-ID derived reads require their own actor/participant/block/audience and provider-seam audit. They are not protected or enabled by these owner operations; no post-match lifecycle is expanded here. |
| `join_queue(text)` and raw queue membership | Existing direct Dating enrollment/type and raw policies remain; new candidate prevents known Dating admission/result RPCs, not every enrollment/read leak. Need approved mode eligibility/consent and direct path closure before live admission. No matching/downtime redesign here. |
| Legacy Dating history/lifecycle | Known direct admission/result/lifecycle functions and table access are withdrawn, not a completed Dating service. Aggregate adult/reciprocity/discovery policy and approved history handling still needed before any re-enable. Cards stay prototype. |
| Event/listing compatibility, interests/attendees and private group worker/notifications | Existing predicates/fingerprints and global SHARE fences are separate. Review pair-lock interaction, all existing eligibility/read/delivery seams and private metadata; narrowly integrate safety without changing group/Events membership or product lifecycle. No group/worker/notification code modified here. |
| Listing status/interest/matches RPCs | `event_company_action`/`event_company_snapshot` were dropped on 2026-10-22. Each listing bridge's role/eligibility contract needs explicit separate verification; new safety HTTP actor binding does not secure direct calls to these functions. No lifecycle or notice behavior is silently altered. |
| Connections/Messaging HTTP clients | Express implementations are absent in this checkout. No fabricated endpoint adapter or UUID/group conversion was supplied. All future adapters must use completed enforcement and canonical readback, not raw DML. |
| Incoming block privacy, cached reads, account deletion, privileged paths | Outgoing new APIs reveal no reverse rows/names. Existing predicates/read caches/privileged grants, maintenance and FK deletion policies still need full source/install audit. New owner state is not a privacy certification. |
| Report processing/production controls | Intake only; retention, moderation operators/process and any delivery are separate unimplemented policy. No outcome notice or workflow is invented. |

## Guarded parent acceptance source, not execution evidence

`tests/safety-owner-contact.sql` requires a fresh prior-candidate-only DB
`pebble_safety_owner_disposable`,
executor-owned `public.safety_owner_disposable_marker(singleton boolean primary key,
purpose text not null)` with exactly `(true,'network-none-safety-owner-v1')`, no browser
marker mutation/BYPASSRLS, and separate SESSION GUC
`pebble.safety_owner_test_target='network-none-safety-owner-v1'`. Parent independently
verifies network-none and separately installs actual reviewed historical core/04/08/07
and the partial candidate, NOT the new owner/contact candidate. The acceptance file
loads the actual new candidate source with client-side copy, strips only its outer
BEGIN/COMMIT and installs it inside rollback scope after negative-install fixtures.
The executor needs CREATEROLE (or superuser) plus authority to grant the disposable
test role to anon/authenticated. PG17 WITH INHERIT TRUE is used explicitly. The fixed
role name must be absent; no existing role is adopted or changed. No extension/provider
source is invoked by these tests.
Marker/GUC prove intent only, not isolation or migration provenance. SQL asserts
historical int4/boolean signatures, pinned trigger shape, effective ACLs, no JWT,
cross-actor denial, immutable retargeting/sender/body, reverse-block exclusion,
non-restoring unblock, opaque hidden-profile blocklist, idempotency and both report
rate windows, inherited sequence-only rejection and atomic function/ACL/trigger
rollback, while preserving actual malformed pre-install history and valid synthetic
message/connection rows. Test-only pg_temp
definer bridges model legacy elevated DML and are rolled back with all fixtures.
Sequences/OIDs may advance. The role, fixtures and positive installation all roll
back. This is not full replay, installed-app or runtime API proof. For the separate
race harness, install the new candidate AFTER this single-session acceptance passes.

`tests/safety-owner-race-session.sql` is separate **manual multi-session SOURCE**.
It guards the same target/marker/GUC. Parent uses fresh `mode=setup,scenario=...`
for each case; this commits only a collision-checked fixed synthetic namespace and
test-only privileged bridges. Use `mode=run,participant=winner,operation=...` in one
session, and loser in another. A third `mode=observe` invocation MUST confirm
`pg_blocking_pids`/Lock wait before the winner is prompted to commit/rollback.
No sleeps or source assertions substitute for the wait. Both successful run sessions
prompt for explicit release; an expected 42501 loser exits nonzero and rolls back.

| Matrix (fresh setup each time) | Required observed result |
| --- | --- |
| Winner canonical `block`, loser request/accept/send/receipt matching scenario | Loser waits; winner commit -> 42501/no contact mutation; winner rollback -> one valid mutation, no block/quarantine left. |
| Winner `legacy_block`, same losers | Same results: legacy elevated block DML must use the common fence too. Direct browser DML is separately denied. |
| Winner request/accept/send/receipt, loser canonical block | Block waits; contact commit may precede block (history retained), then block quarantines it; contact rollback leaves no mutation. After block commits, old relationship cannot admit further send/accept/receipt. |
| Winner `report`, loser `report` (same owner/key) | Actor-lock wait; commit -> same receipt/one row, rollback -> one new receipt/row. Add distinct-key near-limit runs for serialized rate-limit boundary before production. |
| Held legacy block row, canonical block replay, then legacy DELETE | Setup block_delete; hold_row/block + legacy_unblock first, run/block second. An existing-row ON CONFLICT DO NOTHING replay can finish without waiting on the held row. In that ordering, keep replay uncommitted, continue DELETE, and observe DELETE waiting on replay’s advisory lock (reverse the observer participant names). Replay commit then DELETE commit legitimately leaves no block. Separately run legacy_unblock first through its DELETE, then canonical replay: observe replay waiting, DELETE commit then replay commit must leave one block. Do not require a nonexistent row wait or treat later explicit unblock as an admission bypass. Classify any 40P01 separately and inspect poststate. |
| Held receipt/message row versus profile FK DELETE | Setup receipt; hold_row/message + receipt first, run/profile_delete second. Observe cascade waiting on the message, then continue the receipt. Possible row/profile 40P01 must roll back its victim; it does not prove safe historical visibility or successful block exclusion. |
| Held pending connection row versus profile FK DELETE | Setup accept; hold_row/connection + accept first, run/profile_delete second. Observe FK cascade waiting on the connection, then continue acceptance. Same separate 40P01/poststate classification. |

After release, parent MUST inspect canonical blocks, connection status/quarantine,
conversation/message counts/body/read_at and report IDs/counts for expected poststate,
not merely process exit. Cleanup only after sessions finish, with `mode=cleanup`;
it verifies fixture IDs/usernames, removes that synthetic namespace and explicitly
drops only its named helper functions/table/schema (no DROP CASCADE). An inspect mode
prints only the fixed synthetic profiles/blocks/connections/messages/quarantine and
report receipt rows for parent assertions, not an automatic pass. No agent executes
setup/run/observer/cleanup or creates a disposable DB/service.

## Verification / completion scope

Contract tests, offline actor API/SDK fixtures and static SQL-source tests are
authored; nullable metadata render tests keep production adapter absence honest.
No running SQL, concurrency, live PostgREST, full replay or app-DB proof exists for
this new candidate. Initial contract test attempt and later regression/typecheck
attempts were **Permission denied: shell**, not executed passes. The following
are historical attempts; use the environment-separated commands below for reruns:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/safety-owner-contracts.test.ts
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/safety-owner-contracts.test.ts tests/safety-owner-api.test.ts tests/safety-owner-candidate.test.ts tests/safety-opaque-ui.test.tsx tests/safety-contact-candidate.test.ts tests/detailed-settings-api.test.ts tests/friends-search-preferences-api.test.ts tests/dating-api.test.ts
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
```

Final whitespace/identity/status checks are reported separately. Parent owns actual
guarded installation/role/concurrency validation, review and checkpoint. No staging,
commit/push, Git mutation, deployment/service change, DB/Supabase action, real
API/provider/geocoder request, environment/secret access, config/install or protected
checkout operation occurred. No matching redesign, groups, rewards, notifications,
post-match expansion, downtime policy change or live Dating activation is included.

## Runner repair and pre-SQL review (same session)

Parent's initial actual verification reported **46 tests PASS in seven files and
one suite failed to load**, not an all-green run. The failed
`tests/safety-owner-candidate.test.ts:4` passed a Vite/jsdom-origin URL derived from
`import.meta.url` to Node readFileSync. Its three filesystem reads now use explicit
repository-root-relative paths, matching the existing safety candidate tests.
Every original SQL assertion is retained; there is no skip, fallback, weakened
source check or claim that source assertions execute SQL.

Safety contracts/API/candidate files explicitly select the Node test environment;
only the rendered opaque blocklist test selects jsdom. A transport environment
regression asserts absence of window. Run other API regressions with Node too.
This avoids SDK browser-storage-instance warnings by using the appropriate runtime,
not suppressing logs or changing SDK/product configuration. Parent had not run
typechecks after the chained suite-load failure; they are not recorded as passes.

The full source review kept actor binding, idempotency, receipts, no reverse/name
metadata, immutable contact fields and the operational-subset boundary intact.
One hardening repair qualifies maintenance/install/ACL catalog relation lookups
with pg_catalog: an empty search_path alone does not exclude pg_temp relation
shadowing. Static coverage now checks the qualified pg_roles lookup. The candidate
also explicitly requires scalar-UUID auth.uid(), and acceptance checks name the
historical user_interests/shared_interest_labels prerequisite. No guard/security
function is replaced with a positive-case stub. SQL remains unexecuted by the agent;
catalog, trigger, privilege, snapshot and race behavior still require parent execution.

### Exact disposable prerequisites (parent preparation only)

Use an already running, independently verified **network-none PostgreSQL 17**
disposable instance and its approved Unix socket. Do not point at any app DB,
start a service, load credentials or execute the full provider-extension history.
Preparation and all invocations below are parent-owned, NOT agent-executed:

1. Database `pebble_safety_owner_disposable`; the executor owns the schema objects,
   may create functions/triggers and SET ROLE authenticated. Roles anon and
   authenticated exist and are NOSUPERUSER/NOBYPASSRLS. They must not inherit owner,
   private helper, table/column or schema bypass privileges. Use UTF8, normal enabled
   triggers/check_function_bodies, READ COMMITTED and core gen_random_uuid().
2. Synthetic `auth.users(id uuid primary key)` sufficient for these fixed fixtures,
   plus `auth.uid() RETURNS uuid` deriving only the test session's nonempty
   request.jwt.claim.sub (or equivalent trusted claims parser). Auth schema/function
   privileges must allow the reviewed definer owner and authenticated fixture role.
   This models identities, not live Auth verification. There are no real users,
   provider keys, JWT verification calls or production data in this scaffold.
3. Copy **actual table/index definitions** from the core sections of
   `supabase/migrations/20260925000000_init_schema.sql` (profiles, user_interests,
   availability, meetups, meetup_attendees, event_interest, queue_entries, connections,
   conversations, messages, blocks, interaction_outcomes, dating_matches). Retain
   exact historical bigint contact IDs, columns, constraints and FK actions. Do NOT
   load that file's pg_net/http extension preamble. Install actual RLS definitions
   from `20260925000001_rls_policies.sql` with search_path public,pg_catalog. The
   executor must own the six candidate-required public tables with FORCE RLS off.
4. Before installing historical 04, provide its compile-time dependency
   `public.shared_interest_labels(uuid,uuid) RETURNS text[]`. Prefer the actual
   pure vec_similarity and shared_interest_labels definitions from
   `20260925000002_embeddings.sql` (only those pure definitions, public placement,
   using the actual user_interests columns). Do NOT load its HTTP/embedding functions
   or embedding triggers. The tests never invoke an embedding/provider/scoring RPC.
   A prior historical scaffold's unrelated empty helper is not evidence for helper
   behavior; no safety predicate/admission/guard may be stubbed.
5. Seed documented disposable browser table/column grants before withdrawal, so ACL
   tests exercise real prior exposure (including contact SELECT/INSERT/UPDATE/DELETE
   and separate column SELECT/UPDATE/REFERENCES grants). Keep browser roles ordinary.
   The new candidate must remove effective access; it aborts on inherited leftovers
   instead of silently trusting RLS. Do not preinstall old triggers/functions or
   safety_private: this is a fresh fixture namespace, not an upgrade of unknown DDL.
6. Parent creates and owns `public.safety_owner_disposable_marker(singleton boolean
   primary key,purpose text not null)`, with exactly
   `(true,'network-none-safety-owner-v1')`. Revoke all browser table/column mutation
   privileges. Do not let the acceptance file create its own marker or authorize
   itself. Marker/GUC attest intent, not actual network isolation.

After preparation, install real historical 04/08/07 definitions and the partial
candidate ONLY. Do not preinstall the new owner/contact candidate for the revised
single-session harness. From this approved repository root, replace only the quoted
socket placeholder with the independently approved absolute network-none socket.
The guard below deliberately rejects preexisting function/helper namespaces rather
than overwriting unknown fixtures. These commands do not create a DB or start services:

```sh
psql -X -w -v ON_ERROR_STOP=1 -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable \
  -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'; SET search_path=public,pg_catalog" \
  -c "DO \$guard\$ BEGIN IF current_database()<>'pebble_safety_owner_disposable' OR to_regclass('public.safety_owner_disposable_marker') IS NULL THEN RAISE EXCEPTION 'Wrong disposable target'; END IF; IF (SELECT pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='public.safety_owner_disposable_marker'::regclass)<>current_user OR (SELECT count(*) FROM public.safety_owner_disposable_marker)<>1 OR NOT EXISTS(SELECT 1 FROM public.safety_owner_disposable_marker WHERE singleton AND purpose='network-none-safety-owner-v1') OR to_regprocedure('public.can_connect(uuid,uuid)') IS NOT NULL OR to_regnamespace('safety_private') IS NOT NULL THEN RAISE EXCEPTION 'Unsafe/occupied disposable scaffold'; END IF; END \$guard\$;" \
  -f supabase/migrations/20260925000004_connection_logic.sql \
  -f supabase/migrations/20260925000008_messaging.sql \
  -f supabase/migrations/20260925000007_dating_track.sql \
  -f docs/safety-contact-guards-migration.sql

psql -X -w -v ON_ERROR_STOP=1 -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable \
  -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'" \
  -f tests/safety-owner-contact.sql
```

The acceptance file must be run from the repository root (its client-side source
copy uses that root), with the new safety_private/functions absent. It seeds a
separate accepted A/C relationship and NULL/third-party sender messages using the
actual old schema/triggers before installing the new guard. It neither disables
triggers nor repairs/deletes those historical rows. They must remain byte-equivalent
after all denied receipt attempts. An ordinary, fresh NOLOGIN test role receives
only one sequence privilege at a time; membership is granted to one browser role
at a time. All four historical identity sequences x both browser roles x SELECT/
USAGE/UPDATE exercise the actual candidate and demand its exact sequence-bypass
error. Per-case snapshots require function bodies/OIDs/owners/ACLs, public relation/
column ACLs and public/Auth triggers to be unchanged after the failed install;
private schema/RPC absence and original effective grants are checked too. Final
positive installation checks effective sequence denial for both roles. A role or
namespace collision is a blocker, not permission to drop unknown objects.

After a successful harness rollback, install the actual candidate in this disposable
DB for multi-session tests. This is a separate parent-only command, not acceptance
of new source or permission for app DB application:

```sh
psql -X -w -v ON_ERROR_STOP=1 -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable \
  -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'; SET search_path=public,pg_catalog" \
  -c "DO \$guard\$ BEGIN IF current_database()<>'pebble_safety_owner_disposable' OR to_regclass('public.safety_owner_disposable_marker') IS NULL THEN RAISE EXCEPTION 'Wrong disposable target'; END IF; IF (SELECT pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid='public.safety_owner_disposable_marker'::regclass)<>current_user OR (SELECT count(*) FROM public.safety_owner_disposable_marker)<>1 OR NOT EXISTS(SELECT 1 FROM public.safety_owner_disposable_marker WHERE singleton AND purpose='network-none-safety-owner-v1') OR to_regprocedure('public.safety_pair_allowed(uuid,uuid)') IS NULL OR to_regnamespace('safety_private') IS NOT NULL THEN RAISE EXCEPTION 'Unsafe/occupied candidate target'; END IF; END \$guard\$;" \
  -f docs/safety-owner-contact-migration.sql
```

There is no facts/Friends/Dating aggregate candidate prerequisite for this safety
subset. There is no full migration replay claim. The old partial acceptance file
uses another DB/marker and rolls its installation back; it is not an installer for
the new test and its old unavailable-blocklist assertion must not be reused after
the opaque getter is installed. Historical functions are real definitions, not
stand-ins for the positive security cases. Capture catalog signatures/OIDs before
and after replacement if asserting preservation, not just final signature shape.

### Exact race invocation example (parent only; repeat the matrix above)

Use separate terminal sessions on the SAME disposable socket/DB/executor. Start
with a fresh guarded setup per matrix case. Every invocation sets the separate
session attestation; no actual calls have been run by the agent:

```sh
# Prepare the send scenario (use request/accept/receipt for their corresponding cases).
psql -X -w -v ON_ERROR_STOP=1 -v mode=setup -v scenario=send -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'" -f tests/safety-owner-race-session.sql
# Terminal 1: wait at the prompt; do NOT release before terminal 3 observes the loser.
psql -X -w -v ON_ERROR_STOP=1 -v mode=run -v operation=block -v participant=winner -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'" -f tests/safety-owner-race-session.sql
# Terminal 2: starts a send and must actually wait on terminal 1.
psql -X -w -v ON_ERROR_STOP=1 -v mode=run -v operation=send -v participant=loser -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'" -f tests/safety-owner-race-session.sql
# Terminal 3: requires a real pg_blocking_pids/Lock wait. Failure is NOT a race pass.
psql -X -w -v ON_ERROR_STOP=1 -v mode=observe -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'" -f tests/safety-owner-race-session.sql
# After release, inspect exact poststate, then close sessions before guarded cleanup.
psql -X -w -v ON_ERROR_STOP=1 -v mode=cleanup -h '/absolute/path/to/approved/network-none-socket' -d pebble_safety_owner_disposable -c "SET pebble.safety_owner_test_target='network-none-safety-owner-v1'" -f tests/safety-owner-race-session.sql
```

Run winner commit AND rollback variants, legacy_block instead of block, reversed
contact/block order, and report/report actor-key races. Expected commit denial is
SQLSTATE 42501, not arbitrary error/timeout; rollback permits the one valid contact
operation. Successful loser operations also prompt and must be explicitly committed
or rolled back. Observer/release must finish within script timeouts. Verify actor
identity, no third-party/anonymous entry, immutable fields, preserved message history,
one report receipt or exact rejected admission, unchanged reverse block and retained
quarantine. A single-session SQL pass is not this race/authorization matrix, and no
result makes remaining discovery/Events/history/read-model gates complete.

For row-before-advisory cycles use the following staged substitutions, never sleeps:

| Fresh scenario | Terminal 1 (row holder/winner label) | Terminal 2 (loser label) |
| --- | --- | --- |
| block_delete | mode=hold_row, row_kind=block, operation=legacy_unblock | mode=run, operation=block |
| receipt | mode=hold_row, row_kind=message, operation=receipt | mode=run, operation=profile_delete |
| accept | mode=hold_row, row_kind=connection, operation=accept | mode=run, operation=profile_delete |

Example terminal 1 flags: `-v mode=hold_row -v row_kind=block -v operation=legacy_unblock
-v participant=winner`. Use the same guarded psql/socket/GUC/file invocation above.
At its first prompt do not type continue yet. Start terminal 2 with participant=loser,
run observer in terminal 3, and only after a real row wait is proven type continue in
terminal 1. This models the executor's pre-trigger row lock, after which the trigger
can wait on the advisory pair or profile row held by the other transaction. Preserve
the original PostgreSQL verbose error/detail: 40P01 abort is rethrown, not swallowed
or recoded as 42501. A surviving successful operation still prompts for commit/
rollback. Capture which side was aborted; 55P03/57014 timeouts, unrelated errors or
an unobserved wait are NOT a passing race. Use mode=inspect and explicit expected
poststate assertions before mode=cleanup, after all run sessions finish.

A committed profile_delete deliberately exercises the historical FK cascades on
ONLY these synthetic fixture rows; it may remove A's profile/contact history. That
is not a block/unblock effect or a new account-deletion product policy. Prefer
rolling back the surviving deletion when inspecting preserved fixture history.
Cleanup accepts A's absence only in this reserved namespace, requires B's original
identity and both synthetic Auth rows, and uses captured connection IDs to remove
only fixture quarantine markers even after cascades. No runtime account-deletion,
historical visibility or deadlock-free raw-DML guarantee follows from these tests.
Normal canonical block/unblock still prelock endpoints/pair; arbitrary elevated
row-first operations can abort safely and require reconciliation, not automatic retry.

### Three-finding repair evidence (same session, current source unexecuted)

Parent reports the **pre-repair** owner/contact SQL acceptance passed in actual
network-none PostgreSQL 17 with historical core/RLS/04/08/07, the prior candidate,
synthetic Auth and a raising, unexercised rank dependency guard. The same prior
source passed 48 Node tests / seven files, two jsdom tests, both typechecks and
diff. Those are real parent-reported narrow results, NOT full replay, multi-session
acceptance, live PostgREST/app-DB activation or passes for the repairs here.

All three review findings are repaired in the existing slice:

- Every affected identity sequence is checked for effective SELECT/USAGE/UPDATE
  for anon and authenticated after direct grants are revoked. Any inherited
  remainder aborts installation with a specific sequence-bypass error. The guarded
  24-case inherited sequence-only role matrix exercises actual installation and
  checks rollback atomically; final positive checks still require effective denial.
- Receipt UPDATE rejects a NULL or out-of-conversation old sender before recipient
  authorization, rather than relying on SQL UNKNOWN. Real pre-install malformed
  message rows on a separate unblocked accepted pair remain untouched and are
  compared against their original complete row snapshots after denied attempts.
  Tests require the exact sender-validation error, not any unrelated denial.
- The reverse-block receipt attempt now uses A receiving B's valid message, with
  a successful unblocked recipient control first, a separate bilateral predicate
  assertion and exact block/contact guard error. A's sender-self denial on A's
  other message remains a separate case, so it cannot mask missing block checks.

Static regressions were updated first; their isolated attempt was Permission denied:
shell, not an executed red result. The Node regression command above, jsdom render
command and both typechecks were attempted independently and also permission-denied.
No repaired unit/typecheck/SQL/race pass is claimed. `git diff --check` passed during
the repair; final whitespace/status checks appear in completion. The expanded
negative/history harness and staged cycle schedules are source for parent execution.
They do not claim the guard protocol is deadlock-free or all-surface blocking.

The current single-session invocation must now start from the historical/prior-only
scaffold and roll back its own positive install, as documented above. Do not rerun
it against the parent's already-installed pre-repair new candidate: use a fresh
reviewed disposable scaffold, never broad-reset an unknown schema. The separate
race invocation still needs an actual new candidate installation after acceptance.
Only docs candidate, static/SQL/race tests and this evidence were changed for these
repairs. Public API/contracts, opaque UI behavior, old migrations and the remaining
discovery/Events/UUID Messaging/history gates are unchanged. No DB/provider/network,
service/config/install/environment/secret or Git mutation occurred. Parent owns
execution, independent review and checkpoint; downtime remains LAST.

### Environment-separated checks for this repair

Run independently (not chained after a failed suite, so typecheck evidence is not
silently skipped). Both environment-separated test commands and both typechecks
were actually attempted and returned **Permission denied: shell**. Whitespace
check passed; no new pass is claimed from the parent’s 46-test partial result:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment node tests/safety-owner-contracts.test.ts tests/safety-owner-api.test.ts tests/safety-owner-candidate.test.ts tests/safety-contact-candidate.test.ts tests/detailed-settings-api.test.ts tests/friends-search-preferences-api.test.ts tests/dating-api.test.ts
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/safety-opaque-ui.test.tsx
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
git diff --check
```

No SQL, setup, role switch, race session, service or real provider/network call was
executed by the agent. The source remains the named operational subset only; UI,
all-surface blocking and matcher integration remain unavailable pending the mapped
closure and actual independent validation. Historical supabase sources, production
configuration, SDK settings, logs, private data and downtime are unchanged.
