# SBU month-ahead events and posters

Production is the sole SB Engaged crawler. Its hourly calendar import saves a
rolling 30-day window, including ongoing events, in batches of 100. The calendar
redirects to CampusGroups' public static CDN; redirects are restricted to the
verified calendar path and hosts. Streamed responses are bounded at 16 MiB, and
incomplete calendars never trigger reconciliation, cleanup or snapshot publication.

Metadata imports make no poster requests. Public event details are available as
soon as the import finishes; image loading proceeds separately.

## Persistent photo queue

`enrich-sbengaged` runs in production every five minutes. A database lease limits
all concurrent/manual executions to ten lookups per five minutes. Each lookup is
one anonymous public GraphQL event-photo request, with at least one second between
lookups. Jobs and retry times persist in `ingestion_private.sbengaged_photos`.
Interrupted batches recover after lease expiry; stale workers cannot commit.

Upcoming events within two days get priority. Existing posters are refreshed every
six hours for nearby events and every 24 hours for distant events. Confirmed
posterless events are checked daily. Unavailable event details are also deferred
for a day. Temporary failures back off exponentially with jitter, capped at six
hours. HTTP 429 / GraphQL rate-limit responses persist a source-wide cooldown,
honor Retry-After (seconds or HTTP dates), and stop the batch immediately. HTTP 403
pauses the source for at least an hour. Metadata imports respect that same cooldown.

The public API validates the requested event ID and poster URL. Failed lookups
preserve existing posters and the last successful check time. Metadata upserts
also preserve concurrently completed posters. Successful imports report queued
photo work separately from metadata success.

## Shared public data

`export-sbengaged` exposes only a fixed public-event field allowlist, authenticated
with a dedicated read-only export token. It serves the last completed metadata
snapshot with the latest cached poster fields; no profile, queue, user, or source
listing UUID is exported. Snapshots older than three hours are unavailable.

Sandbox's importer runs in mirror mode and copies that snapshot into its own
listings, preserving sandbox UUIDs. It validates completeness, age, event IDs,
source URLs and image URLs before writing. It never falls back to upstream
scraping or starts a second photo worker. Sandbox refreshes hourly, three minutes
after production's metadata schedule; its images can lag production by up to an
hour while the initial queue drains.

Both environments prune imported events ending more than two days ago, using
the start only when an end is absent. Ongoing events are retained. The public
directory shows upcoming events first, then ongoing events, and excludes ended
events independently of storage retention.

## Hosting and operations

- Production `pebble-ingest-sbengaged`: `17 * * * *` (metadata).
- Production `pebble-enrich-sbengaged`: `*/5 * * * *` (ten photos maximum).
- Sandbox `pebble-ingest-sbengaged`: `20 * * * *` (public snapshot copy).

Install migrations `20261116020000_sbengaged_month_sync.sql` and
`20261116021000_sbengaged_vault_runtime.sql`, then deploy
`ingest-sbengaged`, `enrich-sbengaged`, and `export-sbengaged` in both projects.
Run `node scripts/provision-sbengaged-sharing.mjs` once using an authorized operator
login. It preserves or creates the dedicated export credential, stores it in each
project's Vault, and leaves existing ingestion credentials intact. A service-role-only
runtime RPC loads the role and read-only export credential; Edge-secret update
permissions are not required.
Normal releases call `scripts/configure-sbengaged-sync.mjs` with explicit matching
`DEPLOY_ENVIRONMENT`, `SUPABASE_PROJECT_REF`, and `SUPABASE_URL`; it verifies the
sharing credential is present before enabling the matching role and schedules.

Normal import requests are `{"mode":"full","dryRun":false}`. Dry-run remains the
default. `refreshDetails:true` is rejected: photo work must stay within the paced
queue. Inspect `ingestion_runs` for metadata results, private queue outcomes and
next-attempt times for photo progress, and pg_net responses for worker summaries.
An initial 1,286-photo pass at ten per five minutes takes about eleven hours;
existing cached posters reduce the actual backlog. Counts vary with the calendar.

Regression checks:

```sh
pnpm exec vitest run tests/unit/sbengaged-month-sync.test.ts
# Local SQL test fixtures roll back:
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/integration/sql/sbengaged-month-sync.sql
deno check supabase/functions/ingest-sbengaged/index.ts supabase/functions/enrich-sbengaged/index.ts supabase/functions/export-sbengaged/index.ts
```

## Backfill existing local listings

```sh
pnpm demo images --dry-run
pnpm demo images
pnpm demo images --limit 100
```

The tool accepts only the verified running local `meet-people` Supabase project.
It reads existing active/rescheduled SBU events with missing images, checks their
public detail pages and updates only `image_url` and `details_synced_at`. It keeps
an ignored local before-image and report. Concurrently supplied images or detail
updates are preserved. It does not rescrape event times, remove events, change
queue enrollments, or call an embedding provider.

An event without a public poster retains the neutral image placeholder. The three
fictional demo events also have no real SBU poster to import.
