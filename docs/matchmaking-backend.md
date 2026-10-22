# Active and downtime backend wiring

Imported-event compatibility is a separate source-only panel and wrapper contract:
see [event-compatibility.md](event-compatibility.md). Company groups remain separate.

## Source-slice boundary

`/matchmaking` and `/downtime-matchmaking` now use real Supabase sessions,
Express endpoints and fixed Supabase RPC names. No fixture, local queue flag,
demo login or replacement matcher is used by these routes. The rest of the
Home/economy, onboarding, free-time/planning and social prototype remains a
separate local preview; its records are not matching-profile persistence.
`/login` and `/register` use the reusable email-link sign-in form, not demo
account creation. Configure Supabase redirect URLs for those routes and the
matching routes before enabling email links.

The shell and Settings sign out through Supabase `auth.signOut()`; existing
auth notifications clear the session. Failure stays on the current route with
a retry error, not a success message. Guests see a sign-in link rather than
a fake demo logout.

Profile interests use individual label fields, preserving internal line breaks
on unrelated edits. Starting a profile save clears both displayed and in-flight
candidates; it never automatically starts another scoring lookup.

This change does **not** activate SQL, call providers, provision credentials,
or prove real SQL matching. Tests use mocked providers or mocked browser APIs.
There are no invitations, groups, accepted connections, chat writes or
notifications in this slice.

## Configuration and actor identity

API configuration: `SUPABASE_URL`, optional `SUPABASE_PUBLISHABLE_KEY`, optional
existing `SUPABASE_SERVICE_ROLE_KEY`. At least one key must accompany a URL.
The matching transport specifically requires the public key: an
`sb_publishable_…` key or legacy JWT with `role: anon`. Secret/service-role
keys are rejected for this field, including at transport construction.
Environment errors report field names and fixed validation messages, not
input values. Missing matching configuration returns 503, even when the
unrelated events service has a configured service key.

Browser configuration continues to use `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. `useSession` gates matching; the client sends
the current session's access token. Every API route verifies the Bearer
token with `auth.getUser(token)` and validates its UUID identity. The existing
service key may initialize **only the verifier**. A distinct per-request
actor client uses the public `apikey` and that same user JWT in
`Authorization: Bearer …`. No actor/user ID is accepted from the request.
There is no arbitrary RPC-name routing and no token/provider error logging.
All matching responses are `Cache-Control: no-store`.

## HTTP/RPC mappings

All endpoints below are under `/api/matchmaking` and authenticated.

| HTTP | Fixed RPC and response |
| --- | --- |
| POST `/queue`, `{ "mode": "active" }` | `join_queue(qtype => 'matchmaking')`, then status |
| POST `/queue`, `{ "mode": "downtime" }` | `join_queue(qtype => 'downtime')`, then status |
| DELETE `/queue` | `leave_queue()`, then status |
| GET `/status` | `get_queue_status()` -> `{ mode: 'active' | 'downtime' | null }`; discard `others_in_my_queue` |
| GET `/result` | Check status, then actual `get_queue_match()`; no local scoring |
| GET `/profile` | Proposed `get_matchmaking_profile()` -> `{ profile: object | null }` |
| PUT `/profile`, profile object | Proposed `save_matchmaking_profile(profile_in => object)` -> `{ profile: persistedObject }` |

One user has one queue. Switching modes replaces it via the existing join RPC.
A dating queue is outside this slice and returns 409 unavailable, not a fake
idle status. A result request while not queued returns 409. SQL returning `[]`
is genuine empty (`{ candidate: null }`); `null`, multiple rows, invalid consumed
columns or an unexpected queue kind return 502 malformed, never fabricated data.

Result projection is exactly `candidate: { id, name, avatar, interests,
overlap, mode, meetup }`. It consumes the actual `match_profile_id`,
`match_display_name`, `match_avatar_url`, `shared_interests`, `overlap_minutes`,
`queue_kind`, `event_id`, `event_title`, `event_location`, `event_starts_at`
columns. URLs must be HTTPS. Overlap is `none` for zero minutes, `some` for
1–119, `extended` for >=120. Meetup is null when `event_id` is null, otherwise
`{ id, title: string|null, location: string|null, startsAt: ISO|null }`.
Only consumed raw columns are validated; unconsumed SQL fields are discarded.
No scores, bios, usernames, birthdates, coordinates, shared windows, full
schedules, host identities or event descriptions are exposed in a candidate.

The original Winso algorithm remains unchanged in
`20260925000005_queue_and_matching.sql`: interest .35, profile embedding .15,
distance .15, mutual connections .10, activity .05, reliability .10,
collaborative fit .10. Downtime sorts by availability overlap first, then
friendship score. Active matching uses that score and may suggest a public
meetup. This is one person, not a group of 3–5. Zero overlap does not exclude
a downtime candidate. Area text, places and travel preferences do not enforce
hard matching constraints.

No automatic result requests occur on mount, timers, joining, navigation or
status refresh. `profile_embedding` and `meetup_embedding` call Gemini via
`get_gemini_embedding` in `20260925000002_embeddings.sql`; repeated result
lookups can repeat provider work. Only **Check for a match** requests a result.

Errors have `{ code, error }` with bounded, fixed text: 400 invalid requests,
401 invalid/expired identity, 409 unavailable queue, 502 malformed provider
data, 503 missing configuration/RPC or provider failures. Missing RPC codes
`PGRST202`/`42883` produce 503 unavailable. SQL errors are not sent verbatim.
Cancellation errors keep the last confirmed status and reconcile using status;
the UI never silently claims it left. Request generations suppress responses
after cancellation, refresh, unmount or a changed session token.

## Atomic profile SQL integration (source implemented; not activated)

Migration 20261008220000_matchmaking_profile_rpcs.sql adds these functions over existing tables:

```sql
get_matchmaking_profile() returns jsonb
save_matchmaking_profile(profile_in jsonb) returns jsonb
```

Both functions must bind identity **only** to `auth.uid()`; reject null identity
with SQLSTATE `28000`. Grant execution only to `authenticated`, revoke PUBLIC
and anon execution. If SECURITY DEFINER is used, pin a safe search_path and
qualify all table references. Never accept a profile ID or privileged actor
argument. The getter must read only that actor's profiles/user_interests/
availability rows in one statement/snapshot, return JSON null for a missing
profile, and otherwise return exactly this shape (not a table/row array):

```json
{
  "username": "student-handle",
  "display_name": "Student name",
  "bio": null,
  "birthdate": null,
  "location_city": null,
  "avatar_url": null,
  "interests": ["Coffee"],
  "availability": [
    { "dow": 1, "start_time": "17:00:00", "end_time": "21:00:00" }
  ]
}
```

Use exactly the shared Zod contract: trimmed username 1–80 characters, display
name 1–120, optional bio <=1000, optional actual ISO date birthdate, optional
city <=120, optional HTTPS avatar URL <=2048; distinct nonempty trimmed
interest labels <=120 characters each, <=30 labels; <=56 same-day windows,
integer dow 0–6, canonical `HH:MM:SS` values, start strictly less than end,
no overlapping or duplicate windows on a day. All object keys are allowlisted;
nullable keys are required. Empty interests/windows arrays intentionally clear
those actor-owned records. Validate the entire payload before writes and again
inside SQL so direct RPC clients cannot evade validation. Preserve canonical
ordering (interest text; availability dow/start/end) in returned snapshots.

The save must be **one transaction**, serialized per `auth.uid()` (e.g.
transaction-scoped advisory lock), including creation/upsert of profiles and
interest/availability reconciliation. Username uniqueness conflicts and every
constraint/profile-write failure must abort all changes. Optional interest
embedding failure now preserves the label with a null embedding; see
`20261013121000_optional_interest_enrichment.sql` and `docs/accounts.md`.
Only update the
listed profile columns plus updated_at; preserve coordinates, active flag,
last_seen_at, created_at and other unowned fields. Reconcile unchanged interest
rows without delete/reinsert or updates to text, preserving embeddings and
avoiding unnecessary embedding triggers; remove absent actor-owned interests
and insert new labels using the existing trigger. Reconcile availability only
for the actor. Return the persisted canonical snapshot in the same transaction.
Never return synthetic profile-save success. There is no Express multi-table
write fallback. Apply the checked-in migrations to activate these functions;
missing live RPCs return 503. The app-wide account flow extends these RPCs
with private settings and onboarding progress; see `docs/accounts.md`.

### Timezone and midnight

Existing availability is `time without time zone`, recurring `dow` 0=Sunday
through 6=Saturday, with `start_time < end_time`. It has no per-user timezone
column and the algorithm compares equal dow directly. This UI explicitly uses
the **America/New_York campus wall-time convention**; it does not translate
windows to UTC or pretend SQL enforces timezone agreement. Users outside this
convention must enter campus times. DST is recurring wall time, not a promise
about a particular instant. Meetup timestamps remain timestamptz/ISO instants
and display in the viewer's browser timezone.

Old preview blocks correspond to morning 08:00:00–12:00:00, afternoon
12:00:00–17:00:00, evening 17:00:00–21:00:00, late
21:00:00–24:00:00 on the **selected day**. PostgreSQL time supports 24:00:00;
do not rewrite the late end as same-day 00:00:00 (invalid) or 23:59:59 (lossy).
A true overnight window such as Saturday 21:00–Sunday 01:00 must be entered
as Saturday 21:00:00–24:00:00 and Sunday 00:00:00–01:00:00. Keep end-exclusive
semantics, including adjacent windows. No existing local-preview data is
silently migrated to the real profile. The new editor accepts exact windows.
No age-to-birthdate conversion or area-to-coordinate/travel-time inference
occurs. Places/distance controls are clearly labelled device-only display
fields, separately saved under `pebble.matchmaking-display-preferences`, with
empty initial selections and honest storage error messages. They never enter
the profile-save payload, candidate filters or actor RPCs. Local prototype
fields elsewhere also remain display-only.

## Verification and remaining activation work

Run `pnpm verify`, `pnpm test:unit`, and `pnpm test:browser`.
Focused suites: `tests/matchmaking-contracts.test.ts` exercises the actual
Express router in memory (no listening service) and the real SDK transport
with injected mock fetch;
`tests/matchmaking-integrated.test.tsx` and `tests/downtime-matchmaking.test.tsx`
exercise routed components, including lossless interest edits and results
arriving during/after saves. `tests/logout.test.tsx` covers both logout entry
points, notification-driven session clearing and failures. Malformed avatar
validation is covered as HTTP 400 for requests and 502 for raw results.
`e2e/matchmaking.spec.ts` intercepts the Supabase
module and HTTP responses **only in the browser test**. No production test
switch or fixture path exists. These are not SQL/provider execution tests.

Parent activation still needs the two profile RPCs, compatible JSON shape,
function privilege/search-path review, embedding endpoint/key configuration
(baseline contains a placeholder anon key and local endpoint), and DB-backed
transaction/isolation/auth tests. Existing triggers may call Gemini on new
interests. Provider activation, migrations and those live tests are deliberately
outside this source slice.


## Disposable SQL validation

`tests/matchmaking-profile.sql` uses BEGIN/ROLLBACK in a disposable database with
only Auth schema definitions copied (no user/session rows), all 12 migrations and
no production seeds. Test-only get_gemini_embedding raises on invocation instead of
sending HTTP, proving rollback, not provider readiness. An existing synthetic vector
is inserted with the trigger temporarily disabled for fixture setup, then enabled.
The production migration never disables or replaces the trigger.

Checks cover missing identity/profile, ownership, strict keys/types, invalid dates,
overlap/adjacent/midnight windows, normalized duplicate labels, username conflicts,
unchanged multiline interest/embedding preservation, protected profile columns,
embedding-failure rollback, anonymous execute denial and unsafe schema rejection.
A separate two-session probe verified same-user save serialization.

Winso's unqualified legacy trigger requires public helper lookup: save temporarily
sets pg_catalog, public at interest insertion, fails closed if anon/authenticated
have public CREATE privilege, then restores its fixed empty search_path. All tables
are qualified; this does not change Winso's ranking, trigger or broader RLS.
The historical checks above predate the account-enrichment migration.
New interest saves no longer require provider availability; `pnpm test:auth`
verifies account persistence with unavailable optional enrichment.

SQL char_length counts Unicode codepoints, matching the installed Zod 4.6.5 implementation (verified by execution and package source). The shared restricted HTTPS avatar policy
accepts an ASCII hostname with a letter-leading final label, no credentials/numeric IP hosts, an
optional numeric port of at most five digits within 0–65535, and no whitespace.
Uppercase HTTPS, malformed-port and Unicode boundary regressions are covered.

These are source/disposable checks, not live HTTP JWT/provider verification. No
running DB activation, Gemini request, commit or push occurred. Source rollback is
to drop save_matchmaking_profile(jsonb), then get_matchmaking_profile(); no tables
are removed. Any applied-environment rollback remains a separate approval gate.


## Real local downtime browser validation

Run from this worktree while UI3000/API3001 and local Supabase54321 are active:

```sh
PEBBLE_LOCAL_DOWNTIME_TEST=1 node tests/integration/local/test-downtime-local.mjs
```

This opt-in harness creates one disposable local Auth account through supported
Auth APIs and obtains a genuine session by verifying a generated local magic link.
Session values stay in memory and are not printed. The actual browser Supabase
client receives that verified session: no module, API, or algorithm mocks are used.
It saves a profile with empty interests and a21:00–24:00 window via the UI, joins
downtime, verifies persistence after refresh and navigation to active matching,
manually requests the real singleton empty SQL result, pauses, refreshes and confirms
the queue stays off. Cleanup deletes the Auth account and cascaded profile/queue.
No new interests, embeddings, populated ranking, background worker or Gemini call.
Only use against an isolated local test setup with no other queued users: a populated
queue can enter provider-backed scoring and is outside this harness scope.

Downtime controls now explicitly say Turn on downtime matching/Pause downtime
matching. Loaded saved server profile is required for join or mode switching;
refresh/pause remain available for an existing queue even if profile retrieval fails.
This is persisted enrollment and manual lookup, not scheduled background matching.
