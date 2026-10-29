# Queue-first active Friends matching

Backend only; Messages frontend hookup and hosted rollout are separate. No app
DB or hosted configuration was changed. The SQL was executed in fresh isolated
PostgreSQL/PostGIS instances with synthetic Auth accounts and no provider access.

## Product behavior

- Explicit manual participation, 18+, independent of global/passive Friends and
  Dating discovery switches. Existing chats do not depend on discovery consent.
- “You + N” is an ideal. Join specifies an acceptable minimum/maximum total size;
  defaults are two through the preferred total. Hard limits never widen with time.
- Oldest eligible queue unit first. Interests and friendship goals are soft
  preferences, not exact-match requirements. No compatibility threshold or shared
  activity-theme requirement. Existing friendships do not prohibit voluntarily
  joining the same group, and formation does not create direct connections.
- Try the ideal size for a configurable 30 seconds, then offer feasible smaller
  rosters within everybody's declared size bounds. This is a preference grace,
  not a guarantee of a match within 30 seconds. Scarce users, hard constraints,
  scheduling cadence and consent can still mean waiting.
- Every person accepts the exact proposed roster. A smaller replacement has a new
  proposal ID and resets **everyone**, including its initiator, to pending. A
  participant must accept the original before proposing a smaller subset.
- A group forms atomically only after all remaining members accept. No automatic
  partial formation, invented responses, system greetings or romantic matches.
- Ready-up authorizes search, not an unknown future roster. All current group
  members must ready up before the group queues as a unit. Newcomers must opt
  into existing groups; all proposed members then confirm the final roster.
- Growth keeps the same conversation. Newcomers see messages from their join
  sequence onward. Existing members retain history. Future capacity respects
  every member's accepted maximum, including newcomers with lower limits.

## Implementation

`api/matching/active-search.ts` uses a FIFO greedy pass followed by a bounded beam
search: at most 50 units, 100 people, nine final members, beam width eight and 512
expansions. Peer waiting bands are compared before soft fit; within a 30-second
waiting band, size fit contributes 60% and average pair compatibility 40%.
Pair compatibility reuses Friends' interests/availability/goals/distance signals.
The oldest feasible seed is never replaced merely for a higher compatibility score.
An unsuccessful lease is released with a five-second retry delay so one infeasible
seed does not monopolize processing. Original `queued_at` remains unchanged.

Postgres applies indexed geographic prefiltering and authoritative current checks:
real active adult accounts, canonical profile readiness, saved strict bilateral
age/radius preferences, trusted unexpired Friends anchors, no blocked pairs,
acceptable group sizes, one common continuous window of at least 60 minutes, and
a verified general meeting area within everyone's radius. Whole-group interval
intersection is required; pairwise overlap is insufficient. No inferred location,
sexuality filter, interest threshold, bio analysis, provider scorer or popularity
boost participates. The spherical TypeScript shortlist is conservative; PostGIS
rechecks before reservation and formation.

Private pool RPCs are service-role-only. Actor RPCs derive identity from the JWT.
One occupancy primary key prevents double assignment. Sorted row/pair locks,
leases, immutable proposals and transactional rechecks protect reservations,
blocks, roster changes and final acceptance. Proposal members retain immutable
opaque IDs even if an account is deleted, preventing accidental roster shrinkage.

Public responses omit birthdates, coordinates, raw schedules, private goals and
scores. A common availability window is shown only when every participant permits
availability summaries. Proposal avatars currently remain null; photo presentation
is deferred with frontend hookup. The meeting area is general, not a booked venue
or a confirmed meetup plan.

## Lifecycle and recovery

- Queue/reservation states: queued, reserved, accepted, formed, cancelled,
  declined and expired. `lastOutcome` explains requeue after a closed proposal.
- Review starts at five minutes. Late acceptance cannot revive an expired offer.
  Accepted members keep their original priority; nonresponders become expired
  and release their slot, preventing repeated automatic offers to offline users.
  Expiry is never recorded as an explicit decline.
- A decline/cancel closes the proposal and releases unaffected participants back
  to the queue without resetting their priority. Infrastructure failure preserves
  priority; uncertain reservation writes are reconciled, never resubmitted.
- Smaller rosters need fresh acceptance from all. Leaving/unreadying cancels
  growth and invalidates its proposal, preserving the existing chat and releasing
  newcomers. Current profile/filter/block changes are revalidated at commit.
- Blocks suppress that sender's group messages and metadata rather than evicting
  people automatically. Explicit leave revokes group access. Current under-18,
  suspended/inactive/anonymous accounts cannot access or send in these groups.
- Commands require actor-scoped request UUIDs; reusing one with different content
  conflicts. Replay returns fresh authorized status, not a cached private roster.
  Messages retain their request ID across retries; changed content/chat conflicts.
- Operational command/proposal/finished-unit metadata expires after 30 days.
  This cleanup does not delete groups or message history. Existing account
  deletion/export policy must include these new group tables before public rollout;
  automatic account deletion/export is not implemented here.

## API

All routes below are under `/api/matchmaking/active-friends`, use a bearer token,
reject extra fields, and return no-store responses. Command responses are current
status: `enabled`, `state`, `entryId`, `queuedAt`, owner `choices`, `lastOutcome`,
nullable `proposal` and nullable `groupId`.

| Method/path | Input |
| --- | --- |
| GET `/status` | none |
| POST `/queue` | requestId, preferredNewFriends (1–8), optional minimumGroupSize (default 2), maximumGroupSize (default preferred + 1), allowExistingGroups (default false) |
| DELETE `/queue` | requestId |
| POST `/check` | empty object; runs one bounded cycle, then reads own status |
| POST `/proposals/:id/accept` | requestId |
| POST `/proposals/:id/decline` | requestId |
| POST `/proposals/:id/smaller` | requestId, exact memberIds subset including caller |
| GET `/groups` | none; at most 100 current memberships |
| GET `/groups/:id` | none |
| POST `/groups/:id/ready` | requestId, ready |
| POST `/groups/:id/cancel-growth` | requestId |
| POST `/groups/:id/leave` | requestId |
| POST `/groups/:id/rename` | requestId, name |
| GET `/groups/:id/messages` | optional `before` cursor |
| POST `/groups/:id/messages` | body, clientRequestId |
| POST `/groups/:id/read` | seq |

Group documents include `kind: friends_group`, name, capacity, participants,
readiness, creation time, safe latest message and per-owner unread count. History
returns messages and nextCursor. Send/read reuse the existing message/read schemas.
The Messages frontend combines this group source with the legacy
`/api/conversations` inbox and uses the group-specific history endpoints.
See [local demo instructions](matchmaking-demo.md) for queue population and removal.

## Configuration and rollout

| Setting | Default | Location |
| --- | --- | --- |
| API matching gate | false | ACTIVE_FRIENDS_ENABLED |
| Database matching gate | false | active_friends_private.policy.enabled |
| Preferred-size grace | 30 seconds | policy.preferred_grace_seconds |
| Proposal review | 300 seconds | policy.review_seconds |
| Common continuous time | 60 minutes | policy.minimum_minutes |
| Availability horizon | 14 days | shared matching schedule functions |
| Worker lease | 30 seconds | SQL claim function |
| No-result retry delay | 5 seconds | SQL finish function |
| Scheduled batch | 10 cycles / soft 20-second budget | active-config.ts |
| Algorithm | active-friends-fifo-v1 | version checked between worker and SQL; recorded on proposals |

Apply `20261028000300_active_friends.sql` after the reviewed product reconciliation
and preceding matching migrations. Both API and DB gates start disabled. Verify
in sandbox, configure scheduled processing, then enable both deliberately. Arrivals,
ready-up and manual checks trigger immediate bounded processing. Run
`pnpm matchmaking:active:once` as a scheduled existing-infrastructure job for idle
queue progress; a once-per-minute fallback may add up to a minute plus scheduling
latency. Increase cadence/batch capacity only after measurements. The migration
registers one-minute expiry/retention maintenance if pg_cron is already installed;
otherwise schedule the worker externally. No service or scheduler was deployed.

Rollback: disable both matching gates. Cancel/decline/leave, group reads and chat
remain available; do not drop group/message tables or restore prior consents.

## Verification

```sh
pnpm exec vitest run tests/unit/active-friends-search.test.ts tests/unit/active-friends-api.test.ts
python tests/integration/offline/run-matching-sql.py --pg-bin /path/to/postgresql/bin
pnpm exec tsx scripts/benchmark-active-friends.ts
```

The SQL runner creates a fresh database/cluster, separate Linux user/network
namespace, and Unix socket only. It accepts a local binary path, never an app URL
or credentials. It installs actual repository SQL and real PostGIS, with explicitly
synthetic Auth and a failing offline provider boundary, and destroys its cluster
on exit. Existing Dating/Friends SQL acceptance also runs. Observed two-session
blocking covers double enrollment, repeated reservation, and both orderings of
block versus acceptance. Lifecycle coverage includes smaller-roster reconsent,
expiry, ready-up withdrawal, membership changes, history boundaries, capacity,
message retry and retention. This does not prove hosted Supabase Auth/PostgREST,
real devices, production capacity or scheduler delivery.

Initial local CPU benchmark: 10,000 synthetic source profiles, 50 searches of
50-unit pools with 14 availability intervals/person, concurrency 1; p50 25.5 ms,
p95 26.8 ms. SQL acceptance uses 20 synthetic accounts and observed concurrency 2;
nine-person acceptance RPCs measured about 200 ms median, including a local psql
process. Host: Intel Core Ultra X7 358H, 16 logical CPUs, 31 GiB RAM, Node v26.12.1,
PostgreSQL 18.6, PostGIS 3.6. These are bounded local checks, not an HTTP load test
or a guaranteed wait-time/operating-cost estimate. Zero matching provider calls.
