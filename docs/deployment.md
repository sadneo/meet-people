# Deployment and hosting

This is the setup, release and recovery runbook. Workflow behavior lives in
`.github/workflows/{checks,ci,release}.yml`; generated Hosting/Auth settings come
from `scripts/configure-deployment.mjs`. For local setup, use
[development onboarding](development-onboarding.md); for test commands, use
[tests/README.md](../tests/README.md).

## Environments

| URL | Firebase site | Backend | Developer toolbar |
| --- | --- | --- | --- |
| https://pebble.garden | `cse416-meet-people` | Production | Off |
| https://web.dev.pebble.garden | `cse416-meet-people-dev` | Sandbox | On |
| https://mobile.dev.pebble.garden | `cse416-meet-people-dev` | Sandbox | On |
| https://cse416-meet-people-sandbox.web.app | `cse416-meet-people-sandbox` | Sandbox | Off |

Each site's `https://<site>.web.app` URL remains available. Both developer domains
serve the same responsive build: layout follows viewport size, not hostname.
Sandbox sessions/localStorage are separate per origin, but backend writes are shared.

| Environment | Supabase project | Reference | Region |
| --- | --- | --- | --- |
| Production | `pebble-production` | `wacgxhsdhrqigrmqaonc` | `ca-central-1` |
| Sandbox | `pebble-sandbox` | `wixdiotkntapwrbibaom` | `us-east-1` |

Both Supabase projects belong to the school-owned `pebble` organization.
GCP/Firebase resources share project `cse416-meet-people` (`368545465466`), with
Cloud Run in `us-east4`. Sandbox has separate services, runtime/deployer identities,
registry repository, secret and OIDC pool. This is resource/data separation within
one GCP project, not a separate IAM or billing boundary.

Firebase serves static assets and rewrites `/api/**` to Cloud Run before the SPA
fallback. `pinTag` binds each Hosting release to its API revision. API responses
use `private, no-store`; hashed assets use immutable caching. Protected API routes
verify bearer tokens. The Cloud Run service permits public invocation for Hosting.
API containers scale to zero, with a maximum of two instances per service.

## Releases

All deployments come from **main**. A push deploys the same checked commit to
production and sandbox through separate GitHub environments. Feature branches
are tested on PRs and do not overwrite sandbox. Version tags are labels only.

1. Open a PR into `main` or `dev`; `Pull request checks` runs reusable CI.
2. Merge into `main`; `Deploy` resolves and checks the exact source SHA.
3. The workflow builds an immutable API image, deploys Edge Functions, applies
   migrations without development seeds, configures services and deploys Hosting.
4. Every deployed URL must pass `pnpm test:hosted URL`. Failure fails the run.

CI covers types, lint, units, deployment controls, both toolbar builds, disposable
database reset/generated types, SQL security, local integration, source/built
browser tests and the Docker build. See the workflow result for current failures;
past passing counts do not certify the current tree.

Deployment runs are serialized; active runs are never cancelled. Hosting sites
publish sequentially because each site's `pinTag` updates the shared API service.
Concurrent site publishing can cause Cloud Run resource-version conflicts.

### Manual sandbox deployment

Run **Deploy** from workflow branch **main**. Source can be blank/`main` or a full
commit SHA already on main; both sandbox sites are replaced.

```sh
gh workflow run release.yml --ref main \
  -f environment=sandbox -f source_ref=main
```

### Manual production override

Normal deployments require passing CI. To bypass pre-deployment checks, supply a
full 40-character SHA already on main and a reason:

```sh
gh workflow run release.yml --ref main \
  -f environment=production -f source_ref=FULL_MAIN_COMMIT_SHA \
  -f skip_checks=true -f override_reason='Explain the known failure and why this release is needed'
```

Automatic runs cannot skip checks. Overrides still validate resource isolation,
build, apply migrations and run hosted smoke checks. The summary records actor,
SHA, reason, image, URLs and result. Repository write access permits workflow
dispatch; admin merge bypass is a separate permission. Neither GitHub environment
adds an approval prompt. OIDC uses the deployment workflow on main, without
downloaded service-account keys.

## Configuration

Use Node 22, the declared pnpm version and the tools provided by `nix develop`.
Configure variables and secrets separately in GitHub's `production` and `sandbox`
environments:

| Location | Values |
| --- | --- |
| GitHub environment variables | `GCP_PROJECT_ID`, `GCP_REGION`, `GAR_REPOSITORY`, `GCP_DEPLOY_SA_EMAIL`, `GCP_WIF_PROVIDER`, `API_SERVICE`, `API_RUNTIME_ACCOUNT`, `API_SECRET`, `WORKER_JOB`, `WORKER_RUNTIME_ACCOUNT`, `FIREBASE_HOSTING_SITE_ID`, sandbox `FIREBASE_DEVTOOLS_SITE_ID`, `SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| GitHub environment secret | `SUPABASE_ACCESS_TOKEN`, with access to that environment's Supabase project |
| GCP Secret Manager | `pebble-supabase-service-role` / `pebble-supabase-service-role-sandbox`, accessible to the matching API runtime identity |
| Supabase Vault | `pebble_project_url`, `pebble_ingest_token`, `pebble_embed_secret` |
| Supabase Edge secrets | `INGEST_TOKEN`, `EMBED_SHARED_SECRET`, optional `GEMINI_API_KEY` and `TICKETMASTER_API_KEY` |

`VITE_*` values are public and compiled into the frontend; never put private keys
there. Changing them requires a rebuild. Sandbox must use its own Supabase ref/key:
deployment validation rejects production database/site/secret targets.

The workflow uses `supabase link` and CLI-managed database credentials through the
discovered pooler. The old `SUPABASE_DB_URL` secret is not consumed.

`scripts/configure-deployment.mjs` creates ignored `firebase.deploy.json` and
`hosting/deployment/supabase/config.toml`. The generated Auth configuration enables
signup with email confirmation and secure password changes. It allows callback
and reset routes on the environment's custom domains and `web.app` origins.
Do not push local development `supabase/config.toml` to hosted projects.

### Recreate infrastructure

```sh
gcloud auth login
export GCP_PROJECT_ID=cse416-meet-people
export GITHUB_REPOSITORY=sadneo/meet-people
export GITHUB_REPOSITORY_ID=1361380520
sh scripts/bootstrap-gcp.sh
```

Repeat with `DEPLOY_ENVIRONMENT=sandbox` for sandbox resources. Bootstrap creates
missing infrastructure, IAM and environment-scoped GitHub variables. It does not
create billing accounts, Hosting sites, Supabase projects or SMTP services.
Populate each runtime secret from stdin before deploying its API.

After migrations and Edge deployment, `pnpm hosting:configure` preserves generated
shared tokens, synchronizes Vault/Edge secrets and pushes hosted Auth settings.
Set `SUPABASE_PROJECT_REF` to the intended environment and `HOSTED_CONFIG_WORKDIR`
to `hosting/deployment` for generated settings; its default `hosting` directory
contains the production fallback. Optional provider secrets can be supplied through
ignored `.env.hosting.local`. Unsupplied Edge secrets are preserved.

### Database sources

`supabase/migrations/` is applied history. Active product SQL inputs live in
[`supabase/schema-sources/`](../supabase/schema-sources/README.md), including the
legacy/native-UUID adapters. `scripts/generate-product-migrations.mjs` produces
the prerequisite and UUID projection snapshots. Tests verify their source hashes.
Fresh databases install native UUID prerequisites before matching migrations;
activated databases retain their messaging schema and are checked for required RPCs.
Use forward migrations for installed databases, rather than rewriting history.

## Provider and owner setup

- **Deployment access:** create/renew a Supabase personal access token in
  [account tokens](https://supabase.com/dashboard/account/tokens) and save it as
  `SUPABASE_ACCESS_TOKEN` in each GitHub environment. Do not substitute a public
  key, service-role key or database password.
- **Email:** configure a verified transactional SMTP sender in each Supabase
  project's Authentication email settings. Disable link tracking for Auth emails.
  Keep email confirmation enabled. Verify invitation/reset delivery to an external
  inbox and complete a password reset; a dashboard's "sent" status is insufficient.
- **Google login:** configure the provider client ID/secret in hosted Supabase,
  independently of local CLI settings. Authorize the environment's web origins and
  `https://<project-ref>.supabase.co/auth/v1/callback` in Google Cloud. This is not
  the app's `/auth/callback` URL. Add permitted Google test users if the consent app
  is in Testing. See [accounts](accounts.md) for application session behavior.
- **Embeddings:** set server-only `GEMINI_API_KEY` in Supabase Edge secrets, then
  verify an authenticated `embed-interest` response with 3,072 dimensions. Saving
  the key does not backfill existing null embeddings or enable group workers.
- **Ingestion:** deploy `ingest-ticketmaster` only after supplying its key. For
  SB Engaged, inspect final `ingestion_runs` results, not just cron enqueue success.
  `select hosting_private.ingest_sbengaged();` requests an import;
  `select cron.unschedule('pebble-ingest-sbengaged');` stops scheduling. The schedule
  definition lives in `20261016130000_hosted_services.sql`.
- **Billing and alerts:** confirm the linked Google billing account's credit
  balance/expiry and recipients for the project-filtered $25 budget. Budgets are
  alerts, not spending caps. Google credits do not pay Supabase charges. Choose and
  verify a Cloud Monitoring notification channel for `pebble-api-health`; an uptime
  probe alone does not send incident emails.

## Custom domains

Attach `pebble.garden` to `cse416-meet-people`, and both dev domains to
`cse416-meet-people-dev`, as serving domains rather than redirects. Keep Porkbun's
nameservers and copy Firebase's exact required records:

| Type | Porkbun Host (relative to `pebble.garden`) | Value |
| --- | --- | --- |
| A | Leave blank | `199.36.158.100` |
| TXT | Leave blank | `hosting-site=cse416-meet-people` |
| CNAME | `web.dev` | `cse416-meet-people-dev.web.app` |
| CNAME | `mobile.dev` | `cse416-meet-people-dev.web.app` |

Add any `_acme-challenge` TXT records supplied by Firebase's current verification
requirements; tokens can rotate, so read them from Firebase rather than old docs.
Remove conflicting parking records only at affected hosts. Keep ownership records
for certificate renewal. Domain mappings are persistent cloud configuration;
frontend deployment does not create them.

After HTTPS is active, apply generated Auth settings and verify enabled OAuth
origins. Production's Site URL is `https://pebble.garden`; sandbox's is
`https://web.dev.pebble.garden`. Each app requests authentication links for its own
origin. Run `pnpm test:hosted URL` for each domain before updating the uptime probe.

Last verified **2026-10-31**: production and mobile passed hosted smoke checks.
The web dev CNAME/challenge TXT resolved publicly, with Firebase verification/HTTPS
still pending. Retain the earlier `desktop.dev.pebble.garden` mapping until web dev
passes. These checks do not establish interactive Google sign-in or email delivery.

### Firebase "Site Not Found" with an active domain

Check the bare homepage, `/index.html`, a fresh query URL, and `/api/health`.
If only the bare homepage returns a cache-hit 404, distinguish stale CDN content
from a missing deployment before changing DNS or app code. On 2026-10-31, cloning
and releasing the identical active production version cleared this condition
(release `1793490303177000`, version `c5da70460d8e1b5d`). Compare file hashes and
serving configuration first, preserving the API revision pin. Firebase rejects
releasing the already-active version directly, so a new clone is required.

## Recovery and verification

- Redeploy a previously deployed SHA on main, or restore a prior Hosting release.
  Its pinned rewrite follows the paired API revision, not default Cloud Run traffic.
- If the direct Cloud Run URL also needs rollback, move its traffic to the prior
  revision. Retain image digests and tagged revisions needed by Hosting releases.
- Code rollback does not undo migrations or stored data. Use additive forward fixes;
  failed smoke checks do not automatically roll back a deployment.
- Use Cloud Run and Supabase logs without logging tokens, request bodies, Vault
  values or provider keys.
- `release.yml` hardcodes `EVENT_GROUP_WORKER_ENABLED=false`. It packages the worker
  job but does not execute or schedule it. The runtime requires both worker/scoring
  gates, a dedicated worker JWT, enabled registry/database gates and verified
  provider configuration. Its job has zero retries; uncertain scoring must not be
  automatically repeated. `scripts/deploy-worker.sh` defines the runtime settings.

```sh
pnpm test:deployment
pnpm test:hosted https://pebble.garden
pnpm test:hosted https://web.dev.pebble.garden
pnpm test:hosted https://mobile.dev.pebble.garden
```

The smoke check covers SPA routes/assets, API health, database-backed reads and
anonymous private-account denial. Hosted account/product checks additionally
create disposable users and require explicit administrative credentials; see
[test prerequisites](../tests/README.md#integration-tests).
