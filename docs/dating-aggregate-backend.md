# Dating owner aggregate — persistence/eligibility source slice

Approved worktree `/home/Danuu/Projects/meet-people-worktrees/reconciled-ui-baseline`,
branch `feat/reconciled-ui-baseline`, starting HEAD
`ed0d92b5f935335d40ab24079a41fb655aa7ef5f`; initial status clean. Parent reports the
preceding 62-path frontend checkpoint passed 176 units / 19 files, 66 browsers,
both typechecks and diff, plus actual 320px Settings screenshot inspection. Those
results are baseline evidence, NOT results for this new source slice.

No UI wiring, live Dating, queue, provider, migration history or existing database
change is included. Existing disclosure remains exactly:
**Local prototype recommendations — not live Dating matches.**

## Strict ownership and aggregate shape

`shared/dating.ts` defines distinct strict profile/search schemas. Owner-only
`GET/PUT /api/matchmaking/dating-preferences` is mounted behind the existing
verified-user middleware. Neither body nor query accepts actor selectors. The
transport carries the verified user's JWT/public key to fixed RPCs
`get_dating_preferences()` / `save_dating_preferences(aggregate_in jsonb)`.
No service actor, public projection or actor-ID RPC argument is introduced.

PUT accepts exactly:

```text
{ expectedProfileRevision, expectedSearchRevision, profile, search }
profile = { gender, sexuality, intent, style, heightInches,
            visibility: { gender, sexuality, height }, clarifiedTargets, enabled }
search = null | { ageMin, ageMax, radiusMiles, searchArea }
searchArea = { source: 'home', resolvedLocationRef: null | UUID }
           | { source: 'temporary', areaLabel, resolvedLocationRef: null | UUID }
```

GET returns both resource revisions/values plus
`eligibility: { asOf, adult, locationResolved }` and `effectiveEnabled`. It returns
no DOB, private home label, coordinates, age, other owner or public-viewer payload.
The selected temporary area label is owner-provided private preference data.
Virtual state is profile revision 0 with all-off/empty profile, search revision 0
with null search. GET never inserts defaults or copies legacy/preview fields.

Profile/search are separately typed and revisioned but have **one aggregate write
boundary**: every save compares both expected revisions and increments both, even
when one value is unchanged/null. No separate partial writer is introduced. The
candidate stores them in one private owner row; its single row insert/update and
transaction-level errors guarantee neither side is partially saved. Separate
Friends preferences/storage/revisions are never read or written. The shared area
scalar schema and SQL pure validator are reused only for parity, not data ownership.

Global picture, bio, interests, weekly schedule, home, DOB and account masters are
strictly absent from Dating writes. No optional-facts consent inference, strict
legacy account payload extension, notification or post-match operation is added.

## Identity, clarification, height and explicit consent

Gender/sexuality preserve exact Unicode scalar labels (up to 120), including
legacy/custom case/spacing. Blank `''` is an unfinished draft; whitespace-only,
NUL and unpaired-surrogate values are invalid. No migration/backfill or automatic
coercion to `Other`, Man or Woman occurs. Intent/style use the existing UI choices
plus empty draft. Height is **one integer total inches, 24–107 or null**, matching
the frontend 2–8 feet plus 0–11 inch range. Zero **remainder** is retained (5ft 0in
= 60); zero total height is invalid, not a missing-value sentinel. Null is unset.
Never save strings or competing feet/inches. Visibility defaults false and is completely independent
of explicit `enabled` preference intent; displaying identity never enables consent.

Exact clear mappings match the confirmed UI: Man/Straight -> Woman,
Woman/Straight -> Man, Man/Gay -> Man, Woman/Gay -> Woman,
Woman/Lesbian -> Woman. Every other nonempty combination needs explicit clarified
target labels. Targets are up to four unique exact nonblank labels, including
exact custom targets; there is no implied wildcard for a custom identity.
Reciprocity requires **both** resolved target sets to include the other's exact
gender label. This helper establishes target compatibility only, not adult,
location, block, discovery, mutual-consent or matching admission.

Clear mappings cannot carry redundant/stale clarification. A missing prior aggregate
or two unset prior labels permits the first ambiguous identity plus explicit targets
in one atomic save (including after a persisted empty draft). Existing identities
retain invalidation: if either prior label is set, changing/filling either label
must send an empty clarifiedTargets array; the atomic RPC rejects otherwise. This
conservative rule includes both partial-identity cases. After a cleared identity
edit, unchanged labels can receive fresh targets in the next CAS save. Other edits
with unchanged identity may retain clarification. This prevents a retained old target
array being reused on an established identity edit. It is not implicit normalization on the server,
which would contradict exact write/readback. Missing identity/intent/style/targets
can remain draft but cannot set enabled. Height/visibility are optional, not gates.

## Authoritative eligibility and unresolved geography

Canonical `profiles.birthdate` is read inside the actor RPC, never supplied by the
client or sourced from the defaulted account document. The fixed transaction instant
is converted to **America/New_York**, not UTC or the session/host timezone, and
returned as `asOf`. Both SQL getter/saver use `dating_campus_date(timestamptz)`;
this named-zone helper is STABLE and browser EXECUTE is revoked. The TypeScript
`datingCampusDate(Date)` peer accepts an explicit instant, not an implicit current
clock. `dating_adult_on(date,date)` and the TypeScript
`adultOn(DOB, asOf)` helper reject missing, invalid/nonfinite/out-of-range/future
dates and require an exact campus-calendar age >=18. TypeScript parsing rejects invalid
calendar dates instead of Date rollover. Feb 29 reaches the boundary on March 1
in a nonleap year. Offline tests use explicit 2026 dates/instants, not wall-clock age.
Winter instants immediately before/at 05:00Z and summer before/at 04:00Z prove no
admission during the preceding campus day merely because UTC has reached a birthday.
The actual RPC trusts PostgreSQL's canonical date type and rechecks DOB on every
read/save. The public payload omits DOB; API validation trusts the actor RPC's
eligibility receipt rather than accepting a client assertion.

Search has independent integer age bounds 18–99 (min<=max), radius 1–100 miles,
and home/temporary selection. There are no Friends goals, coordinates or guessed
city centres. Null search/unresolved references can be stored as disabled drafts.
Setting enabled requires a selected **usable owner/source/exact-label-bound Dating
reference**, plus complete profile and canonical adult eligibility. Home refs are
checked against the current canonical home label without changing home. Foreign,
missing, unusable or wrong-label nonnull refs are rejected even for draft writes;
explicitly clear a stale ref to keep an unresolved disabled draft.

`dating_search_location_refs` is private, with no issuer RPC, browser DML, seeded
production geography or geocoding request. A later trusted resolver must issue and
revoke exact owner-bound assertions; Friends references are not Dating assertions.
All fixture coordinates in the guarded SQL are explicitly synthetic test data.

Stored enabled preference remains distinct from the computed receipt: DOB/home or
reference changes can mask effectiveEnabled false without fabricating a consent
write. **Even effectiveEnabled=true means only this aggregate's eligibility-qualified
preference, NOT live discovery or safe Dating admission.** A future live gate must
also enforce persisted global discovery masters, the separate detailed Dating
discovery choice, both actors' explicit consent/eligibility/reciprocity, bilateral
blocks/safety, authoritative location/age/radius constraints and every legacy path.

## Atomicity, readback, errors and parent SQL acceptance

The candidate is additive docs source, not a migration in supabase history.
It fails on name collisions instead of adopting unknown objects. Tables have RLS
enabled and all browser table/column access withheld; helpers have EXECUTE revoked.
Only the owner getters/saver are granted to authenticated. Parent must review
definer ownership, inherited/default privileges and prerequisite helper provenance.
The executor must be able to read canonical DOB/home despite owner RLS (explicit
preflight), not accidentally treat RLS-filtered data as authoritative.

Writes require READ COMMITTED. Lock order is canonical profile FOR SHARE,
selected trusted ref FOR SHARE, existing aggregate FOR UPDATE. No table-wide,
advisory, pair or legacy writer locks are added. Initial insert races use
ON CONFLICT DO NOTHING then DA409; existing writes compare both revisions under
the owner row lock. Revision range is safe integers, with exhaustion rejected.
This is owner-resource CAS, not block-vs-contact race protection.

The API maps DA409 -> 409/conflict, auth -> 401, input/eligibility -> 400,
missing RPC/privilege/isolation prerequisites -> 503/unavailable, malformed output
-> 502/malformed, unknown failures -> 503/provider. PUT validates atomic RPC
readback against **both** requested values/revisions, then performs a separate
canonical GET and compares both again. Eligibility may independently change on
that GET; both snapshots must validate their computed masks. Failed/divergent
readback returns no partial success. Once save returns valid matching values,
**any subsequent GET failure** is stage-aware uncertainty: malformed/divergent
output returns 502/malformed; all error envelopes (including input/auth/missing)
or thrown transport failures return 503/provider. The message explicitly says
changes may already be saved and requires aggregate reload (and sign-in if needed).
It never reuses the pre-save input error's "No changes were saved" assertion.
Standalone GET and pre-save error mapping remain unchanged. A write may already have committed: callers
must GET/reconcile the aggregate before retrying, never automatically repeat PUT.
No frontend client/hook is enabled yet to obscure that uncertainty boundary.

`tests/dating-aggregate.sql` is guarded **acceptance SOURCE ONLY** requiring:

- DB `pebble_dating_disposable`, reviewed candidate/prerequisites already installed.
- Executor-owned `public.dating_disposable_marker(singleton boolean primary key,
  purpose text not null)` with exactly `(true,'network-none-dating-v1')` and no
  browser mutation grants.
- Separate session GUC `pebble.dating_test_target='network-none-dating-v1'`.
- Independently verified network-none runtime; marker/GUC do not establish isolation.

It rolls back synthetic fixtures and checks privileges/no-JWT, owner isolation,
zero-remainder/custom preservation, height bounds, initial/empty/partial identity
transitions, target mappings, fixed campus-midnight/birthday edges, both stale
revisions/no partial writes, invalid values, identity clarification invalidation,
foreign/wrong-label refs, missing/underage DOB, adult save and revocation masking.
It does not load extensions, contact services or execute legacy Dating/provider RPCs.
Parent reports the **pre-repair** candidate passed actual guarded SQL acceptance
in network-none PostgreSQL using exact historical profiles plus synthetic Auth/
facts/Friends helper prerequisites. That is narrow parent SQL evidence, not full
replay, concurrency, app-DB application, or acceptance of the repairs below.
Agent has executed no SQL; updated installation/syntax/runtime remain unverified.
Parent concurrency acceptance must separately hold an initial/existing aggregate
winner open, observe the loser waiting, commit and require whole-aggregate DA409;
repeat with winner rollback and require one complete winner snapshot. Exercise
stale profile-only and search-only expectations, DOB/home writer and ref revoker
blocking. Do not treat static source checks or single-session SQL as those races.

## Legacy bypass map — NOT protected by the new endpoint

Source review only; no existing RPC/policy changed, no installed ACL certification:

| Historical surface | Unfinished gating before any live Dating |
| --- | --- |
| `20260925000005_queue_and_matching.sql: join_queue(text)` | Explicitly admits `dating` via direct RPC; HTTP's active/downtime-only schema does not gate direct SQL/PostgREST calls. Must enforce current explicit adult/consent/aggregate/global-master policy for both insertion/update paths. |
| `queue_entries` direct DML/RLS and `get_queue_match()` Dating branch | Audit effective grants/policies/triggers and every queue/result entry; no aggregate revision consumption exists. |
| `20260925000007_dating_track.sql: get_dating_match()` | Definer reads candidates, biographical/shared fields and suggested places from legacy queue, not this aggregate; existing block query is not all-path race proof. Needs bilateral eligibility/consent/visibility/location/age/reciprocity gates and blocked-pair concurrency design. |
| `person_dating_score(me,other)` and helpers | Arbitrary ID scoring/embedding/reliability dependencies do not consume the new contract. Review direct/default execute grants, actor binding, permitted audience and provider seams; do not invoke in acceptance. |
| `request_dating_match(uuid)` | Calls existing can_connect but has no new Dating consent/adult/reciprocal/search admission. Scoped safety predicate repairs do not make this a full race-safe gate. |
| `accept_dating_match(bigint)`, `end_dating_match(bigint)` | Participant/status checks are not this eligibility contract. Review admission and revoke/disable/blocked behavior; lifecycle expansion deferred. |
| `20260925000001_rls_policies.sql: dating_matches` SELECT/INSERT/UPDATE policies | Existing participant/pending/matched checks allow direct paths independent of new aggregate. Public metadata audience/privacy and mutation constraints require separate review/gating. |
| Legacy `profiles`, account/profile writers, Connections/Messaging | DOB/home can change outside this aggregate; no current all-surface policy enforcement or safety/DML closure is inferred. |

The prototype disclosure is retained; no UI save binding, real Dating cards,
queue activation, notifications, groups, post-match expansion or downtime redesign.

## Verification and completion boundary

Tests-first contract source preceded implementation; initial isolated red attempt
was **Permission denied: shell**, not an executed failure. Added offline suites
cover strict schemas/global-field rejection, custom/zero-remainder/reciprocity, birthday
edges, verified actor isolation, both revisions, aggregate errors/readback and real
SDK envelopes with injected local responses. Static SQL tests are source assertions
only. No real network or API/provider call is made by these fixtures.

These commands were attempted and **Permission denied: shell**; no green/typecheck
result is claimed for this new slice:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/dating-contracts.test.ts
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/dating-contracts.test.ts tests/dating-api.test.ts tests/dating-candidate.test.ts tests/friends-search-preferences-api.test.ts tests/detailed-settings-api.test.ts tests/profile-details-api.test.ts tests/matchmaking-contracts.test.ts
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
```

Parent owns fresh offline execution, disposable SQL installation/acceptance and
checkpoint. Whitespace checks and final Git identity/status are reported separately.
No commit/stage/push, Git mutation, service/deployment change, DB/Supabase action,
provider/geocoder/network request, environment/secret access, configuration/install
change, protected checkout edit or frontend activation occurred.

## Four-finding repair checkpoint (same session / unchanged HEAD)

Parent reports pre-repair 52 units / seven files, both typechecks and diff passed,
plus the narrow actual SQL evidence above. The independent review then identified
UTC/campus early eligibility, initial clarification being treated as an established
edit, zero-total/range mismatch and post-save GET rollback wording. None of those
prior results prove the updated repair source passed.

All four are repaired consistently in the existing slice paths. New tests cover
winter/summer explicit instants and the SQL shared clock/helper ACL; first clarified
save from absence and saved empty identity; conservative partial/full transition
invalidation with no partial write; 24/60/107/null versus 0/23/108/fractions; and
successful mutation followed by 22023/auth/missing/malformed/thrown/divergent GET,
retaining committed values, returning uncertainty, and issuing exactly one save
and one read. Two-revision CAS, first-insert conflict handling, authoritative DOB/
home/reference locks, private ACLs and legacy-bypass limitations are unchanged.

The initial three-suite repair regression attempt was Permission denied: shell:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/dating-contracts.test.ts tests/dating-api.test.ts tests/dating-candidate.test.ts
```

Fresh regression/typecheck attempts and whitespace results are recorded in the
completion report; no test or SQL repair pass is fabricated. Parent must use a
fresh reviewed disposable installation (candidate deliberately does not replace
existing objects), execute the updated guarded SQL and perform separate observed
CAS/DOB/ref concurrency checks. No UI/prototype-fixture changes, live discovery/eligibility
admission, legacy RPC gate, downtime redesign or additional resource was enabled.
