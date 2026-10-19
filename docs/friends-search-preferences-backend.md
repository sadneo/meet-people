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
