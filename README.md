# Meet People

## Requirements

- Node.js 22
- pnpm 11.25.0
- Docker-compatible container runtime (Docker or rootless Podman)
- Nix users can install the declared development tools with `nix develop`.

## Local Setup

```bash
nix develop
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm env:local
pnpm dev
```

The browser runs on `http://127.0.0.1:3000`, and the API runs on port `3001`.
The Supabase wrapper automatically uses a rootless Podman socket when one is available.

## Environment

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public | Supabase project URL for the browser client. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key for the browser client. |
| `SUPABASE_URL` | Server-only | Supabase URL for privileged API operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase service-role key for privileged API operations. |
| `PORT` | Server-only | API listening port; defaults to `3001`. |

`pnpm env:local` writes the public local Supabase values to ignored `.env.local`. Never expose the service-role key through a `VITE_*` variable.

## SB Engaged ingestion

SB Engaged events come from its public iCal feed and are written only by the protected Supabase Edge Function. Set `INGEST_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the ignored `supabase/.env`, then run:

```bash
pnpm supabase:functions:serve:sbengaged
```

Test the next 24 hours without database writes:

```bash
set -a; . supabase/.env; set +a
curl -X POST -H "x-ingest-token: $INGEST_TOKEN" -H "content-type: application/json" \
  -d '{"mode":"smoke","dryRun":true}' \
  http://127.0.0.1:54321/functions/v1/ingest-sbengaged
```

Use `{"mode":"full","dryRun":false}` to upsert all public events beginning in the rolling 24-hour window. Full runs enrich up to 25 event pages per invocation; repeated runs gradually refresh event images.

## Verification

```bash
pnpm supabase:reset
pnpm supabase:types
pnpm test:auth
pnpm verify
pnpm test:e2e
```

Install a browser once when Playwright has not already provisioned one:

```bash
pnpm exec playwright install chromium
```

On NixOS, `pnpm test:e2e` uses an installed native `chromium` when available.

## Production-Style Local Check

```bash
pnpm build
PORT=8080 pnpm start:api
docker build --tag meet-people-api:local .
docker run --rm --publish 8080:8080 --env PORT=8080 meet-people-api:local
```

Check the API with `curl http://127.0.0.1:8080/api/health`.

To run browser smoke tests against the built web artifact, start the compiled API on port `3101`, then preview the web build with its API proxy:

```bash
PORT=3101 pnpm start:api
API_PORT=3101 VITE_PREVIEW_PORT=3100 pnpm preview
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm test:e2e
```

## Hosted Environments

Staging and production Supabase, Firebase, Cloud Run, and CI/CD configuration start in Phase 6. No hosted deployment commands are documented yet because they have not been verified.
