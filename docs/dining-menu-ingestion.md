# SBU dining menu ingestion

Two Supabase Edge Functions follow the SB Engaged import pattern: authenticated
POST requests, `smoke`/`full` modes, dry-run by default, deterministic IDs, run
accounting in `ingestion_runs`, and seven-day retention.
The `ingest-dining` Edge Function runs both source handlers in one authenticated
request and reports their results separately.

| Function | Source | Discovery |
| --- | --- | --- |
| `ingest-nutrislice` | `nutrislice_sbu` | [Nutrislice SBU](https://stonybrook.nutrislice.com/menu/), using its public JSON location and weekly-menu endpoints |
| `ingest-sbu-hospital` | `sbu_hospital` | [Hospital dining locations](https://www.stonybrookmedicine.edu/diningservices/locations), following Google Docs links in the Weekly Menu section and requesting their text exports |

No API key, account, or browser automation is needed for these public sources.
The Nutrislice JSON interface is an upstream implementation detail and may change.

## Inspect menus locally

These commands only read public sources and write the requested JSON file. They
never connect to Supabase or create ingestion runs:

```sh
pnpm demo dining-scrape --source nutrislice --mode full --output /tmp/sbu-menus.json
pnpm demo dining-scrape --source hospital --mode full --output /tmp/hospital-menus.json
pnpm demo dining-scrape --source nutrislice --mode full --locations east-side-dining,west-side-dining --output /tmp/dine-in-menus.json
```

Optional: `--start-date YYYY-MM-DD`. The CLI exits with status 1 for failed or
partial scrapes, while preserving successful rows and error details in the JSON.
`smoke` is the default: one day, up to three Nutrislice menu types, sampling one
per location with East Side and West Side first. `full` reads every discovered
menu type for seven days, starting on the selected date. The hospital reads all
currently linked weekly documents and returns published days within that window.
The start date defaults to today in `America/New_York`; date windows have an
exclusive end and remain correct across daylight saving changes.

## Run an import

Apply `supabase/migrations/20261115010000_dining_menu_ingestion.sql` to the target
database. Set `INGEST_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the
Edge Function environment, as for SB Engaged. Dry-runs only need `INGEST_TOKEN`.
For local serving, put function secrets in the ignored root `.env`; `pnpm dev` then serves every Edge Function.

Request a preview (use the corresponding function name for the hospital):

```sh
curl -X POST http://127.0.0.1:54321/functions/v1/ingest-nutrislice \
  -H "x-ingest-token: $INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"full","dryRun":true}'
```

Set `dryRun` to `false` to persist menus and run accounting. Optional request
fields are `startDate` and `locations` (an array of Nutrislice location slugs;
the hospital only accepts `market-place-cafe`). Responses include request counts,
normalization counts, up to three sample menus, storage/cleanup counts, structured
errors, and the ingestion run ID/status for real imports. Partial results return
HTTP 200 with `status: "partial"`; failures with no usable rows return HTTP 502.
Malformed input returns 400; missing/wrong tokens return 500/401 respectively.

For a local database, start Supabase and apply pending migrations without resetting
existing data, then serve both functions in one terminal:

```sh
pnpm supabase start
pnpm supabase migration up --local
pnpm supabase functions serve --env-file .env
```

In another terminal, export `INGEST_TOKEN` with the same value configured in
`.env`, then import both sources into the database:

```sh
for function in ingest-nutrislice ingest-sbu-hospital; do
  curl --fail-with-body -X POST "http://127.0.0.1:54321/functions/v1/$function" \
    -H "x-ingest-token: $INGEST_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"mode":"full","dryRun":false}'
done
```

For a hosted database, use its `SUPABASE_URL` instead of
`http://127.0.0.1:54321`; both functions must be deployed, the migration applied,
and `INGEST_TOKEN` configured as a function secret. Check each response for
`status: "ok"` and a nonzero `storage.upserted`; HTTP 200 can also indicate a
partial import. `pnpm demo dining-scrape` only writes JSON and does not populate the app.

## Storage and refresh behavior

`public.dining_menus` stores one snapshot per source, location, menu type, and
calendar date. Its `items` JSON array preserves item order, station names,
ingredients, images, prices, nutrition with upstream units in field names,
serving sizes, and published dietary/allergen icon labels where available.
Text notices are separate from dishes. Each row retains its original menu URL
and `last_synced_at`. Database types are in `src/types/database.ts`.

The IDs remain stable when dishes change or the hospital publishes a replacement
document. Upserts replace the complete item array, including an explicitly empty
Nutrislice day. Missing days, unpublished menus, parse failures, and failed
requests never create empty replacement snapshots. Failed scopes retain their
previous snapshots; check run status and `last_synced_at` for freshness. A full,
successful import deletes only that source's menus dated more than seven days
before today. Smoke/partial/failed runs do not perform retention cleanup.

Menus are separate from `listings`, which represents events, restaurants, and
parks. The new table uses RLS and service-role-only access, matching ingestion
storage conventions. Release CI deploys both functions.

## Production schedule

Google Cloud Scheduler in `cse416-meet-people`, region `us-east4`, runs both
production imports daily at **6:00 a.m. America/New_York**, including daylight
saving changes (`0 6 * * *`) through one job:
`pebble-ingest-dining-schedule` calls the `ingest-dining` Edge Function.

It sends authenticated POST requests to production Supabase
(`wacgxhsdhrqigrmqaonc`) with `{"mode":"full","dryRun":false}`. The function
runs both existing ingestion handlers concurrently, each with its own run record.
Both are attempted even if one fails; the combined response reports each result
and returns a failure HTTP status if either fails. Each refreshes
the next seven days of available menus, with a three-minute request deadline and
no automatic retries. Missing or unpublished source days can produce partial
imports; inspect `ingestion_runs`, since HTTP 200 alone does not mean full coverage.

`scripts/deploy-dining-schedules.mjs` creates or updates this schedule during
production releases, after Edge Functions, migrations, and hosted secrets are
configured. It reads the existing ingestion token from production Vault and
passes it through private temporary files without logging it. This also refreshes
the Scheduler headers after token rotation. Sandbox releases do not install these
schedule. The two previous source-specific schedules were removed after verifying
the combined job. To reconcile manually with an existing Supabase and gcloud login:

```sh
DEPLOY_ENVIRONMENT=production GCP_PROJECT_ID=cse416-meet-people \
SUPABASE_URL=https://wacgxhsdhrqigrmqaonc.supabase.co \
node scripts/deploy-dining-schedules.mjs
```

## Browse menus in Pebble

Discover's **Food menus** button opens `/matchmaking/food` in the signed-in app.
The screen uses `GET /api/dining?date=YYYY-MM-DD`, with the current session's
bearer token. The API verifies the session before reading that calendar day's
snapshots through the server's service-role client. Table permissions stay unchanged;
the browser receives validated display fields and never accesses the table directly.

Dates default to the Stony Brook calendar (`America/New_York`). Date, location,
menu and dish search are URL-backed. Menu types and stations remain separate so
overlapping dishes are not presented as a combined catalog. Dish details show only
published labels, ingredients, serving sizes and nutrition, including source units.
Each menu links to its provider and shows its last import time. Empty snapshots,
unpublished days and unavailable reads have separate states; cached snapshots stay
visible with an error if a refresh fails. No opening/closed status is inferred.

Apply the dining migration and run a real import against the target database to
populate this screen. Missing backend setup reports unavailable; a configured
database with no imported menus shows an unpublished day. The UI does not schedule
or trigger scraping. Validate browsing with:

```sh
pnpm exec vitest run tests/unit/api-dining.test.ts
pnpm test:browser tests/browser/food.spec.ts
```

## Source limits

- Nutrislice menu types may contain overlapping groups of dishes. Preserve their
  menu type and station context when displaying them; do not sum rows as unique
  dishes. Closed locations can still publish menus, and an empty menu alone does
  not establish opening hours. Location hours are not scraped here.
- Nutrislice requests run four at a time, at most once per menu/calendar week,
  with a 90-second overall budget, 15-second request timeouts, and a 12 MiB limit
  on each streamed response. Deferred requests and missing dates are reported.
- Hospital coverage is the Market Place Café's linked daily menus. The source
  currently publishes weekdays; it does not expose complete weekend menus,
  patient meal plans, or daily menus for Starbucks/Cancer Center Dining.
- Hospital text currently omits years and station/meal-period groupings. Infer
  missing years only within 45 days of the scrape date and validate weekdays,
  including December/January rollover. This supports the current linked weeks,
  not arbitrary historical reconstruction. Nutrition, prices, ingredients, and
  station fields remain null when absent; parenthetical dietary labels remain
  in the dish names and are also copied into `labels`.
- If hospital documents become private, switch to PDFs/images, change their
  layout, or give conflicting menus for a day, report an error for the affected
  scope and preserve stored data. No OCR or PDF fallback is implemented.

## Validation

```sh
pnpm exec vitest run tests/unit/dining-menus.test.ts tests/unit/dining-ingestion.test.ts
deno check supabase/functions/ingest-nutrislice/index.ts supabase/functions/ingest-sbu-hospital/index.ts supabase/functions/ingest-dining/index.ts
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < tests/integration/sql/dining-menus.sql
```

The SQL acceptance test rolls back its fixtures. Unit tests use captured public
menus and mock fetch/storage; live checks use the read-only CLI above.
