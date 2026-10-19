# Friends search preferences and active-nearby policy — source foundation

Approved worktree/branch: `reconciled-ui-baseline`, `feat/reconciled-ui-baseline`;
starting HEAD `a0971ffdc76881935615093995b62ac476a08ca4`. Existing frontend work is
intentionally dirty and preserved. Parent owns commits. Parent reports the earlier
facts fixes passed 61 UI/hook tests, 35 backend tests, five browser cases, both
typechecks and diff checks. Those results predate this slice, not evidence for it.

## Inspected boundaries and non-activation

- `shared/matchmaking.ts`: queue join is strictly mode-only; profile interests and
  weekly windows are global. The legacy label schema trims strings, so the new
  pure policy validates exact labels separately instead of reserializing through it.
- `MatchFilterSheet.tsx` / `search-preferences.ts`: numeric Friends/Dating choices,
  custom goals and temporary area are currently disclosed component previews.
  Preview defaults are not canonical choices. These files/UI are unchanged.
- Historical `person_friend_score` calls profile embeddings synchronously and
  supplies neutral distance for missing latitude; `get_queue_match` does not
  consume these numeric preferences. Neither function/migration is changed.

New owner GET/PUT source is mounted in the existing authenticated Express router.
**No UI or production matcher consumes it.** Candidate SQL is authored under docs,
not applied, and no running RPC/schema/provider/location readiness is established.
This is not a fix for broader direct-RPC/DML profile privacy or contact blocking.
Dating remains the disclosed local prototype. Downtime is LAST, framework undefined;
no thresholds, groups, notices, rewards or post-match lifecycle are introduced.

## Separate owner resource

`GET /api/matchmaking/friends-search-preferences` returns
`{revision:0,preferences:null}` when choices have never been saved, without writing
a row or inventing ages/radius/goals. Stored snapshots have revision >=1 and all
explicit choices. `PUT` accepts only:

```json
{
  "expectedRevision": 0,
  "preferences": {
    "ageMin": 18,
    "ageMax": 99,
    "radiusMiles": 10,
    "goals": [" Exact custom\ngoal "],
    "searchArea": {"source": "home", "resolvedLocationRef": null}
  }
}
```

Age bounds are inclusive integers 18–99, min <= max (including equal bounds).
Radius is an integer 1–100 miles. Up to 20 nonblank, exact-unique goals of at most
120 Unicode code points are preserved, including custom case/spacing/newlines.
Exact duplicate labels reject; differently cased/spaced goal labels are not silently
merged. All labels reject NUL/unpaired UTF-16 and use the facts contract's explicit
v1 whitespace definition for nonblank validation. This does not impose a catalogue.
Reference UUIDs require exactly 36 characters and the pinned installed Zod RFC
pattern: ordinary UUID hex can be mixed-case, nil is accepted, and the special
max UUID is lowercase-only. SQL mirrors that format; no trailing line terminators
are accepted. A paired static corpus is not PostgreSQL regex execution evidence.

Temporary search uses `{source:"temporary",areaLabel:"Exact label",resolvedLocationRef:null}`.
Only temporary selections carry an area label; home always means the existing
canonical home. Raw coordinates, actor IDs, mode/Dating fields, DOB, interests,
weekly windows and home writes are forbidden in this strict resource. No legacy
`Nearby`/distance-string conversion, copied profile payload or UI defaults are used.

Success returns the new owner snapshot. Values/order and revision must confirm
the submitted request; wrong/malformed readback is 502, not success. `FP409` maps
to distinct Express `409/conflict` via the upstream error body (the SQLSTATE suffix
does not itself set PostgREST HTTP status). Auth is 401, validation 400, dependency
unavailable 503, provider/uncertain 503, malformed 502. Every response is no-store.
Missing RPCs never look like unsaved/default success. After conflicts or uncertain
writes, consumers must GET/reconcile; no automatic mutation retry is implemented.

Storage is independent of Dating, optional facts and the strict whole-account
document. Existing writers cannot overwrite this table. Join/leave/status/result
and active priority remain unchanged. Separate saved revision consumption and
session snapshot/change behavior are future integration work, not implied here.

## Trusted location references, not invented nearby geography

The candidate defines an **empty private assertion registry**, not a place catalogue:
`friends_search_location_refs` contains owner-bound UUID, source, exact area label,
finite-range coordinates and explicit `usable` status. No rows, geocoder, issuer
RPC, browser table access, live location request or expiry default is supplied.
The browser can submit only a nullable reference. Issuance/revocation and a secure
delivery/lookup contract require a future trusted implementation; arbitrary client
UUIDs do not establish geography. No source invents a location from area text.

For non-null refs, save verifies owner, usability, source, and exact area binding.
A home ref must match the current `profiles.location_city`; a temporary ref must
match its exact selected label. Lock order is current home (if applicable), reference,
then preference CAS. Trusted issuers must respect that order. Share locks prevent
concurrent changes during validation/write, not indefinite validity after commit.
Later revocation or home change leaves a saved intent visible to its owner but
must exclude it from nearby eligibility. No TTL/lifetime or freshness policy is
guessed: future adapters must supply currently authoritative usability and binding.

The pure policy rechecks refs every evaluation. Coordinates are selected search-area
anchors, not measured presence/GPS, travel distance or proof a person is physically
there. Production adoption needs explicit resolver/trust and geography semantics
review. Opaque references appear only in authenticated owner preference snapshots;
coordinates do not appear in those snapshots. This resource exposes neither through
a public route; broader legacy privacy issues remain outside this slice.

## Pure active policy

`shared/active-nearby-policy.ts` has no network, clock reads or mutations. Inputs
are **internal trusted evidence**, not HTTP payloads: verified actor ID; canonical
people/readiness/Auth/consent/global+Friends discovery; current DOB/home/explicit
preferences/interests/week; complete bilateral block list; trusted location assertions;
and an explicit `asOfDate` calendar date. Null block/location evidence fails closed.
Permission/block evidence is validated globally. Location evidence must be a known
array, but full records are validated only for each selected reference. Unrelated
malformed rows do not suppress valid pairs/batches. Selected missing/malformed
records or duplicate IDs (even an identical duplicate or a malformed duplicate)
fail closed for that selection; IDs are compared case-insensitively as UUID hex.
Passing booleans or locations from an untrusted caller would NOT establish security.
`eligible` must be the future adapter's authoritative canonical-readiness/account
decision, not inferred from sliders or forged input. The policy also rejects invalid
intrinsic dates, bounds, labels, overlapping windows and coordinates.

Both people must authenticate/qualify/consent/be discoverable. Either-direction
blocks exclude. Each age must satisfy the other's bounds; both radii must admit
the great-circle distance between trusted anchors. Missing/wrong-owner/revoked/
source-or-label-mismatched refs never qualify. Zero coordinates are valid; missing
coordinates are not zero. Radius equality uses only eight machine epsilons of
roundoff tolerance. DOB age uses the supplied date, with Feb-29 birthdays advancing
on March 1 in non-leap years; the adapter must supply the approved calendar date.
There is no automatic schedule timezone conversion (shared campus wall time remains
America/New_York), location expiry, widening radius, fit cutoff or live availability.

Zero shared interests and zero weekly overlap remain eligible. Original labels and
weekly windows are never rewritten. Derived interest keys reuse pinned comparison
v1 from `profile-details.ts` (not full Unicode folding/normalization); duplicate
comparison keys count once. Weekly intersections are exact seconds on dow 0–6,
including seconds, adjacency and end-of-day `24:00:00`, not coarse buckets. Empty
signal arrays are allowed computationally; authoritative global readiness remains
the adapter's responsibility rather than an invented active fit minimum.

Ranking is deterministic and nearby-first: distance ascending, then supplied finite
**cached** legacy friend score descending (missing/invalid cache becomes null and
compares neutrally as zero), shared-key count, overlap seconds, and canonical UUID
byte order. Cache/interest/schedule are equal-distance soft tie-breakers, not
admission thresholds. A nearer eligible zero-fit candidate precedes a farther
strong-fit candidate within reciprocal bounds. This preserves a safe existing-ranker seam
without invoking its provider-dependent functions or inventing embeddings. No new
weighted/learned model is claimed; absent cached score uses only the explicit soft
signals. Goals are stored but not scored without a defined goal-compatibility policy.
Invalid candidates are omitted; duplicate validated candidate IDs are excluded.
The output is internal ranking diagnostics, not a new public roster/group contract.

## Parent-only database acceptance and activation gates

Apply nothing to an existing DB from this task. Candidate prerequisites are existing
Auth/roles/profiles and the reviewed facts candidate's pinned comparison helper;
it is not a standalone/repeatable installer. CREATE collisions abort instead of
adopting unknown owners/ACLs. Parent reviews default/inherited table/column/function
privileges and trusted ownership. Both tables are RLS-enabled, with browser table
access and internal-validator EXECUTE revoked; only owner GET/save RPCs are granted.
Writes require READ COMMITTED; all other isolation rejects before writes. Initial
INSERT CAS and established UPDATE CAS both return `FP409` on losing revisions.
Respect the existing account-reconciliation prerequisite order in
`dev-account-reconciliation.md` and the facts candidate acceptance in
`profile-details-backend.md`; the new candidate follows the pinned facts helper.
Do not replay historical CREATE migrations afterward, rewrite migration history,
or infer a complete migration replay from this independent resource candidate.

In a separately approved network-none disposable DB with synthetic Auth/location
assertions only, parent should execute: strict NULL/type/key/Unicode/bounds matrix;
owner/anon/helper/direct table and column denial; malicious foreign/missing/revoked/
wrong-source/wrong-label refs; coordinate NaN/Infinity/ranges; initial/existing CAS
barriers and winner rollback; exhausted revisions; unsupported isolation; full atomic
rollback; separate-account/facts/Dating/interests/week/home/DOB/queue preservation.
Check save vs issuer/home-update lock ordering and revocation after save. Exercise
actual PostgREST error/readback behavior and source UUID-format parity. Static SQL
assertions and mocked RPC tests are explicitly NOT SQL or concurrency evidence.

Before production matcher/UI activation: verified installation/dependency readiness,
trusted resolution issuance/revocation/read path, complete bilateral blocks and
discovery/consent/readiness enforcement across direct SQL/RPC paths, canonical
revision consumption/session semantics, and no-network ranker integration must be
independently demonstrated. Preserve existing connection exclusions and legacy
single-candidate/manual queue behavior; do not replace them with the pure policy
without integration review. No such activation or live verification is claimed.

## Verification for this source slice

Three focused test files were authored before implementation. The isolated red
attempt and subsequent regression/frontend/API typecheck commands were
permission-denied, not executed failures or passing checks. No SQL/provider/service
operation occurred. Parent commands (isolated config does not load production env):

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/friends-search-preferences-contracts.test.ts tests/friends-search-preferences-api.test.ts tests/active-nearby-policy.test.ts tests/matchmaking-contracts.test.ts tests/profile-details-api.test.ts tests/profile-details-contracts.test.ts
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
git diff --check
```

Until actual execution is recorded, tests are coverage source, not proof of passing
runtime behavior. Parent owns fresh verification, staging/commits and any later DB
application. Existing frontend disclosures remain accurate: saved new contracts
are not yet consumed by its numeric filter preview or production matching.

## Nearby-priority/reference-isolation repair and SQL acceptance source

Parent reports **46 tests across six suites**, frontend/API typechecks and diff
PASS before these repairs. That is parent-reported evidence for the previous
source, not a passing result for these changes or SQL execution evidence.

Policy regressions now cover nearer zero-fit vs farther high-score/full-fit within
both radii, unchanged equal-distance tie-breakers, pair/batch isolation of unrelated
bad locations, selected missing/malformed/duplicate/conflicting rows, and globally
invalid permission evidence. They were added before implementation; the attempted
isolated red command was permission-denied, not an executed failing test:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/active-nearby-policy.test.ts
```

The later six-suite regression and frontend/API typecheck commands in the
Verification section were also permission-denied for this repair. No new unit,
typecheck or SQL passing result is claimed. Whitespace checks are reported
separately and are not runtime evidence.

`tests/friends-search-preferences.sql` is reusable **acceptance SOURCE ONLY** for
parent execution after independently installing the reviewed candidate and its
prerequisites in a verified network-none disposable PostgreSQL instance. It does
not install migrations, establish full replay, test live PostgREST or run concurrent
sessions. It guards before fixture writes with:

- Exact database name `pebble_friends_preferences_disposable`.
- Parent-created `public.friends_preferences_disposable_marker`, owned by the test
  executor, with exactly one `(true,'network-none-friends-preferences-v1')` row;
  columns are `singleton boolean primary key` and `purpose text not null`. Browser
  mutation grants on the marker and superuser/BYPASSRLS browser roles are rejected.
- Separate parent-set session GUC `pebble.friends_preferences_test_target` with
  value `network-none-friends-preferences-v1`. The source never creates its own
  marker or self-authorizes this GUC. Neither marker nor GUC proves network
  isolation: parent must independently enforce/verify the disposable environment.
- Fixed synthetic Auth/profile/reference namespace collision checks, no overwrite,
  enabled PL/pgSQL assertions and rollback of all fixture data.

The source covers owner/anonymous/no-JWT behavior, effective table/column/helper
ACLs plus actual direct-access denial, empty GET without a row, missing-key/SQL-
NULL/JSON-null/type/bounds/Unicode/UUID matrices, exact custom labels, ref owner/
usability/source/label binding, finite/range/NULL coordinate constraints, valid home
and temporary saves, sequential stale-CAS atomicity, cross-owner writes and unchanged
profile/home/DOB snapshots. Separate guarded REPEATABLE READ/SERIALIZABLE transactions
verify isolation rejection before validation/writes. The file intentionally expects
raw unrepresentable JSONB strings to fail before entering the RPC; those cases do
not substitute for the HTTP/actual PostgREST error contract tests.

Proposed parent-only invocation, **not a command executed or result claimed here**;
replace the socket placeholder only with the independently approved disposable
Unix socket. Marker/candidate preparation is a separate parent-owned step:

```text
psql -X -v ON_ERROR_STOP=1 -h <approved-network-none-socket> -d pebble_friends_preferences_disposable -c "SET pebble.friends_preferences_test_target = 'network-none-friends-preferences-v1'" -f tests/friends-search-preferences.sql
```

Parent still owns observed-lock two-session initial/established CAS and winner
rollback tests, issuer/home-update concurrency, full migration replay and live
deployment acceptance. Static source checks are explicitly not those executions.
No SQL was executed/applied by the agent. Production matcher/UI, trusted resolver,
old connection exclusions, privacy/provenance and revision-consumption activation
gates remain unchanged; no expiry policy, Dating or downtime behavior is added.

## Canonical Friends preference UI integration — bounded source checkpoint

Approved worktree `/home/Danuu/Projects/meet-people-worktrees/reconciled-ui-baseline`,
branch `feat/reconciled-ui-baseline`, starting HEAD
`500ac9c5f2e7e497158993f357dff44cad4b0c45`; initial status clean. Parent reports
the preceding canonical Dating UI checkpoint passed 84 units, 30 browsers, both
typechecks/diff and independent final review, with actual 320px screenshot
inspection (no horizontal clipping; below-scroll actions tested reachable).
Those results establish the baseline, not execution of this Friends integration.
The earlier frontend-preview inventory in this document is superseded here.

### Resource and authority boundary

`friends-preferences-client.ts` and `useFriendsPreferences.ts` are domain-specific
counterparts of the repaired Dating/facts/Settings pattern, not a new framework.
The client captures the canonical AccountContext session token, validates strict
request/snapshot/error contracts and retains its deadline through JSON consumption.
It calls only `/api/matchmaking/friends-search-preferences`, never a legacy account,
profile or queue writer. There is no token acquisition midway through an operation,
device-storage cache, automatic PUT retry or provider/resolver request.

Mutation entry checks current render client/account/queue-busy binding, owner,
mounted layout lifetime, current phase/reconciliation capability, expected revision
and synchronous operation lock before transport. Obsolete owner/token/unmounted
callbacks cannot enter or continue writes/readback. A PUT must confirm exact values
and next revision, followed by a separate canonical GET matching both. Conflict or
uncertain/malformed/divergent save/readback closes write capability until explicit
read reconciliation; failed reload retains drafts and the gate. Same-owner token
refreshes cannot silently clear uncertainty. Owner changes reset private resource
and form state. The existing whole-route/auth-shell remount policy is unchanged:
local drafts are not promised to survive it, but a new instance still requires GET.

`FriendsPreferences.tsx` keeps resource authority mounted while the sheet is closed.
`MatchingScreen.tsx` removes only numeric/search preview persistence, not shared
profile editing. The resource occupies a stable first position in both setup and
queue-render branches, preserving its pending/reconciliation state on those
transitions. Existing preference-button queue restrictions remain; queue/account
busy state also fences the hook. No missing preference backend blocks the existing
Find Friends/setup/queue flow. No queue operation consumes the saved revision yet.

### Sheet, defaults and independent ownership

The existing MatchFilterSheet/SearchPreferenceFields and styles are reused with a
Friends-specific resource boundary alongside, not instead of, the Dating boundary.
Unknown/unavailable/malformed capability exposes no editable fake defaults or local
save. A successful `{revision:0,preferences:null}` GET establishes capability but
not chosen values. Only opening editing exposes explicitly unsaved suggested bounds
(18–35, 15 miles, no goals, unresolved home). Neither mounting nor GET saves them.
Legacy account intents, distance strings and preview values are never implicitly
copied into canonical choices. An intentional Save Friends filters action stores
the complete independent resource, including unresolved area drafts.

Age/radius use the existing integer sliders; Reset changes only age/distance.
Goals preserve exact Unicode labels, case, spacing and newlines from stored data;
exact custom choices remain selectable after uncheck. An Add goal control supports
new custom labels using the shared scalar/nonblank/length validation, exact-unique
comparison and 20-goal limit. Enter adds the goal, not an accidental form save.
Temporary area text also round-trips exactly; no trim rewrite or fake coordinates.
All payloads remain strict and exclude identity, bio, picture, DOB, home writes,
interests, weekly schedule, Dating choices and the presentation-only 1–3 count.

Close/Escape/long mobile drag discards unsaved form changes. Short/cancelled drag,
keyboard/focus restoration and native sheet scrolling remain. Pending PUT plus
canonical GET locks fields/actions/dismissal through confirmation. Explicit reload
warns it replaces the draft; it is synchronously locked against duplicates and
layout-unmount-fenced so a cancelled old reload cannot overwrite a reopened sheet.
Changed canonical revisions never silently rebase a dirty draft. Canonical action
rows wrap and long custom goal buttons wrap on narrow/short screens.

### Location honesty and matching non-activation

Unchanged selected references may be retained; changing source/label latches clear
in the form even if the user later switches back. Observed home changes are latched
in the resource while closed too, including a change to null. A loaded canonical
null home is never replaced with a stale legacy profile home. GET returns opaque references, **not resolution
receipts**, so read-only reload cannot revalidate an old home binding or clear that
latch. An explicit Clear stored location reference action allows an invalid/revoked
selection to be saved as unresolved without guessing its geometry. Only a confirmed
null-reference save clears the home-change latch. Initial stale bindings not visible
in the GET shape remain subject to existing authoritative server validation; the UI
does not claim it can independently verify usability or geography from an ID.

The sheet/status explicitly say **Saved filters are not applied to the current
queue.** Saving preferences is not a radius/age/goal query constraint, nearby
eligibility or activation claim. The production matcher has not been changed to
consume revisions. The future production adapter still needs authoritative owner
preferences/revision semantics, valid reciprocal age/radius/location evidence,
canonical discovery/eligibility/block enforcement, safe cached-score dependencies,
and all legacy direct-RPC/DML privacy/safety gates documented above. A resolver/
issuer and its own verified trust/freshness policy remain absent. No widening,
neutral invented distance, location request, background result or provider call is
introduced. Existing single-candidate/manual queue and active-over-downtime policy
remain unchanged. Global interests/week save legitimately via Find Friends, not
this numeric preference form. Dating cards/disclosure and enabled-consent read-only
behavior, Profile, Settings and downtime remain outside this slice.

### Coverage source, exact commands and execution limits

New tests cover transport contracts/actor headers, revision-zero read/no writes,
exact custom goals, reference invalidation, deadline/body consumption, duplicate
locks, CAS, uncertain/readback/partial failures, failed explicit reload, retained
callbacks, repeated token refresh, account-busy/owner transitions, late GET/save,
unmount, default provenance, pending/cancel/focus, and home changes while closed.
The client test source was authored before implementation, but its initial attempt
was **Permission denied: shell**, not an executed red result. Existing component-only
no-AccountContext tests now assert honest unavailable state rather than fallback
preview; canonical field/save behavior has focused resource render coverage.
Account/profile regressions assert only the explicit Friends resource write and
retain global/shared no-write separation. Shared profile fixtures explicitly serve
a read-only virtual Friends snapshot without manufacturing profile changes.

Shared browser fixtures add a separate synthetic Friends CAS resource with no
geocoder and no legacy-document keys. Existing reference/mixed-readiness tests use
the canonical action and expected Friends-only write; short-sheet reachability,
overflow and zero-write assertions are retained. New
`e2e/friends-preferences.spec.ts` authors 320/390/1440 and 390x420 pending/readback/
reload screenshots, unavailable, conflict/uncertainty, exact goals and drag Cancel.
All fixtures block external traffic. They are browser/screenshot SOURCE only:
no service was started, no browser executed and no new screenshot inspected here.
Parent proposed isolated command (not agent-executed):

```text
pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/friends-preferences.spec.ts e2e/account-matchmaking-readiness.spec.ts e2e/friends-light-theme.spec.ts e2e/friends-visual.spec.ts e2e/dating-preferences.spec.ts e2e/dating-reference.spec.ts
```

These actual attempts were **Permission denied: shell**; no new test/typecheck pass
is claimed:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts tests/friends-preferences-client.test.ts
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/friends-preferences-client.test.ts tests/friends-preferences-hook.test.ts tests/friends-preferences-render.test.tsx tests/find-friends.test.tsx tests/account-profile-ui.test.tsx tests/shared-user-profile.test.tsx tests/dating-ui-client.test.ts tests/dating-ui-hook.test.ts tests/dating-ui-render.test.tsx tests/match-filter-sheet.test.tsx
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
```

`git diff --check` passed during implementation; final whitespace/identity/status
checks are reported separately. No backend/shared schema/SQL/production matcher
change or DB action is included. Parent owns fresh regression execution, screenshot
inspection, independent source review and checkpoint. Broader legacy tests, full
build/lint, live API/PostgREST, resolver, matcher revision consumption, concurrency,
all-surface privacy/safety and native-device behavior remain unverified for this UI
slice. No staging/commit/push, Git mutation, environment/secret access, provider/
geocoder/network request, service/deployment, configuration/install or protected
checkout operation occurred. Downtime stays LAST and unchanged.

### Delayed-profile fixture repair and queue-transition review

Same approved worktree/branch and unchanged HEAD
`500ac9c5f2e7e497158993f357dff44cad4b0c45`; existing 24-path dirty slice retained.
Parent's first independent unit run returned **104 PASS / 1 FAIL of 105**, exit 1.
It is not a passing suite despite the preceding implementation completion report.
The failure at `tests/find-friends.test.tsx:156` expected sliders but found
`Sign in to load saved Friends filters`.

Source diagnosis is a test-boundary mismatch, not missing product actor plumbing:
the component-only harness mocked useSession but supplied no AccountContext.
`MatchingScreen` legitimately uses that session for its existing global profile/
queue adapter, whereas the new independent Friends preference resource requires
the loaded canonical account/session and its own capability GET. It correctly
withheld edit capability; falling back to a preview or a different session would
weaken the boundary. No production auth/client/hook change is needed for this failure.

The delayed-read test now opts into a synthetic matching AccountContext, using
the existing saved data/account fixture and same actor/token as useSession. Its
transport explicitly serves the Friends virtual `{revision:0,preferences:null}`
GET and asserts the request method and captured bearer header. It waits for actual
GET-backed sliders instead of mocking canWrite or bypassing capability. Other
component-only cases retain their no-context/unavailable semantics. Original delayed
read/loading, no fake empty setup, preselected Music, table and zero-write assertions
remain; exact custom-label bytes/selection, Sunday window, unchanged stored windows,
one read-only Friends GET and absence of queue/result calls are also asserted.

Adversarial source review covered all Friends transport/resource/form paths: strict
body/snapshot comparison and deadlines; synchronous current actor/account-busy entry;
token/unmount/late readback fences; explicit conflict/uncertain reconciliation;
null-home priority/latching; source/label/home reference invalidation and explicit
clear; cancellation/reload/drag; and the stable first-child resource placement in
setup versus active-queue branches. No additional concrete material product defect
was identified in this review, so production source is unchanged in this repair.
Queue-busy checks fence new preference writes; already-issued independent preference
operations may settle while queue state changes. No transactional exclusion of all
external queue joins is claimed or needed to represent saved, unconsumed preferences.

A new integration regression models an uncertain filter write, closes the sheet,
then performs separate explicit Find Friends and Cancel search actions. It requires
the preference reconciliation gate and original capability GET to survive both
queue render transitions, allows reopening for read-only reconciliation, and checks
exactly one preference PUT plus the deliberate queue POST/DELETE, with no shared
profile/account resave. This is deterministic offline regression SOURCE, not
multi-session SQL/queue concurrency evidence or proof that filters affect matching.

Required commands below were all actually attempted and returned **Permission
denied: shell**. No repaired test, typecheck, browser run or screenshot pass is claimed:

```text
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/find-friends.test.tsx
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/friends-preferences-client.test.ts tests/friends-preferences-hook.test.ts tests/friends-preferences-render.test.tsx tests/find-friends.test.tsx tests/account-profile-ui.test.tsx tests/shared-user-profile.test.tsx tests/dating-ui-client.test.ts tests/dating-ui-hook.test.ts tests/dating-ui-render.test.tsx tests/match-filter-sheet.test.tsx
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/friends-preferences.spec.ts e2e/account-matchmaking-readiness.spec.ts e2e/friends-visual.spec.ts e2e/friends-light-theme.spec.ts e2e/dating-preferences.spec.ts e2e/dating-reference.spec.ts
```

The new browser spec name was confirmed as `e2e/friends-preferences.spec.ts`.
`git diff --check` passed after the test repair; final checks/status are reported
in completion. Parent owns actual reruns, independent review and checkpoint.
No local test/browser process was started by the denied commands, no source outside
the existing slice was changed, and no Git mutation, production environment/secret
access, provider/network/DB action, config/install/service/deployment change occurred.
Saved filters still are not consumed by production matching. Dating's prototype
disclosure/cards, global Profile/Settings and downtime behavior remain unchanged.

### Theme-suite Dating capability fixture repair

Same session/worktree/branch, HEAD `500ac9c5f2e7e497158993f357dff44cad4b0c45`;
existing 24-path dirty slice preserved. Parent now reports **106 units / ten files,
both typechecks and diff PASS** after the delayed-profile fixture repair. The broad
browser run returned **59 PASS / 5 FAIL of 64**; all nine new canonical Friends
browser scenarios passed. These are parent-reported results, not a full browser
pass or results for the subsequent fixture edit below.

All five failures were the theme test at
`e2e/friends-light-theme.spec.ts:94`, widths 320/390/800/801/1440. It navigated to
Dating and expected Minimum age 23, but its `mockMatchingApi()` fixture implements
Friends preferences and generic queue responses, not a Dating aggregate. A GET to
`/api/matchmaking/dating-preferences` therefore fell through to `{mode}`. The real
Dating client correctly rejected that malformed capability and exposed no sliders.
This is not a Friends form, Dating mapper, palette or auth-plumbing regression.
Even a valid revision-zero/null-search Dating GET would not establish age 23:
the canonical mapper presents explicitly unsaved 18–99 bounds for absent search.
Product defaults must not be changed to satisfy an obsolete preview assumption.

The repair is scoped to the five affected theme cases: a schema-validated synthetic
Dating owner snapshot with both revisions 1, explicitly stored search ages 23–30,
radius 15, unresolved home, empty disabled profile and dated synthetic eligibility.
Its route permits only GET and asserts the existing fixture actor's bearer header.
No auth/session gate, product capability, default or generic fixture behavior is
altered. No activation/resolver or fake live result is introduced.

Existing palette/color/contrast, shell-chrome, 23-year Dating bound and overflow
assertions remain. Added checks verify Friends ages 18–35 both before and after
Dating's 23–30, require an actual Dating GET, and reject all API mutations and
external requests during this read-only interaction test. This models distinct
resources and explicit stored choices rather than aliases or editable fallback UI.

Independent Friends source review again checked captured-token/strict transport,
current render/account-busy authority and layout-unmount fencing, CAS plus separate
GET/readback uncertainty, explicit reload/cancellation and stable queue-transition
placement, exact goals and nullable-home/reference invalidation. No additional
concrete material product defect was identified; production source is untouched
in this bounded repair. Production filter-revision consumption remains unwired.

Actual attempted commands below all returned **Permission denied: shell**, so no
new repaired unit/typecheck/browser pass or screenshot inspection is claimed:

```text
pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/friends-light-theme.spec.ts
pnpm --config.verify-deps-before-run=false exec vitest run --configLoader runner --config vite.isolated.config.ts --environment jsdom tests/friends-preferences-client.test.ts tests/friends-preferences-hook.test.ts tests/friends-preferences-render.test.tsx tests/find-friends.test.tsx tests/account-profile-ui.test.tsx tests/shared-user-profile.test.tsx tests/dating-ui-client.test.ts tests/dating-ui-hook.test.ts tests/dating-ui-render.test.tsx tests/match-filter-sheet.test.tsx
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false exec tsc --project tsconfig.api.json --noEmit
pnpm --config.verify-deps-before-run=false test:e2e --config worktree/friends-light-review/playwright.config.ts e2e/friends-preferences.spec.ts e2e/account-matchmaking-readiness.spec.ts e2e/friends-visual.spec.ts e2e/friends-light-theme.spec.ts e2e/dating-preferences.spec.ts e2e/dating-reference.spec.ts
```

`git diff --check` passed after the fixture repair. Parent owns rerun, screenshots,
independent review and checkpoint. No denied command started a local process; no
production/backend/schema/DB change, provider/network request, secret/environment
access, service/deployment/config/install change or Git mutation occurred. Exact
Dating disclosure/cards and downtime remain unchanged.
