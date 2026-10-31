# CI/CD operation

## Sites and branches

| Site | Branch | API / database | Toolbar |
| --- | --- | --- | --- |
| https://pebble.garden | `main` | Production | Off |
| https://desktop.dev.pebble.garden | `main` | Sandbox | On |
| https://mobile.dev.pebble.garden | `main` | Same sandbox | On |
| https://cse416-meet-people-sandbox.web.app | `main` | Same sandbox | Off |

All deployments come from **main**. A main push deploys the same checked commit
to production and sandbox using separate GitHub environments and backends.
Feature branches are tested on PRs; they do not overwrite the sandbox.
Both dev domains map to `cse416-meet-people-dev`, serving the same responsive
developer build. Layout follows viewport size, not hostname. Production maps to
`cse416-meet-people`. Their existing `web.app` addresses remain available.
Both sandbox builds use one resolved commit, one API deployment and one database.
Their browser login sessions/localStorage are separate, but backend writes are shared.

All GCP resources currently share `cse416-meet-people`: creating a new project
was denied by the university organization. Sandbox uses its own services,
runtime/deployer identities, registry repository, secret and OIDC pool. This is
resource/data separation, not a separate-project IAM or billing boundary.

## Supabase provisioning

Both projects are healthy in the school-owned `pebble` organization
(`kjsmpfandyhaybltljbo`):

| Environment | Project | Reference | Region |
| --- | --- | --- | --- |
| Production | `pebble-production` | `wacgxhsdhrqigrmqaonc` | `ca-central-1` |
| Sandbox | `pebble-sandbox` | `wixdiotkntapwrbibaom` | `us-east-1` |

Production was transferred and renamed, preserving its project reference and
existing data. Both GitHub environments use a token with access to these projects.

Set sandbox environment variables `SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL`
and `VITE_SUPABASE_PUBLISHABLE_KEY`, and secret `SUPABASE_ACCESS_TOKEN`. Store
the sandbox service-role key as a version of GCP secret
`pebble-supabase-service-role-sandbox` (stdin, never source or logs). Do not
copy the production Supabase ref/key into sandbox: deployment validation rejects it.

The sandbox variables and service-role secret are configured. Both sandbox sites
were activated successfully by [deployment 40552588686](https://github.com/sadneo/meet-people/actions/runs/40552588686)
at source SHA `9d9b407` on 2026-10-27. Both hosted smoke checks passed; production
also passed an independent smoke check. Live bundles verified the intended
backend and toolbar variant, with local-login helpers absent from all three sites.
The run used a recorded override for the existing baseline unit/lint failures.

Hosting sites deploy sequentially because each site's `pinTag` updates the same
API service. Concurrent publishing caused a confirmed Cloud Run resource-version
conflict during the first activation attempt; PRs #27 and #28 contain the fix.

Sandbox email authentication is enabled and callbacks cover both sites. Google
authentication is not yet enabled in the new sandbox project (production Google
authentication remains enabled). To enable sandbox Google login, configure its
OAuth client in Supabase and authorize
`https://wixdiotkntapwrbibaom.supabase.co/auth/v1/callback` in Google Cloud's OAuth
client settings, then verify an interactive sign-in on both sandbox sites.

## Normal operation

1. Open a PR into `dev` or `main`; `Pull request checks` runs full CI.
2. Merge into `main` to update production and both development domains.
3. `Deploy` resolves one commit SHA and runs the same CI against that exact SHA.
4. Only a successful CI result permits an automatic deployment.
5. Each deployed URL runs hosted smoke checks. A failed smoke check fails the run.

Version tags are release labels only. Deployment workflows are serialized;
active deployments are never cancelled, but GitHub concurrency can supersede a
pending run. Production and sandbox jobs use separate resources and run independently.

CI covers typecheck, lint, unit tests, deployment controls and both optimized
toolbar variants, database reset/generated types, SQL security, local integration,
source/built browser tests and Docker build. It uses a disposable local database,
never a hosted reset. Baseline app unit/lint failures currently block normal
deployment; they remain visible rather than being excluded or marked successful.

## Manual sandbox deployment

Actions → **Deploy** → **Run workflow**, using the workflow branch **main**:

- Environment: `sandbox`
- Source ref: `main` (or blank), or a full commit SHA already on main
- Skip checks: off unless deliberately overriding
- Override reason: required if skipping

```sh
gh workflow run release.yml --ref main \
  -f environment=sandbox -f source_ref=main
```

The source is resolved once, tested and deployed at that SHA. Commits outside main
are rejected. Both sandbox sites are replaced. The next successful main deployment
updates them again.

## Approved production override

There are two independent controls:

1. **Merge bypass:** normal merges require `Checks / CI`. Repository admins can
   explicitly bypass this rule; ordinary contributors cannot. This does not grant
   an automatic deployment bypass.
2. **Deployment bypass:** manually run `Deploy` from **main**, choose `production`,
   enter a **full 40-character commit SHA already on main**, enable `Skip checks`,
   and supply a reason. An unmerged feature commit is rejected.

```sh
gh workflow run release.yml --ref main \
  -f environment=production -f source_ref=FULL_MAIN_COMMIT_SHA \
  -f skip_checks=true -f override_reason='Explain the known failure and why this release is needed'
```

Automatic runs cannot skip checks. A manual override skips pre-deployment CI,
not dependency installation, compilation, isolation/config validation, migrations
or post-deployment smoke checks. The summary records actor, branch, SHA, bypass
status/reason, image, URLs and result. Workflow dispatch is available to users
with repository write access, so that permission includes the manual deployment
escape hatch; admin-only merge bypass is a separate permission.

Production uses environment `production`, sandbox uses `sandbox`. Neither has
an additional approval prompt. GCP authenticates GitHub via OIDC; no downloaded
service-account keys are needed. Each environment has its own provider/deployer.

## Configuration and recovery

`scripts/bootstrap-gcp.sh` defaults to production; `DEPLOY_ENVIRONMENT=sandbox`
creates the suffixed resources and environment-scoped GitHub variables. It does
not create a Supabase project or populate service-role secrets.

`scripts/configure-deployment.mjs` generates ignored per-deployment Firebase and
hosted Auth configuration, validates resource names and rejects production
database/site/secret targets for sandbox. Both sandbox origins are allowed Auth
callbacks, including both custom dev domains. The frontend builds use explicit `VITE_DEV_TOOLS=false` / `true` and
show branch/short SHA in the developer toolbar. Local-login helpers remain absent.

Fresh databases install the reviewed product prerequisites in
`20261027000000_product_prerequisites.sql`, before the matching migrations. This
keeps native UUID conversations and records `canonical-product-uuid-v1`; the
later UUID projection migration retains the native inbox. Already activated
stores are checked for required RPCs and keep their existing messaging schema.
The deployment receipt check accepts both the native UUID and existing legacy
product versions, each against its own source hash.

The two migration snapshots are generated from the reviewed SQL files with
`node scripts/generate-product-migrations.mjs`. Unit tests check their source
integrity. `pnpm test:integration:schema` replays a fresh database and an already
activated legacy database in disposable containers, including seeds, messaging,
security checks and preservation of existing contacts.

### Custom-domain activation

1. Attach `pebble.garden` to Firebase Hosting site `cse416-meet-people`.
2. Attach `desktop.dev.pebble.garden` and `mobile.dev.pebble.garden` to
   `cse416-meet-people-dev` (both are serving domains, not redirects).
3. Copy Firebase's exact required DNS records into Porkbun; leave the root Host
   blank and use `desktop.dev` / `mobile.dev` for the respective subdomains.
   Remove conflicting parking records only at the affected hosts. Keep ownership
   verification records for certificate renewal. Keep Porkbun's nameservers.
4. Wait for connected domains and active managed certificates before cutover.
5. Apply the generated Auth configuration: production uses `https://pebble.garden`
   as Site URL; sandbox uses `https://desktop.dev.pebble.garden`. Both dev callback
   origins and existing `web.app` callbacks stay allowed. Each app supplies its
   own origin when requesting authentication links.
6. Update the Google OAuth client's JavaScript origins for enabled providers.
   Redirect URIs remain each environment's Supabase `/auth/v1/callback` URL.
7. Verify all custom domains with `pnpm test:hosted URL`. Release checks require
   working custom-domain DNS and HTTPS. Update the production uptime check to
   `pebble.garden/api/health` only after HTTPS is ready.

Domain mapping is persistent cloud configuration; frontend deploys do not create
it. Neither custom-domain setup nor DNS requires a new Supabase key.

The three mappings were created on 2026-10-31 and all seven Porkbun DNS records
were verified publicly. Firebase ownership/certificate activation remains pending
for production at the last check. The sandbox OIDC provider now accepts only the
deployment workflow on main. The repository configuration has not been deployed.

Firebase returned these DNS records (Porkbun Host is relative to `pebble.garden`):

| Type | Host | Answer / Value |
| --- | --- | --- |
| A | Leave blank | `199.36.158.100` |
| TXT | Leave blank | `hosting-site=cse416-meet-people` |
| CNAME | `desktop.dev` | `cse416-meet-people-dev.web.app` |
| CNAME | `mobile.dev` | `cse416-meet-people-dev.web.app` |
| TXT | `_acme-challenge` | `hXblM3oM1MZCkcEYReFD_HHti2OdkVVazXSwMUMD8ZE` |
| TXT | `_acme-challenge.desktop.dev` | `x4NsLVp5CyQOitvt1J6T6bR583S8W0g-SMjswZP9osI` |
| TXT | `_acme-challenge.mobile.dev` | `C1Fo8d8atEgJU041seIlvoM0_8JCDieuM1WJIpYFaS4` |

Remove the conflicting Porkbun parking records. Firebase observed root addresses
`207.207.210.107` / `207.207.210.229` and dev-host CNAMEs resolving through
`pixie.porkbun.com`; these can originate from Porkbun ALIAS/wildcard records.
Certificate challenge values can rotate: re-read each Firebase custom domain's
certificate verification requirements if validation is retried later.

Workers remain disabled and unscheduled. Database migrations are applied without
development seeds. API containers scale to zero when idle, maximum two instances
per service. Stored image versions, traffic, logs and API compute can incur costs;
Supabase has separate billing. Budget alerts are not spending caps.

`v1.0.4` took 2m 15s from trigger to completion. Budget 2–4 minutes for deployment
plus full CI; measure successful CI runtime after existing failures are fixed.

For rollback, manually deploy a previously deployed SHA on main. Hosting's API
rewrite is pinned to its API revision. Rolling back code does **not** undo
database migrations or already-persisted data; use additive migrations and forward
fixes. Smoke-check failure is not an automatic rollback.

Local deployment-specific verification:

```sh
pnpm test:deployment
```
