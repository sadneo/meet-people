# CI/CD operation

## Sites and branches

| Site | Branch | API / database | Toolbar |
| --- | --- | --- | --- |
| https://cse416-meet-people.web.app | `main` | Production | Off |
| https://cse416-meet-people-sandbox.web.app | `dev` | Sandbox | Off |
| https://cse416-meet-people-dev.web.app | `dev` | Same sandbox | On |

There are **two deployment branches and three sites**. Feature branches are
tested on PRs into either branch; feature commits do not overwrite the sandbox.
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

The sandbox variables and service-role secret are configured. The first sandbox
activation applied migrations and deployed its backend, but publishing both
Hosting sites concurrently failed with a Cloud Run resource-version conflict.
Hosting sites must deploy sequentially because each site's `pinTag` updates the
same API service. Production is independent.

## Normal operation

1. Open a PR into `dev` or `main`; `Pull request checks` runs full CI.
2. Merge into `dev` to update both sandbox sites, or `main` to update production.
3. `Deploy` resolves one commit SHA and runs the same CI against that exact SHA.
4. Only a successful CI result permits an automatic deployment.
5. Each deployed URL runs hosted smoke checks. A failed smoke check fails the run.

Version tags are release labels only. Deployments are serialized per environment;
active deployments are never cancelled, but GitHub concurrency can supersede a
pending run. Production and sandbox can deploy independently.

CI covers typecheck, lint, unit tests, deployment controls and both optimized
toolbar variants, database reset/generated types, SQL security, local integration,
source/built browser tests and Docker build. It uses a disposable local database,
never a hosted reset. Baseline app unit/lint failures currently block normal
deployment; they remain visible rather than being excluded or marked successful.

## Manual sandbox deployment

Actions → **Deploy** → **Run workflow**, using the workflow branch **main**:

- Environment: `sandbox`
- Source ref: branch name, default `dev`
- Skip checks: off unless deliberately overriding
- Override reason: required if skipping

```sh
gh workflow run release.yml --ref main \
  -f environment=sandbox -f source_ref=feature/my-change
```

The selected branch must contain the deployment scripts/tooling. It is resolved
once, tested and deployed at that SHA. Both sandbox sites are replaced. The next
successful `dev` deployment restores them.

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
callbacks. The frontend builds use explicit `VITE_DEV_TOOLS=false` / `true` and
show branch/short SHA in the developer toolbar. Local-login helpers remain absent.

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
