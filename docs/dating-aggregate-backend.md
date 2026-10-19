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

## Canonical preference UI integration — next bounded source slice

Approved baseline is now parent checkpoint
`38fdf3915716fdb8442511e6336079750f3c4c45` on the same worktree/branch, initially
clean. Parent reports the repaired foundation accepted with no material findings,
67 focused tests / seven files, both typechecks/diff and actual guarded network-none
PostgreSQL 17 acceptance using synthetic Auth, exact historical profiles and the
facts/Friends prerequisites. This is foundation evidence, not frontend execution,
full replay, multi-session concurrency, live PostgREST or app-DB application.

### Canonical resource, not a second subsystem or activation path

`dating-aggregate-client.ts` captures the existing canonical AccountContext token,
strictly validates Dating aggregate/errors, retains its 15s deadline through JSON
consumption and never retries PUT. Its mutation entry rejects enabled=true even
if otherwise schema-valid. `useDatingPreferences.ts` follows the repaired domain-
specific facts/Settings pattern, without changing either or creating a generic
resource framework. Render-time client/account-busy fences and synchronous locking
precede transport; layout unmount cleanup fences late work before passive cleanup.
Owner/client generations abort/ignore obsolete continuations and retained callbacks.

Both expected revisions must match current authority. A single aggregate PUT must
confirm both revisions/values, followed by a separate browser GET comparison of
both domains. Eligibility may independently change, but each response validates its
mask; no effective live-Dating claim follows. Conflict, uncertain transport or
malformed/partial/divergent save/readback closes write capability. Explicit reload
is required; repeated same-owner token refreshes cannot clear that gate. Confirmed
invalid input can be corrected without claiming a write. Read failures retain the
last confirmed snapshot, never editable invented defaults. Resource state survives
sheet dismissal, so close/reopen does not bypass reconciliation. Owner change
remounts private resource/form state. Whole route/auth-shell replacement discards
local drafts; a fresh instance still requires canonical GET before mutation.

`DatingPreferences.tsx` owns that resource while the existing sheet is open/closed.
`MatchingViews.tsx` removes only Dating's memory-persisted filters/search/details.
Production always passes the canonical boundary; the old render-only sheet callback
interface remains for existing isolated layout tests, never an unavailable fallback.
No Friends resource, global account, picture, bio, interests, availability, home,
DOB, queue, provider, notification or post-match write is added.

### Sheet semantics and preserved design

The existing MatchFilterSheet, DatingPreferenceFields and SearchPreferenceFields
are reused. Unknown/unavailable capability exposes no sliders/identity controls,
only honest state and a read-only retry; there is no fake local save. Server
profile defaults (including visibility off) override old preview defaults. Missing
search is shown as explicitly **unsaved suggested bounds**, saved only by a user's
explicit action, never by GET or field mounting.

The action is **Save disabled Dating draft**, available only for an already-disabled
or absent profile. A stored enabled-consent snapshot is read-only: the UI locks
details/search and save/reset/clarification controls; the synchronous hook authority
and mapper independently reject attempts to construct/send a disabling edit. No
activation or opt-out control is introduced. Reload/close remain available.
Unresolved/null locations and incomplete/adult-ineligible details
remain savable disabled drafts. Visibility choices do not activate. The sheet
shows a dated server eligibility receipt, not a locally fabricated adult capability.

Fixed identity choices retain exact custom legacy labels; Unicode scalar lengths
and existing exact custom target labels round-trip without rewriting or inventing
categories. Existing custom target checkboxes remain available after uncheck.
Select identity changes clear target drafts. Initial identity clarification saves
once; established/partial edits that try to submit new targets receive explicit
clear/save/reopen/confirm guidance and no bypass/automatic server normalization.
Height maps nullable total 24–107 inches to feet/remainder and back; 60 is 5ft 0in,
not missing. Partial units are rejected. Numeric age/radius drafts are independent
of Friends. Reset affects age/distance only, Cancel/Escape/drag discards unsaved
form state, and focus/scroll restoration stays in the existing sheet. Pending
save/readback locks fields, close/Escape/drag, Reset and reload until confirmation.

Explicit reload warns that it replaces both drafts; a synchronous local reload
lock prevents duplicate callbacks reopening editing while a read is pending.
Reload failure keeps drafts and any reconciliation gate. Closing a read-only reload
is allowed; layout-unmount fencing prevents its completion from overwriting a new
sheet's edits. Refreshed revisions cannot silently rebase an old draft. A same-area
trusted reference is retained only when currently confirmed resolved; edited area,
changed home or revoked/unconfirmed resolution sends null, never guessed geography.
Area text is preserved exactly; no trim rewrite, geocoder or coordinate payload.

The action rows wrap in canonical Dating sheets for narrow screens. Existing
heading/handle drag threshold, native form scrolling, short-sheet overflow and
desktop layout are retained. Exact disclosure remains:
**Local prototype recommendations — not live Dating matches.**
Fixture recommendations/likes/cards and their local decision state are unchanged;
saved preferences do not filter them. Existing availability/global masters/downtime
and Dating safety/legacy bypass gaps remain separate unchanged gates.

### New tests, browser sources and actual verification limits

New offline fixture/client/hook/render source covers strict capability, unavailable/
partial responses, both revisions, zero remainder/custom labels, exact area text,
disabled-only transport, deadlines, duplicate pending locks, separate GET, conflict/
uncertainty and failed reload, repeated token refresh, retained pre-effect callbacks,
account-busy/owner changes, late initial reads, unmount, Cancel/Reset, initial versus
established clarification and cancelled late reloads. Older no-account Dating tests
now assert honest unavailable state rather than local-save fallback; equivalent
draft/cancel/reset/persistence behavior is covered against the canonical fixture.

The shared browser fixture adds a separate synthetic Dating aggregate, not keys in
the account document. It rejects activation/stale transitions and keeps external
traffic blocked. Updated reference/mixed-readiness tests expect canonical writes
and reload persistence; card metadata and global/shared no-write assertions remain.
New `e2e/dating-preferences.spec.ts` authors 320/390/1440 and 390x420 draft/pending/
reloaded captures, unavailable capability, legacy identity guidance, conflict and
uncertain readback. These are screenshot **source**, not produced/inspected images.
No browser/Vite service was started under this task's no-service restriction.
Proposed isolated parent execution (not run by agent):

```text
pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/dating-preferences.spec.ts e2e/dating-reference.spec.ts e2e/account-matchmaking-readiness.spec.ts
```

The following actual attempts were **Permission denied: shell**; no unit/typecheck
pass is claimed for this frontend cycle:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/dating-ui-client.test.ts tests/dating-ui-hook.test.ts tests/dating-ui-render.test.tsx tests/dating-views.test.tsx tests/match-filter-sheet.test.tsx tests/frontend-preference-rules.test.tsx tests/detailed-settings-hook.test.ts tests/profile-details-hook.test.ts
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
```

`git diff --check` passed during implementation; final checks/status are reported
in completion. Parent must execute focused/broader regressions, inspect real narrow/
short/desktop screenshots and review authority, reload and identity fences before
checkpoint. Neither SQL foundation acceptance nor source review is frontend runtime
evidence. No SQL/backend application, migration replay, multi-session concurrency,
live PostgREST/discovery, resolver, delivery, safety, native-device or all-surface
privacy enforcement has been established here. No staging/commit/push, Git mutation,
secret/environment access, provider/network/geocoder request, service/deployment,
configuration/install or protected-checkout operation occurred.

### Pending browser locator repair and adversarial consent review

Same authorized HEAD `38fdf3915716fdb8442511e6336079750f3c4c45`; initial dirty
inventory remains the existing 22-path frontend slice. Parent reports the preceding
**79 units / eight files, both typechecks and diff PASS**. Actual browser execution
returned **28 PASS / 1 FAIL of 29**, not a full pass: the short-mobile test in
`e2e/account-matchmaking-readiness.spec.ts:199` still selected obsolete
`Save preferences`, while the actual canonical action is `Save disabled Dating draft`.
That locator is updated with exact accessible matching and explicit visibility;
scroll reachability, screenshot, overflow, zero writes and external-traffic checks
are retained. No UI label alias or removed coverage masks the failure.

The adversarial review found one concrete product defect beyond the locator:
the disabled-draft mapper previously sent enabled=false even when the loaded owner
profile had enabled=true. Ordinary visibility/detail/search editing would therefore
disable existing consent. Explicit copy did not make this a suitable implicit
consent mutation. The bounded repair is read-only handling for enabled snapshots,
not new activation, consent editing or a backend-policy redesign. Both baseline and
current snapshot flags lock the form; hook mutation entry checks current synchronous
authority, including retained ready callbacks after reload, and the mapper refuses
an enabled baseline. The client still refuses enabled=true requests. No PUT is sent
for a known enabled profile. If consent changes elsewhere after an old disabled
GET, both-revision CAS rejects the stale attempt without changing stored consent;
explicit reload then makes the resource read-only. Independent concurrency runtime
acceptance remains outstanding; the test is a deterministic offline transport model.

New regression source covers initial/reloaded enabled snapshots, retained callbacks,
stale-version concurrent-consent model, read-only form/direct submit/cancel/reload,
and preserved stored values/zero PUTs. The existing browser source adds a synthetic
enabled-snapshot read-only case and screenshot for parent execution. A mapper check
also covers current-home change dropping an otherwise resolved home reference,
alongside existing temporary-label/revocation checks; no geocoding is introduced.

Other reviewed invariants remain: exact custom labels and targets survive reads;
partial/established identity edits require cleared targets while absent/unset initial
identity can clarify once; 60 inches round-trips as 5ft + 0in; current render/session/
account-busy fences and layout unmount cleanup precede obsolete request continuation;
separate canonical GET failure retains uncertainty/no retry; stale refs clear to
unresolved selections instead of fabricated coordinates. No additional concrete
material defect was identified in those source paths during this repair review.

The focused three-suite regression attempt and the eight-suite regression command
above were **Permission denied: shell**, as were both typechecks. These are not
fresh repair passes. `git diff --check` passed during this repair. Browser tests were
not rerun or screenshots inspected by the agent; do not report 29 passed, nor treat
the earlier 79-unit/typecheck results as execution of these new tests. Parent owns
independent rerun/review/checkpoint. No backend, shared aggregate contract, SQL,
operational/Dating fixture cards, exact disclosure, global account data or downtime
behavior was changed; no service, network/provider/DB action or Git mutation occurred.
