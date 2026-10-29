# Matchmaking frontend and local demos

Discover loads passive Friends and Dating batches (up to ten safe profiles),
keeps the currently viewed card stable, and refills near the end of the buffer.
Pass advances immediately. Requests save independently, with uncertain results
shown rather than automatically retried. Mode switches retain the two decks.
Preferences, profile changes and blocks invalidate recommendations. Friends
requests require explicit acceptance in Activity; Dating connects on mutual likes.

Messages → Find a group explicitly joins the separate active Friends queue.
The ideal size selector means **new friends**, in addition to you. The accepted
range is two people through that ideal total; smaller proposals always require
every member to consent again. Group chat, ready-up, newcomer review, group names
and leaving use the active-group endpoints. Direct conversations retain their
existing endpoints. Group inboxes combine both sources; no historical message
content is copied into a new group.

Profile → Availability timezone saves the timezone for the existing weekly
schedule. Active matching requires it; passive matching handles missing schedules
as missing data. Shared-time explanations are opt-in. Partner gender targets in
Dating preferences are explicit for every sexuality.

## Local prerequisites

For a fresh canonical matchmaking test stack, run `pnpm supabase:start:matching`.
This uses an ignored local work directory, installs the reviewed product SQL before
matching, omits the two incompatible service-messaging replacement migrations, and
disables the old seed. Historical migrations are unchanged. It never resets a
database. The normal `supabase:start` migration track is not compatible with this
canonical backend yet; production schema reconciliation remains separate.

For an existing canonical stack, apply the reviewed
product migrations, then all four `20261028` matching migrations in order. Existing
schema reconciliation instructions still apply; **do not reset a populated database**
just to enable matching. In `.env.local`, set `DATING_RULES_ENABLED=true`,
`FRIENDS_RULES_ENABLED=true`, `ACTIVE_FRIENDS_ENABLED=true`, and configure the existing
Supabase URL/public key/service-role key. Keep service-role credentials server-only.
Restart `pnpm dev`. Active matching also requires the DB policy gate; the explicit
local-only `--enable-active` option below enables it.

The scripts require Docker and the running local `supabase_db_meet-people`
container with the expected Supabase project label. They refuse remote targets.
They never accept an arbitrary account ID. Dry runs do not access Docker, the
network or credentials. Local test fixtures may be created and removed by the integration check; no
hosted database is targeted.

## Add passive discovery profiles

```sh
pnpm demo:seed --count 20 --dry-run
pnpm demo:seed --count 20
```

The existing seeder prompts for a hidden shared demo password. It creates marked,
fictional adult Auth accounts, complete profiles, explicit Dating targets,
participation settings, trusted search areas and `America/New_York` availability
metadata. It does not join the active queue. Sign in as
`pebble-demo-001@example.test` (through `020`) with that password. Your real account
must also have valid mode preferences, participation and a mutually compatible
search area. Merely inserting a profile row is insufficient.

Reruns preserve edited profiles. To migrate **these demo users'** older preferences
to the current seed plan, use `--reset-profiles` deliberately. Reviewed campus
catalogue records must remain valid; use the existing seeder's documented
`--refresh-location` option only for its local fixture location.

## Add selected people to active matchmaking

```sh
pnpm demo:active --count 3 --start 1 --dry-run
pnpm demo:active --count 3 --start 1 --new-friends 2 --enable-active
pnpm matchmaking:active:once
pnpm demo:active --count 3 --start 1 --action status
```

`--new-friends 2` prefers a total of three, with two as the minimum. Queuing uses
the actual authenticated actor RPC for each selected demo account and real hard
filters. No proposal is guaranteed; availability, distance and mutual ages still
apply. The operator transaction validates all selected ownership markers first.
The worker command runs a bounded batch; schedule it regularly for idle progress
and expiry. The script never accepts a proposal on someone else's behalf. Use
separate browser sessions for demo accounts to review and accept their exact
rosters in Messages. Existing group growth additionally requires all members'
ready-up and consent.

```sh
pnpm demo:active --count 3 --start 1 --action cancel
pnpm demo:remove --count 20 --start 1 --dry-run
pnpm demo:remove --count 20 --start 1
```

Cancel frees queue participation without deleting established chats. Remove is
an explicit, irreversible deletion of only the selected, seed-marked Auth
accounts and their cascading data, in one guarded transaction. A changed/missing
marker rejects the whole selection. Do not use removal to simulate ordinary
unmatching or leaving a group.

`demo:queue` is the **legacy** queue tool retained for old-flow debugging; use
`demo:active` for the new Messages flow.

## Verification

Unit tests cover ranking, API contracts and schedule persistence. The disposable
PostgreSQL/PostGIS runner also executes the actual seeder and new queue/status/
cancel/removal SQL, including rollback when an ownership marker is absent.
Browser tests exercise buffered discovery, passive participation, active queue
review and smaller-roster reconsent at 320×568 and 375×667. These use mocked HTTP
and browser emulation, not hosted Supabase Auth or real phones. Separate SQL tests
exercise real transactions, spatial queries, expiry and concurrency. Deployment
and an end-to-end test against running local Supabase remain environment steps.

## Real local HTTP acceptance

After `pnpm supabase:start:matching`, run `pnpm test:integration:matching`. This
requires demo slots 001–002 to be unused, preserves occupied slots, generates a
password only in memory, signs in through real Supabase Auth, and exercises both
passive batches, explicit Friends acceptance, active proposals, exact-roster
acceptance and idempotent group messages through Express/PostgREST. It removes
its marked demo users afterward. No scheduler or production deployment is implied.
