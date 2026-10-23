# Live events

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

## Behavior and API

Both routes are public: signed-out visitors browse them at `/explore`.

- `GET /api/events`: `category`, `page` (up to 100), `limit` (up to 50), and optional
  paired `latitude`/`longitude`. Returns events, available categories, and `hasMore`.
  Events are ordered by start time and ID. Categories retain the ingestion source's
  labels; additional source categories appear automatically.
- `GET /api/events/:id`: a live event, or 404 when unavailable. Event URLs survive
  refresh and can be shared. Source links, images, location, description, and date
  fallbacks handle incomplete records. Prices are not currently ingested, so price
  UI is hidden; missing prices are never assumed free. Distances use an explicit
  location request and are straight-line miles.

The routes read only through `public_live_events` and `event_categories`. They
return active or rescheduled upcoming or ongoing events and their public columns,
and `public_live_events` bounds page size and offset itself. Both, and `listings`,
are service-role only: browsers cannot reach event data with the publishable key,
so every request passes the API's rate limits and cache. A route that needs other
data should get its own narrow function rather than query tables directly.

### Caching

The API keeps each list page and event for 60 seconds and serves repeat views from
memory; concurrent misses share one lookup and failures are never kept. Successful
responses send `Cache-Control: public, max-age=60` so browsers and the Firebase CDN
can reuse them. The browser sends these requests without the session so every viewer
shares one cache entry. Changes to an event can take about two minutes to appear.

### Rate limits

Per client address: 600 requests per 15 minutes across `/api` (health checks
excluded) and 300 per 15 minutes on `/api/events`. Counts live in each Cloud Run
instance's memory, so the effective ceiling is the limit times `--max` instances in
`scripts/deploy-api.sh`. Signed-in writes elsewhere are also limited per user in the
database (messages and connection requests), which holds across instances.

The client address comes from `X-Forwarded-For`, trusting exactly
`TRUST_PROXY_HOPS` proxies (default 1 in production, 0 locally). To measure it,
release once with the GitHub variable `LOG_CLIENT_IP=1`, request
`/api/health` through `cse416-meet-people.web.app`, and read the
`Client address check` log line in Cloud Run. Count the entries after your own IP in
`forwardedFor`, plus one for the hop that made the socket connection: that is the
hop count. Set `TRUST_PROXY_HOPS` to it, then clear `LOG_CLIENT_IP`, since the log
records IP addresses. If direct `*.run.app` requests pass through fewer proxies,
those callers can choose their address; restrict direct access if so.

### Retired: event company

The earlier "Find your company" interest list and first-come groups were retired on
2026-10-22. The event group queue replaced them ([event-group-queue.md](event-group-queue.md)),
and no screen used them. Migration `20261022120000_retire_event_company.sql` drops
their functions; the tables remain read-only for messaging history.

## Verification

```bash
pnpm verify
pnpm test:e2e
```

With the app API on port 3101, run the live integration check:

```bash
node --env-file=.env.local scripts/test-events-live.mjs
```

For the normal development port, prefix that command with
`EVENTS_TEST_API_URL=http://127.0.0.1:3001`. The check only accepts a local Supabase
URL, creates a disposable event, then deletes it. `tests/public-event-reads.sql`
checks the live filter, page bounds and anonymous permissions inside a transaction
that rolls back:

```bash
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/public-event-reads.sql
```

## Later merge

The screens in `src/features/events` are independent of navigation and prototype
context. `src/routes/Events.tsx` supplies the standalone shell used by this branch.
See [the integration guide](events-integration.md) for the exact routes, prototype
scene detection, shared authentication, CSS boundaries, and suggested commit split.
