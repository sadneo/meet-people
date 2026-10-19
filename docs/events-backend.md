# Live events and company

This branch carries only the events portion of `feature/pebble-full-ui-prototype`:
its cards, category chips, details, group panel, and preview above 1800px. Other
routes and the ingestion branch's navigation stay as they were.

## Run locally

```bash
pnpm supabase:start
pnpm exec supabase migration up --local
pnpm env:local
pnpm dev
```

Open `http://127.0.0.1:3000/events`. Existing Ticketmaster and SB Engaged ingestion
populates `listings`; only active/rescheduled upcoming or ongoing events appear.
The migration does not seed fictional events. An empty local database or one
containing only past events produces an empty calendar.

`pnpm env:local` writes both public browser configuration and private API
configuration to ignored `.env.local`. The API development command loads that
file. Deployed APIs need `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in
their environment; never put the service-role key in a `VITE_*` variable.

Sign in from an event detail using an email link. Local email is delivered to
Supabase's mail viewer at `http://127.0.0.1:54324`. After changing Supabase auth
configuration, restart the local Supabase stack to pick up the redirect allowlist.
Hosted Supabase must allow the site's `/events/**` redirect URLs as well.

## Behavior and API

- `GET /api/events`: `category`, `page`, `limit` (up to 50), and optional paired
  `latitude`/`longitude`. Returns events, available categories, and `hasMore`.
  Events are ordered by start time and ID. Categories retain the ingestion source's
  labels; additional source categories appear automatically.
- `GET /api/events/:id`: a live event, or 404 when unavailable. Event URLs survive
  refresh and can be shared. Source links, images, location, description, and date
  fallbacks handle incomplete records. Prices are not currently ingested, so price
  UI is hidden; missing prices are never assumed free. Distances use an explicit
  location request and are straight-line miles.
- `GET /api/events/:id/company`: interested people's display names and IDs,
  interest count, the viewer's interest state, and only the viewer's own group.
  Requires a verified Supabase bearer token. The display list is capped at 50.
- `POST /api/events/:id/company`: `{ action, name? }`, where action is `interest`,
  `uninterest`, `join`, or `leave`. Identity comes from the verified token;
  supplied user IDs are rejected. Only display names are shared, never emails.

Interest is opt-in. Joining opts into a group for that event; it fills the oldest
group with room, or creates a waiting group. Groups hold at most four people.
Only users who explicitly join become members; interest alone is not consent to
joining a group. A singleton shows “Waiting for company”, and two or more people
show “Group formed”. Repeated joins are idempotent. Leaving a group keeps event
interest; withdrawing interest also leaves the group. A database event-row lock
serializes joins/leaves, and memberships persist across refreshes. The detail
panel refreshes company every 15 seconds. Groups are based on a shared event,
without compatibility ranking, invitations, ticket purchase, or messaging.

The event-company tables and RPC functions are accessible only to the API's
service role. Anonymous visitors receive counts but no interested identities.
No browser policies or service keys are added to the client.

## Verification

```bash
pnpm verify
pnpm test:e2e
```

With the app API on port 3101, run the real authenticated integration check:

```bash
node --env-file=.env.local scripts/test-events-live.mjs
```

For the normal development port, prefix that command with
`EVENTS_TEST_API_URL=http://127.0.0.1:3001`. The check only accepts a local Supabase
URL, creates a disposable event and two confirmed test accounts, then deletes
them. `tests/event-company.sql` also checks group capacity, idempotency, leaving,
cleanup, cancellations, and permissions inside a transaction that rolls back.

## Later merge

The screens in `src/features/events` are independent of navigation and prototype
context. `src/routes/Events.tsx` supplies the standalone shell used by this branch.
See [the integration guide](events-integration.md) for the exact routes, prototype
scene detection, shared authentication, CSS boundaries, and suggested commit split.
