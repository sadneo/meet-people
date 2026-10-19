# Active Friends nearby-first integration candidate

Install `active-nearby-migration.sql` after privacy containment, the corrected social
candidate, Friends preferences, detailed settings and trusted location issuance.
This reinstates the withheld `get_queue_match()` using the existing wire signature;
privacy withdrawal and this replacement must roll out together. It is not applied
to the app database. Existing UI disclosures remain until installed capabilities
are verified; no live nearby matching is claimed by this source checkpoint.

Active join requires actual persisted canonical onboarding facts, global and
Friends discovery, explicit independent Friends filters and a current owner-bound
location. Valid legacy facts need no stored completion marker. Location text alone
never establishes proximity. Both participants must be actively queued, current
adults satisfying each other's age and radius bounds, discoverable, and not blocked
in either direction. Temporary areas and home remain separate. Current catalogue,
proof expiry, home binding and device opt-out are rechecked by the trusted helper.

Ranking uses great-circle miles between chosen anchors, nearest first. Normalized
shared custom interest count and exact shared campus-wall-time seconds break equal
distance ties, then UUID. There is no minimum shared-interest or schedule threshold.
There is no cached friend-score store available here; the optional legacy score is
neutral/absent, and no synchronous embedding/provider/scorer is invoked. Friendship
goals remain exact stored intent, without invented goal compatibility weights.
Shared interests and weekly availability remain Profile/Friends global data.

Each manual read returns at most one actual candidate. It creates no connection,
message, group, readiness, reward, completed match or queue removal. No fabricated
Events suggestion or exact weekly schedule is projected. No roster count leaks.
Downtime enrollment/active priority are retained, but downtime result reads explicitly
return unavailable pending product lifecycle decisions. Dating queue remains denied.

The initial rank uses the request's database snapshot. The selected pair then takes
the existing ordered block/contact fence and profile/settings/queue/reference/proof/
catalogue/preference SHARE locks. Eligibility is re-evaluated using a fresh READ
COMMITTED snapshot after waits. An excluded or cancelled candidate yields no row;
the caller can manually check again. This does not promise a continuously current
ranking of every concurrent queue change. Higher isolation is rejected; database
lock/deadlock failures stay unavailable, never a claimed completed result.

## Actual bounded verification

- `tests/active-nearby.sql`: real rollback acceptance with four synthetic queued
  accounts and synthetic catalogue. Covers zero soft-signal eligibility, strict
  nearby priority, normalized custom labels, schedule/UUID tie-breakers, bilateral
  filters, reverse blocks, current consent/location withdrawal, no-result, cancel,
  active-over-downtime priority, denied Dating, private helpers and no match writes.
- `pnpm --config.verify-deps-before-run=false exec tsx tests/offline/active-nearby-api.ts`:
  actual Express -> actual SQL persisted join/status/manual result/canonical filter
  CAS/readback/cancel/priority/revocation and unavailable downtime flow. Synthetic
  verifier only, not live JWT, PostgREST or frontend-to-live-service proof.
- `python3 tests/offline/active-nearby-races.py`: 24 real two-session cases,
  observed `pg_blocking_pids` waits, both orderings and winner commit/rollback for
  result vs reverse block, actor/candidate cancellation, discovery withdrawal,
  reciprocal filter change and catalogue revocation. Earlier exclusion never
  returns that peer; a read that wins the fence may return its pre-change candidate.
- API contract and pure policy tests execute separately; they are not substituted
  for the above real SQL/concurrency checks.

- `pnpm --config.verify-deps-before-run=false exec tsx tests/offline/account-active-flow.ts`:
  actual four-chapter account API onboarding/readback, invalid edit rollback,
  location issuance and real queued result, then shared interest/week edits through
  the canonical compatibility writer immediately reflected in the next manual
  result. Fresh chronological upstream account/identity/reconciliation replay
  (reconciliation twice) passed before the sprint candidates. Core/Auth is synthetic;
  HTTP/embedding/provider extensions and full provider migration history are absent.
  The first flow assertion expected input interest order; canonical readback sorts
  interests. Corrected that fixture expectation and reran successfully.

Remaining gates: full frontend/API/SQL flow; broader Events/group/worker/notification safety; secure picture lifecycle;
real reviewed place catalogue and coordinate retention policy; explicit app schema
activation and live Auth/PostgREST acceptance. Downtime lifecycle remains deferred.
