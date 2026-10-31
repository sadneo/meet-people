# Private beta hosting

**Looking for your next steps? [Start with the owner setup checklist](../HOSTING-SETUP.md).**
This page is the technical deployment and recovery runbook.

Custom-domain cutover is pending for `pebble.garden` (production) and
`desktop.dev.pebble.garden` / `mobile.dev.pebble.garden` (sandbox developer build).
All deploy from `main`; see [domain activation and deployment](deployment.md).

## Deployed environment

| Resource | Value |
| --- | --- |
| App | https://cse416-meet-people.web.app |
| Google Cloud/Firebase project | `cse416-meet-people` (`368545465466`) |
| API | `pebble-api`, Cloud Run `us-east4` |
| Container repository | `us-east4-docker.pkg.dev/cse416-meet-people/meet-people` |
| Runtime identity | `pebble-api@cse416-meet-people.iam.gserviceaccount.com` |
| Deploy identity | `github-deployer@cse416-meet-people.iam.gserviceaccount.com` |
| Supabase | `wacgxhsdhrqigrmqaonc`, existing `meet-people` project in Canada |

Firebase serves `dist/web`, rewrites `/api/**` to Cloud Run, and falls back to
`index.html` for client routes. `pinTag` keeps each Hosting release paired with
its API revision. Assets have immutable caching; API responses are private and
no-store. API authentication uses bearer tokens, not cookies (Hosting strips
most cookies).

Cloud Run uses request-based billing, 1 CPU, 512 MiB, minimum zero and maximum
two instances. The service is publicly invokable for the Firebase rewrite;
protected application operations authenticate their callers. Requests time out
after 55 seconds, below Hosting's 60-second limit. Ingestion runs separately.

## First deployment status (2026-10-16)

- Applied pending migrations to the existing hosted database without seeds.
- Restored `20260915171256_enable_postgis.sql` from the exact statement already
  recorded in hosted migration history; no history repair or reset was needed.
- Deployed the API container, Firebase site, `embed-interest`, and
  `ingest-sbengaged`.
- Configured Vault/Edge Function shared secrets and hourly ingestion at minute
  17 UTC. The initial full import completed with 38 accepted/upserted events.
- Disabled open signup and configured hosted redirects and password policy.
- Configured repository-scoped, version-tag-only GitHub OIDC federation and
  deployment IAM. No service-account JSON keys were created.
- Created project-filtered `Pebble beta monthly` budget ($25, excluding credits
  so underlying usage remains visible), with 50/90/100% actual-spend and 100%
  forecast alerts to the billing account's default IAM recipients.
- Created `pebble-api-health`: HTTPS `/api/health` every five minutes from three
  US locations, validating TLS, status 200 and the health response body.
- Verified 225 unit tests, 18 production-build browser tests, SQL hosting
  permission checks, real local authentication, hosted smoke checks and real
  hosted browser onboarding/account isolation. Disposable hosted users were
  deleted after the checks.
- The first deployment was made from the working tree, including existing
  account/auth changes. Its API image tag identifies the base commit plus a
  workspace timestamp; it is not claimed to be a clean tagged release.

### Remaining account setup

1. **SMTP:** configure a transactional sender in Supabase Authentication →
   Email → SMTP. A real sender/domain and provider credentials are required;
   they are not present in this workspace. Test invitation and password-reset
   delivery to an external inbox before inviting testers. The default sender
   is restricted and is not a beta email service.
2. **Google login:** configure the Google OAuth web client and secret in
   Supabase if testers should use the Google button. See `accounts.md`; the
   provider must reject unknown users while beta signup is disabled.
3. **Gemini:** set `GEMINI_API_KEY` when running `pnpm hosting:configure`.
   Without it, enrichment returns 503; interest labels still save with null
   embeddings. Semantic scoring requires a working provider and is not proven
   by saving a label. Event grouping remains paused behind its existing gates.
4. **Release credential:** add `SUPABASE_ACCESS_TOKEN` to the GitHub
   `production` environment secrets (a token from the Supabase dashboard).
   Existing interactive CLI login is sufficient for local setup but is not
   transferred to GitHub runners. `SUPABASE_DB_URL` already exists in repository
   secrets; validate its current password before the first tagged release.
5. **Billing owner:** confirm the actual credit balance and expiry. The $25
   project-scoped budget is created and verified; the current identity cannot
   list all billing-account budgets or verify account credits. Confirm that
   the billing recipients receive its alerts. Alerts do not cap charges. Set
   a reminder before day 90; resources stop if an un-upgraded trial expires.

Google credits cover eligible GCP usage, not hosted Supabase. Current Google
terms also exclude Gemini API in AI Studio from welcome-credit coverage.
Start on the existing Supabase tier; Pro starts at $25/month and adds daily
backups and protection against inactivity pausing. Reassess before testers rely
on their data. The beta's GCP target is $0–15/month at low traffic, not a price
guarantee; network transfer, images, and log/build usage can add charges.

## Configuration

Use Node 22 and the declared pnpm version. Install the Google Cloud and Firebase
CLIs through `nix develop`. Supabase CLI is already a pinned dev dependency.

| Location | Values |
| --- | --- |
| GitHub variables | `GCP_PROJECT_ID`, `GAR_REPOSITORY`, `GCP_DEPLOY_SA_EMAIL`, `GCP_WIF_PROVIDER`, `FIREBASE_HOSTING_SITE_ID`, `SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| GitHub secrets | `SUPABASE_ACCESS_TOKEN` (production environment) |
| Cloud Run environment | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` |
| Secret Manager | `pebble-supabase-service-role` (runtime identity alone needs secret access) |
| Supabase Vault | `pebble_project_url`, `pebble_ingest_token`, `pebble_embed_secret` |
| Edge secrets | `INGEST_TOKEN`, `EMBED_SHARED_SECRET`, optional `GEMINI_API_KEY`, optional `TICKETMASTER_API_KEY` |

`VITE_*` values are public and compiled into the web bundle. Never put a
service-role, provider, SMTP, or database credential in them. Changing browser
configuration requires rebuilding and deploying the web app. Local ignored
`.env.production.local` currently contains local settings: pass hosted public
values explicitly when building a release, as CI does.

`scripts/configure-deployment.mjs` generates ignored `firebase.deploy.json` and
`hosting/deployment/supabase/config.toml` from the selected GitHub environment.
Both sandbox sites use the sandbox API and have their own Auth redirect entries.
The manual production fallback remains `hosting/supabase/config.toml`. Never push
the local development `supabase/config.toml` to a hosted project.

### Recreate Google deployment infrastructure

```sh
gcloud auth login
export GCP_PROJECT_ID=cse416-meet-people
export GITHUB_REPOSITORY=sadneo/meet-people
export GITHUB_REPOSITORY_ID=1361380520
sh scripts/bootstrap-gcp.sh
```

The bootstrap is repeatable: it enables APIs, creates missing resources,
assigns deploy/runtime permissions and writes environment-scoped GitHub variables.
Run again with `DEPLOY_ENVIRONMENT=sandbox` for sandbox resources. It updates
OIDC conditions to the branch/environment deployment model below; sandbox has
a separate identity pool so it cannot impersonate the production deployer.
It does not create a billing account, Hosting sites, Supabase project or SMTP service.
The runtime secret must have a version containing the project's service-role
key before Cloud Run can start. Populate it from stdin, not command arguments.

### Configure Supabase services

After migrations and function deployment:

```sh
pnpm exec supabase login
export SUPABASE_PROJECT_REF=wacgxhsdhrqigrmqaonc
pnpm exec supabase config diff --project-ref "$SUPABASE_PROJECT_REF" --workdir hosting
pnpm hosting:configure
```

Optional provider credentials can be supplied through ignored
`.env.hosting.local`. The configuration script preserves generated shared
tokens on repeated runs, synchronizes Vault and Edge secrets, and applies the
hosted auth policy. Existing function secrets not supplied are left intact.
Temporary credential files have owner-only permissions and are removed.

Deploy Ticketmaster only after supplying its key:

```sh
pnpm exec supabase functions deploy ingest-ticketmaster --project-ref "$SUPABASE_PROJECT_REF" --use-api
```

SB Engaged scheduling is automatic after the Vault values are configured.
Verify the latest `ingestion_runs` result rather than treating a successful
cron HTTP enqueue as a successful import. For a manual import, use the SQL
editor to run `select hosting_private.ingest_sbengaged();`, then inspect the
run's final state. To stop scheduling:

```sql
select cron.unschedule('pebble-ingest-sbengaged');
```

Re-enable with `cron.schedule` using the name, expression and command in
`20261016130000_hosted_services.sql`. Never print Vault values into a run log.

## Inviting testers

Signup is disabled at Supabase Auth, including direct API registration; hiding
the registration page alone is insufficient. After SMTP is configured, invite
users from Supabase Authentication → Users with the recovery/onboarding flow.
For a manually provisioned confirmed password account, securely deliver its
initial access details and have the tester reset their password. Never commit
tester credentials. Verify both email/password and enabled OAuth providers.

Real features: accounts/onboarding/preferences, profile/settings persistence,
event listings and explicit event actions. Guest community progress, sample
messaging/people/plans remain prototype interactions. Automatic group matching
is still gated and requires its separate worker authorization/verification.

The existing email-existence endpoint uses conservative single-process/socket
rate limits. Behind Cloud Run, clients can share a proxy's allowance. Observe
429 responses during the beta; use trusted edge/client-IP rate limiting before
expanding this beyond invited testers. See `accounts.md` for the privacy tradeoff.

## Checks and releases

See [the CI/CD operating guide](deployment.md) for sites, manual deployment and
the approved override procedure. `checks.yml` runs the reusable `ci.yml` suite
on PRs into `main` and `dev`. `release.yml` calls the same suite for the exact
resolved SHA on pushes, then deploys production (`main`) or both sandbox sites
(`dev`) only after success. Required PR check: `Checks / CI`.

The suite verifies types, lint, unit tests, deployment isolation/toolbar builds,
a fresh local database reset/type check, SQL security, local auth, source and
built browser journeys, and the container build. Messaging seed assertions run
after the reset. Report artifacts are uploaded on failure.

The production browser suite is `hosting.spec.ts`, `auth.spec.ts`, and
`events.spec.ts`. Source-module-interception tests such as the mocked group
queue suite require the development server and cannot authenticate a built
bundle by intercepting `/src/supabase.ts`. Existing guest-avatar assertions in
`app.spec.ts` also predate the new signed-out header; these are outside the
hosting smoke suite and need updating with that UI's tests.

Version tags are labels, not deployment triggers. The existing baseline has
failing unit tests and lint errors, so normal deployments remain blocked until
those are repaired. An explicit manual override is available; checks are not
globally disabled and failed checks are never changed to success.

Deployment authenticates with OIDC, pushes a commit-SHA image, resolves its
digest, deploys Edge Functions, applies migrations without seeds, synchronizes
service configuration, deploys Cloud Run, then Firebase with the pinned API.
The final smoke check and workflow summary record the deployed version.
Concurrent releases are serialized. Migrations must remain compatible with
the preceding API revision; use additive changes and forward fixes.

The hosted auth config enables public signup and requires email confirmation.
SMTP credentials are configured separately in Supabase; releases preserve them.
GitHub OIDC is restricted to this repository's deployment workflow and selected
environment. Production requires the workflow ref on `main`; sandbox accepts
`dev` or `main`. A release needs no Google JSON key or Resend key in GitHub.
Migrations use `supabase link` and CLI-managed temporary database credentials
through the discovered session pooler. The old `SUPABASE_DB_URL` secret is no
longer consumed: its direct IPv6 endpoint is unsuitable for GitHub runners and
its stored password failed authentication. No database password reset is needed.

```sh
pnpm verify
pnpm test:integration:auth
pnpm test:hosted https://cse416-meet-people.web.app
```

For the real hosted browser/account check, supply `HOSTED_URL`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the process
environment or ignored `.env.hosting.local`, then run:

```sh
pnpm test:hosted:account
```

This creates and deletes two disposable confirmed users, checks rejected
uninvited signup, browser onboarding/reload, database persistence, logout,
account switching and private-data isolation. It does not send emails or
prove Google OAuth/provider embedding availability. Keep administrative
credentials in the test process only.

## Recovery and operation

### Event worker image entrypoint

Version-tag releases now deploy/update `pebble-event-group-worker` in `us-east4`
using the same immutable image digest as the API. Releases neither execute the
job nor create a schedule. One task runs with zero retries and a 300-second limit.

Before the first release with this job, rerun `scripts/bootstrap-gcp.sh` with
the documented owner environment to provision its dedicated runtime identity,
deployer impersonation permission, and `pebble-event-group-worker-jwt` secret.
The secret is created without a version; paused deployment does not require one.

The GitHub `production` environment variable `EVENT_GROUP_WORKER_ENABLED`
defaults to `false`. To enable a future release, first populate that secret with
the dedicated worker JWT, register its actor as `production-worker` in the
database, enable the database scoring gate, and verify Gemini configuration.
Then set the variable to `true`; deployment sets both process gates and mounts
the secret. Setting it back to `false` pauses the next deployed revision and
removes the secret binding. It does not cancel an already running execution.

The existing Dockerfile also compiles the event worker; no separate image or
production TypeScript loader is needed. For a Cloud Run Job, override the image
command with `node` and argument `dist/api/api/event-group-worker-main.js`.
Locally, after `pnpm build:api`, use `pnpm start:worker`.

Both `EVENT_GROUP_WORKER_ENABLED=true` and `MATCHMAKING_SCORING_ENABLED=true`
are required to perform work. Also provide `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `EVENT_GROUP_WORKER_ID`, and secret
`EVENT_GROUP_WORKER_JWT`; the database worker registry and scoring gate must
permit that actor. Without both environment gates the process exits paused.
Each execution handles at most three jobs and exits; uncertain outcomes exit
nonzero. Configure platform retries to zero to avoid automatic re-execution
after uncertain scoring. Scheduling and database/provider activation are separate
from packaging this entrypoint.

- Roll back the Hosting release in Firebase Console → Hosting → release
  history. Its `pinTag` also restores the paired API revision.
- If the direct Cloud Run URL must also roll back, select the prior revision
  in Cloud Run → Revisions and move traffic to it. A pinned Firebase rewrite
  follows its tag, not the service's default traffic split.
- Do not roll database migration history backward. Apply a forward fix.
- Use Cloud Run request/container logs and Supabase function/ingestion logs.
  Never log bearer tokens, emails/request bodies, Vault values, or provider keys.
- `pebble-api-health` checks external HTTPS process availability. Configure its
  alert policy/notification channel after selecting an uptime alert recipient;
  the probe alone does not send incident emails. `pnpm test:hosted` also checks
  database-backed event access.
- Retain recent image digests and tagged Cloud Run revisions used by Hosting
  releases; deleting them removes the corresponding rollback path.

References: [Firebase Cloud Run rewrites](https://firebase.google.com/docs/hosting/cloud-run),
[Google credits](https://cloud.google.com/free/docs/free-cloud-features),
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions),
[Supabase pricing](https://supabase.com/pricing).
