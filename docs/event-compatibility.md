# Imported-listing event compatibility (source only)

**Legacy source/API compatibility:** event detail and wide preview now mount
`EventGroupQueue` instead; see [event-group-queue.md](event-group-queue.md).
The unmounted `EventCompatibility` and Company components remain available for
compatibility and standalone tests. The existing Company API, Company interest, group
formation and ingestion remain unchanged. Company interest/group membership does
**not** grant compatibility consent. Compatibility never creates groups,
invitations, connections or chats. Suggestions are not confirmed plans.

The panel uses the real Supabase session and the existing public-key/user-JWT
transport. Loading and refreshing read status/profile only. Opt-in and withdrawal
do not score. Only **Check event compatibility**, after a saved matching profile
and explicit matching opt-in, requests scoring. This legacy panel has no matching
timers, background workers or notifications; the new queue/inbox is a separate
contract and does not reuse either old consent.

## Fixed HTTP and proposed parent RPC contract

All routes are authenticated beneath `/api/matchmaking/events/:listingId`.
`listingId` is the imported `public.listings.id` UUID, **not** a Winso meetup bigint.
No actor ID, note, host ID, meetup ID or arbitrary RPC name is accepted. Query
parameters are rejected; request bodies are absent or exactly `{}` (JSON null and
extra keys are invalid). Responses are no-store.

| HTTP | Fixed wrapper RPC |
| --- | --- |
| GET `/status` | `get_listing_matchmaking_status(listing_id_in uuid) returns jsonb` |
| POST `/interest`, `{}` | `express_listing_matchmaking_interest(listing_id_in uuid) returns jsonb` |
| DELETE `/interest` | `withdraw_listing_matchmaking_interest(listing_id_in uuid) returns jsonb` |
| GET `/matches` | `get_listing_event_matches(listing_id_in uuid) returns table (...)` |

The first three wrappers return exactly the JSON object:
`{"isInterested":false,"available":true}` (two required booleans, no row array).
`isInterested` is the caller's separate compatibility opt-in. Status is read-only:
no bridge creation, authoritative-field synchronization, interest or scoring.
An existing valid listing without a bridge has `isInterested:false`; availability
still reflects authoritative listing validity, not the mere existence of a bridge.
Expired/cancelled listings return `available:false`, retaining existing consent
until withdrawn. Missing listings raise `PT404`.

Matches retain the original Winso `get_event_matches(meetup_id_in bigint)` columns:

```sql
returns table (
  profile_id uuid, username text, display_name text, avatar_url text,
  bio text, note text, shared_interests text[], match_score numeric
)
```

The wrapper must preserve Winso order/ranking and filters unchanged. Express
validates only the consumed columns and returns
`{"candidates":[{"id":"UUID","name":"Taylor","avatar":null,"interests":["Music"]}]}`.
Names/shared labels use the shared profile display limits; avatars are nullable
and follow the shared restricted HTTPS URL policy. Scores, notes, bios, usernames
and all other raw fields are discarded. `[]` is genuine empty; SQL null or invalid
consumed columns are 502 errors, never synthetic empty success.

Errors use existing bounded `{code,error}` responses:
- 400 invalid listing UUID/request fields.
- 401 invalid JWT or SQLSTATE `28000` (identity must be `auth.uid()` only).
- 404 `PT404`, missing listing.
- 409 `PT409`, missing saved profile, missing opt-in or unavailable event.
- 502 malformed wrapper data.
- 503 `PGRST202`/`42883`, absent wrapper; other provider/runtime failures also 503.

Express checks the saved profile before opt-in/scoring and reads status before
scoring. SQL **must independently enforce every prerequisite** to protect direct
RPC calls and races. Withdrawal requires neither a profile nor a live event.
Frontend results are invalidated on withdrawal (including failed writes), refresh,
event change and session-token change. Failed mutations reconcile consent with a
read-only status call without claiming synthetic success.

## Additive bridge implementation (authored; not activated)

The parent must separately implement all four wrappers and an idempotent,
one-listing-to-one-meetup bridge. Use a unique listing mapping and transactional
locking/upsert so concurrent opt-ins cannot create duplicate meetups or links.
Bind actor identity only to `auth.uid()`, reject null identity with `28000`, revoke
PUBLIC/anon execution and grant authenticated execution only. Pin safe search
paths and qualify tables/helpers; any unavoidable legacy public-name lookup must
fail closed when anon/authenticated can CREATE shadow objects there.

Only write wrappers may create/synchronize the bridge. Synchronize authoritative
listing title, description, category, source location/coordinates and actual
start/end instants; preserve absent values as absent. Do not infer travel times,
dates or coordinates. Do not fabricate a host identity from the actor, a service
account or fixtures; use a genuinely optional host or an explicitly authorized
real mapping. If required source/host data cannot be represented safely, reject
opt-in rather than inventing it. Do not overwrite unrelated user-hosted meetups,
delete/retrofit historical records or change ingestion.

Validate current authoritative listing state and dates for opt-in **and scoring**:
active, not cancelled/expired, with an actual supported future start instant.
Read scoring must not synchronize or insert a bridge. If no valid bridge/consent
exists, reject with `PT409`; never silently create consent from Company records.
Synchronize bridge fields atomically on writes only, and allow withdrawal even
after expiry/cancellation without first requiring valid scheduling fields. Remove
only the actor's matching interest, not Company records, groups, other actors'
interests or existing notes/embeddings. Repeated opt-in/withdrawal must be safe and
idempotent. Serialize listing writes and enforce actor-owned interest consistency.

Delegate compatibility selection to unchanged Winso `get_event_matches`; preserve
its blocking/connection/activity filters and score ordering. No replacement
algorithm, forced groups, extra scoring on writes or provider bypass belongs here.
Existing scoring may invoke Gemini; activation/testing with real providers remains
separate and Gemini was not enabled or called for this source work.

## Evidence and remaining blocker

`tests/matchmaking-contracts.test.ts` uses the Express router in memory and the
real SDK with injected mock fetch. `tests/event-compatibility.test.tsx` uses fixed
test-only session/API mocks, including delayed results. `e2e/event-compatibility.spec.ts`
intercepts browser modules/API responses and verifies Company independence,
manual empty/ranked results, prerequisite failures and the detail/preview mounts.
These are **mocked source tests**, not SQL, live-JWT or provider evidence.

The wrappers and bridge are authored but not activated in the running database. This panel is not complete
live event-matchmaking E2E; missing wrappers fail honestly with 503. Parent bridge
authorization, concurrency, ownership, expiry/cancellation and no-provider SQL
tests are required before any separately authorized runtime activation.


## Disposable SQL evidence

All13 source migrations applied to a fresh disposable DB. SQL test observed absent-RPC RED then GREEN: status, idempotent links, null host, genuine singleton Winso empty result, other-user consent isolation, stale-field rejection/resync, cancelled join rejection/withdrawal, identity and privilege guards. Provider helper raises inside test transaction; no fake populated scoring. Two concurrent authenticated SQL sessions created one link/meetup and two interests. Disposable DBs removed. No live HTTP JWT or Gemini result proof.

Mapped meetups have NULL host_id; existing listings UI stays browse authority. Winso host-inner-join browse does not list these imports. No backfill/auto ingestion trigger/group migration. Listing deletion cascades its link only, leaving imported meetup and interests: lifecycle cleanup requires separately approved policy.

Activation is separate. Source rollback drops four wrappers then mapping table with RESTRICT; never implicitly delete linked meetups or Company records.
