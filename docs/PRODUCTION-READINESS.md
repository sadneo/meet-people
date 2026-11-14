# Production readiness

## Recovery and Maps authentication follow-up (November 13)

Recovery run `43550893011` succeeded, including hosted smoke checks, after PR #57.
Bounded production acceptance passed synthetic Auth, onboarding, Garden purchase
idempotency and private photo upload, but stopped at Maps preview HTTP 503. Both
owned accounts were cleaned after each attempt; public APK publication remains gated.

The IP-restricted server key was rejected because Google API traffic used Private
Google Access rather than the reserved NAT IP. Disabling subnet Private Google
Access did not solve this: Google documents that Public NAT never translates select
Google API traffic. The original `privateIpGoogleAccess=true` setting was restored.
Neither the key's IP restrictions nor its allowed APIs were broadened.

A deleted one-shot job using the production image, network and attached runtime
identity successfully called Geocoding v4 reverse lookup and Places autocomplete
with ADC OAuth (HTTP 200 for both). No downloaded service-account key, stored token
or additional IAM grant was needed. The backend now supports renewable ADC with
`GOOGLE_MAPS_OAUTH_PROJECT`; production selects it while sandbox retains API-key
authentication. OAuth failures are sanitized and never fall back to the key.
Reverse geocoding requests only place ID/address components and preserves the
user-selected center. Existing signatures, expiry, owner/mode checks and retention
policy are unchanged. The Geocoding v4 reverse daily provider quota was set and
read back as 1000 (shared project); the per-instance app limit remains 200/day.
These are request limits, not a hard dollar cap.

Local typecheck, lint, API build, deployment tests and 12 focused location tests
passed. The backend change still requires CI, protected merge/deployment and live
acceptance before declaring Maps recovered or publishing the draft APK.

## First production deployment follow-up

PR #54 merged as `22c1e63c7e4145e87382f19683e07f64f2922dad`.
Run `43527250078` applied migrations and deployed the API, then failed when the
event-group job referenced `pebble-event-group-worker-jwt:latest`: the secret
resource existed but no version had ever been provisioned. The website publish and
final hosted acceptance steps had not completed. Do not describe that run as a
successful production release or roll back migrations blindly.

The corrective worker design uses an internal, non-discoverable Auth identity,
registered only in the private worker allowlist. Versioned credentials are in
`pebble-event-group-worker-credentials-production:1`, with access only for the
group-worker runtime identity. Every job signs in for a fresh, bounded session and
signs out its own refresh session afterwards; no permanent expiring access JWT or
Supabase signing secret is required. Legacy JWT configuration remains supported
for existing sandbox/manual jobs. No private user content was inspected.

The first signed APK/AAB was built from the main merge, version
`1.0.0-early-access.1` / code `1`, and placed in `Pebble-APKs/`. APK signing,
production endpoints, non-debuggable state, credential-exclusion checks and native
16 KB ZIP/ELF alignment passed. A fresh API36 emulator installed it and the screenshot
shows the real sign-in screen. UIAutomator did not expose WebView text, so the text
assertion failed despite the rendered screen; do not claim automated UI traversal
or authenticated flows passed. Disposable emulator data was removed. The GitHub
download release remains a draft pending production backend recovery/acceptance.

## Authorized autonomous release run — in progress

Operator decisions: adult-only (18+) app; production deployments and bounded
synthetic-account testing permitted; create a new private signing identity; use
the monitored existing support contact; deliver a local signed APK and public
download; do not submit to Google Play. Ask before each newly needed paid service.
Scheduled Cloud Run workers/Cloud Scheduler were subsequently approved, targeting
low initial cost, without always-on workers or claims of a hard billing cap.

### Local implementation completed so far

- Added adult admission guidance and a historical-minor account screen retaining
  support, sign-out and real deletion access. New DB migration rejects under-18
  birthdates, restricts self-service changes to already-saved DOBs, and gates Garden
  RPCs for historical/non-adult accounts. Existing private social eligibility remains.
- Updated stale Garden/block/report/push/age disclosures and added public deletion
  and child-safety routes on both web and mobile, reusing the product legal layout.
- Generated a private release signing key in ignored `.android-signing/`; passwords
  were not printed. Off-device encrypted backup still needs an operator action.
- Added explicit Gradle release signing/versioning, disabled release debuggability
  and Android backups, and added a production-only APK/AAB build/verification helper.
- Added Android compile CI. No release APK/AAB has been built or published yet.
- Excluded local cloud/Android tooling, credentials and APKs from Docker context;
  pinned ESLint's config root and ignored nested local toolchain source copies.
- Hosted push sender can use attached runtime ADC rather than requiring a downloaded
  service-account key; generic FCM 404 errors no longer delete valid device tokens.

Validation: 820 unit tests passed before the last push-auth changes; the full browser
suite passed after the adult-admission update, before the two new public-route tests;
both native UUID and activated legacy schema replay suites passed with the adult
migration. Production-like upgrade and adult SQL tests passed and containers cleaned.
Typecheck, lint and deployment tests passed after the push-auth changes. Re-run
complete checks after the remaining changes rather than treating these as final gates.

### Still required (not completed by this preparation)

1. Finish production Maps activation/retention review, versioned secret/network
   deployment wiring and signing-key installation/purge schedule.
2. Provision and validate runtime identities, push/event worker jobs and schedules.
3. Complete operational moderation instructions/tooling and verify bounded report
   response and account-deletion behavior with dedicated synthetic accounts.
4. Update production CI variables/settings and deploy tested, traceable source;
   apply reviewed migrations without resets. Current work remains local.
5. Verify real signup/email/OAuth configuration and delivery, real provider Maps,
   installed release build, push, account isolation and deletion. Physical-device
   acceptance cannot be inferred from browser fixtures or an AOSP-only emulator.
6. Build the final signed release, inspect package/native compatibility, publish
   versioned public artifacts and checksum, and provide exact tested limitations.

Do not describe the APK or production system as launch-ready until these gates
actually pass. Legal text is implementation-aligned drafting, not legal advice.

## Current recovery decision — early access

On November 13, 2026 the operator confirmed the Free plan and explicitly deferred
managed backups/PITR until after early access. Missing recovery is an **accepted
risk**, not a blocker for this early-access release. This supersedes the mandatory
backup gate recommendations in the earlier inspection notes below; the technical
findings themselves remain true. No recovery point or restore drill is claimed.

The local release workflow explicitly selects `early-access-no-backups`. It emits
a visible deployment warning and never reports recovery as verified. The script
defaults to strict `require-managed-backup` behavior if no policy is supplied and
rejects unknown policies/wrong targets. No hosted workflow was changed or deployed.

Data loss may be unrecoverable. Free projects may pause after inactivity. Before
leaving early access, provision recovery, complete a restore drill, and change the
workflow policy to `require-managed-backup`. CI checks, migration rehearsal,
environment isolation and other launch gates remain in force. No paid upgrade,
backup export or production migration is authorized by accepting this risk.

## Live inspection — November 13, 2026

Branch: `chore/production-readiness`. Target: Supabase `pebble-production`
(`wacgxhsdhrqigrmqaonc`), not sandbox. This inspection used explicit project refs;
it did not link the local development project to production. SQL was wrapped in
`BEGIN READ ONLY` / `COMMIT`. Only catalog metadata, migration version numbers and
the deployment version marker were queried, not private user content. Supabase CLI
reported initializing its login role for database access; no application schema,
data, auth configuration, deployment or backup settings were deliberately changed.

### Verified existing infrastructure

- Production is active/healthy in `ca-central-1`, PostgreSQL 17.6.1.166.
- All inspected public application tables have RLS enabled. Direct SELECT is denied
  to anon/authenticated on sensitive tables including profiles, messages, blocks,
  connections, push devices and push outbox. Account settings/profile projection
  tables allow authenticated SELECT with owner-only policies.
- Inspected private application tables have no anon/authenticated SELECT grants.
- Neither anon nor authenticated can CREATE in `public`.
- Current private photo storage references `auth.users` with `ON DELETE CASCADE`.
  This supports, but does not prove end-to-end, account deletion correctness.
- Production Auth site URL is `https://pebble.garden`. Callback/reset allowlists
  include production custom/Firebase domains and native
  `com.cse416.meetpeople://app/...` redirects.
- Custom SMTP is already enabled (`smtp.resend.com`, port 465). Actual delivery,
  sender verification, quotas and OAuth were not exercised.
- GitHub production variables identify this same project, URL and public key.
  The local ignored `.env.prod` now uses those confirmed public values. Backend
  secrets and Maps keys remain blank; no production secrets were fetched.

### Launch gates

#### P1 — Backup/recovery not established

The backups API returned `backups: []`, `pitr_enabled: false`,
`walg_enabled: true`, and empty physical-backup metadata. WAL-G enablement alone
does not demonstrate a usable recovery point. Confirm plan/retention and provision
a recovery strategy; complete a restore drill before production migration/release.
Do not claim there are no possible backups outside this API inventory.

#### P1 — Migration history and live objects disagree

Production records 39 repository migration versions, through `20261101000000`.
There are no remote-only versions. Four repository migrations are not recorded:

1. `20261104060000_push_notifications.sql`
2. `20261104060100_push_accepted_and_match.sql`
3. `20261105000000_garden_economy.sql`
4. `20261105010000_garden_social_rewards.sql`

Despite the pending push versions, live push tables and five push functions already
exist. Their origin and full equivalence to the repository are not established.
Do not blindly repair migration history or assume `CREATE TABLE IF NOT EXISTS`
validates existing definitions. Compare constraints, indexes, functions and triggers;
rehearse the exact forward migration on an isolated production-like database.
`garden_private` is absent: the current account-backed economy is not fully deployed.

The separate canonical product marker was installed October 19, 2026. Its stored
source hash matches the current `buildProductSchema()` bundle exactly. This verifies
the deployment marker, not every live function definition: migration history and a
stored hash alone cannot rule out subsequent manual changes.

#### P1 — Database transport/access hardening

SSL enforcement API reports `currentConfig.database: false`. Network restrictions
allow IPv4 `0.0.0.0/0` and IPv6 `::/0`. This does not grant unauthenticated database
access and does not mean existing clients use plaintext. Require TLS after checking
client compatibility, and decide feasible database/pooler allowlists without breaking
CI/runtime connectivity. No network or SSL settings were changed during inspection.

#### P1 — Production deployment has no reviewer approval gate

GitHub environment protection currently has branch policy only, not required
reviewers. Pushes to main can migrate/deploy production after CI. Establish the
desired approval mechanism before the first mobile launch. Signing and Play AAB
release automation remain separate work; web/backend deployment does not publish
the Android app.

### Hardening follow-up, not demonstrated public exposures

- Ten legacy SECURITY DEFINER functions lack explicit search_path settings. All ten
  deny EXECUTE to both anon and authenticated. Review internal callers and either
  retire or harden them; do not present them as confirmed public exploits.
- Legacy broad RLS policies still exist on several tables, but direct grants on
  those tables are revoked. Preserve both grant and policy boundaries; a broad
  policy name alone is not evidence that anonymous users can read the table.
- Extension/provider tables have separate grant patterns. Their schema exposure,
  RLS and function access require separate review before drawing conclusions.

### Outstanding acceptance

- Auth confirmation/reset/Google OAuth from a release-installed physical device.
- Actual push delivery and logout/account-switch cleanup.
- Account deletion across sessions, retained records, queued pushes and backups.
- Maps production keys/restrictions, storage approval and quota decisions.
- Scheduled workers, observability, deployment rollback and API compatibility.
- Age/audience decision, moderation ownership, current legal text, public deletion
  request resource and child-safety standards.
- Play account eligibility, upload-key custody, Play App Signing, versioning and AAB.

### Next safe sequence

1. Finish migration/object drift comparison and define a backup/recovery gate.
2. Rehearse migrations on a disposable database, never using production writes as a test.
3. Prepare reviewed CI/deployment/signing changes on this branch.
4. Obtain decisions for age policy, costs, provider activation and signing ownership.
5. Only then approve production changes and build one Play testing candidate.

No production migration, deployment, restore, key rotation or APK build was performed
as part of this inspection. Live findings are a point-in-time assessment, not a
complete penetration test or proof of functional correctness.

## Migration compatibility follow-up

Read-only inspection found all five live push function bodies match the repository
after normalizing line endings. Inspected columns/types, foreign keys, check/primary
key constraints, indexes and four enqueue triggers align with the two push migration
definitions. This is evidence of already-installed objects, not permission to repair
history or proof of migration replay safety. No `garden_*` public functions exist.

Repeat the catalog-only migration/function-body comparison with:

```sh
node scripts/audit-production-migrations.mjs
node --test tests/production-migration-audit.test.mjs
```

The script explicitly targets production with read-only SQL and never links the
workspace or executes migration files. It prints metadata/comparison results, not
function bodies or user data. Pending migrations are findings, not test failures.

### Initial rehearsal blocker (resolved below)

Docker client/server connection fails because `/var/run/docker.sock` is absent.
No standalone PostgreSQL server/client or rootless Docker socket is available.
No system service was started. A full migration rehearsal has **not** run.

An isolated rootless Docker startup was attempted using locally downloaded tools.
It failed before starting the daemon: the current username is `Danuu`, while the
configured subordinate UID/GID ranges belong to lowercase `danuu`. RootlessKit
therefore reported no subordinate ID ranges for this user. No system account or
subuid/subgid configuration was modified. Non-interactive sudo is unavailable.
The downloaded temporary tools were removed after the failed attempt.

The simplest remaining prerequisite is an operator-started Docker daemon. On this
system, `sudo systemctl start docker` can start it without enabling it at boot.
After rehearsal, remove only the named rehearsal container/volume, then stop Docker
if it was started solely for this task. Do not prune unrelated Docker resources.

Once an isolated database runtime is available, reproduce production's migration
history through `20261101000000`, install the already-present push objects without
recording their pending version IDs, then replay the four pending migrations in
order. Use synthetic accounts only. Validate grants, constraints, indexes, triggers,
economy/reward acceptance and resulting history. This remains a production-like
schema rehearsal, not a restore drill or a production-data upgrade test.

## Completed isolated upgrade rehearsal — November 13, 2026

After rebooting into the installed kernel and starting Docker, the rehearsal ran
successfully with `tests/integration/local/rehearse-production-upgrade.mjs`.

- Reused the existing local Supabase PostgreSQL image `17.6.1.167` (production is
  `17.6.1.166`), without downloading another image or modifying the local app DB.
- Copied **schema-only local Auth DDL**, never user rows or production data.
- Created an isolated, labeled container with network `none`, no published ports,
  a 1 GiB memory limit and a two-CPU limit.
- Replayed the 39 baseline migration versions with the legacy canonical product
  installation, matching production's stored product source hash.
- Installed the push objects without their version receipts to reproduce the
  observed live migration-history mismatch.
- Applied all four pending migrations in order and recorded their versions in the
  disposable database. Replaying existing push definitions succeeded.
- Verified all migration versions, preservation of a nonempty synthetic profile
  fixture, real Garden reward assertions on legacy messaging, public-event SQL
  assertions, and selected direct-table privilege denials.
- An initial harness run used the shared native-UUID demo seed on legacy messaging
  and failed before upgrade. The harness now uses a minimal synthetic fixture rather
  than changing application seed behavior. Both attempt containers were cleaned.
- Final log: `/tmp/opencode/pebble-production-rehearsal.log` (temporary local file).

Run again while the local Supabase database is available:

```sh
node tests/integration/local/rehearse-production-upgrade.mjs
```

The script removes its own named container and anonymous volumes in `finally`, on
success or ordinary failure. It prints the exact emergency cleanup command if the
process is interrupted. No bind mounts or named volumes are created, and no Docker
prune commands are used. No rehearsal containers remain. The pre-existing eleven
local Supabase containers were left running, so Docker was deliberately not stopped.

**Limits:** this is a synthetic schema-upgrade rehearsal, not a production clone,
backup restore drill, real-account authentication test or proof against all manual
drift. Only a synthetic profile fixture was fingerprinted for preservation, not every
application table. Pending production migrations still have **not** been applied.
Backup/recovery and the remaining release gates must be addressed before approval.

## Local deployment safeguards prepared

These changes are local on `chore/production-readiness`; they have not changed the
deployed pipeline or any provider settings.

- `scripts/deploy-api.sh` now uses update-style environment/secret flags for both
  environments. Production releases will preserve unrelated runtime settings,
  rather than replacing them. Explicit removal/rotation still needs a reviewed
  operation; preservation is not full desired-state configuration management.
- `scripts/check-production-recovery.mjs` checks the production backup inventory.
  It fails closed on API errors, malformed inventory, missing/stale recovery points
  or an incorrect target. It accepts a completed managed backup within 24 hours or
  enabled PITR with an ordered recovery window whose latest point is within 24 hours.
  Unknown backup statuses and future timestamps do not pass.
- The production deployment workflow runs this gate before Edge Function deployment,
  database migrations, canonical schema installation, Auth configuration or API/site
  deployment. Sandbox behavior remains unchanged. CI override does not bypass it.
- `pnpm test:deployment` now includes the new recovery/migration audit unit tests.
  All 16 deployment-related tests passed, along with focused lint and diff checks.
- Running the recovery gate against live production correctly refused permission
  because no qualifying recovery point exists. This read-only check did not create
  a backup or perform a restore.

### Recovery work still requiring approval/access

The gate deliberately supports managed recovery metadata only. A separately verified
external-backup strategy would require an explicit reviewed integration, not a generic
environment-variable bypass. Enabling paid PITR, exporting private production data,
or changing subscription/billing is not authorized by this preparation work.

Before first production migration:

1. Confirm a backup/PITR plan, retention and acceptable RPO/RTO with the operator.
2. Establish a recent recoverable backup and verify its completion.
3. Restore to an isolated target; verify schema, authorization and representative
   application data with appropriately restricted access, then clean up the target.
4. Record restore evidence and approval. The automated metadata gate alone cannot
   establish that a restore works, nor does a database backup necessarily include
   external storage objects or authentication/provider configuration.
5. Obtain explicit approval for the production migration/deployment.

## Environment credential verification

Authenticated Supabase key inventory was used to populate the legacy service-role
credential in the ignored owner-only `.env.prod` file. Credential values were not
printed, committed, or passed to a frontend build. The existing credentials in
`env.android` and `env.android-dev` match neither project's current service-role
credential returned by the provider; their source/validity remains unverified.
Those files were not overwritten or used as production credential sources.

Production Maps browser/server keys and location signing secret remain blank:
Google Cloud CLI/credentials are unavailable here, and GitHub production variables
do not contain a browser Maps key. Maps storage approval remains false, and quota
remains unset pending an explicit production decision. No Google Cloud secrets,
restrictions, IAM policies, provider keys, or runtime settings were changed.

### Google Cloud inventory after local login

Read-only inspection of project `cse416-meet-people` found:

- The Maps browser key permits `https://localhost/*`, local development origins
  and the sandbox mobile domain; it is not a separately provisioned production key
  and does not permit the public production website. Its value was not copied into
  `.env.prod` as a dedicated production credential.
- The non-sandbox Maps server key is restricted to two fixed IP addresses. The
  production Cloud Run revision has no VPC/network egress annotations, so it cannot
  be assumed to use either allowed address. No real provider request was sent.
- Secret Manager has only sandbox Maps server/signing secret resources. There are
  no separately named production Maps server or location-signing secrets.
- The production API currently has only Supabase environment values and its
  service-role secret reference; Maps activation is not configured.

Production Maps therefore needs provisioning, not just copying existing values.
Prepare a dedicated browser key and a server-key/static-egress design, a separate
location-signing secret and narrowly scoped runtime permissions. Confirm billing,
quotas and storage approval before activation. Browser keys authorize WebView
referrers, not package signatures; sharing `https://localhost` does not isolate
production from sandbox. These infrastructure changes require explicit approval.

## Approved production Maps provisioning — November 13, 2026

The operator approved dedicated production keys, a signing secret and static
outbound networking, including potential networking cost. Created in Google Cloud
project `cse416-meet-people`:

| Resource | Name / restriction |
| --- | --- |
| VPC | `pebble-production-egress` (custom mode) |
| Subnet | `pebble-production-egress-us-east4`, `10.84.0.0/26`, Private Google Access enabled |
| Regional address | `pebble-production-egress-ip`, `34.145.222.184`, `us-east4` |
| Router | `pebble-production-egress-router` |
| Cloud NAT | `pebble-production-egress-nat`, only the production subnet, manual reserved IP |
| Browser API key ID | `pebble-production-maps-browser`; Maps JavaScript only; `https://localhost/*`, `https://pebble.garden/*`, `https://cse416-meet-people.web.app/*` |
| Server API key ID | `pebble-production-maps-server`; Places/Geocoding only, restricted to `34.145.222.184` |
| Server-key secret | `pebble-google-maps-server-key-production`, version `1` |
| Signing secret | `pebble-search-location-signing-key-production`, version `1`, independently generated 32 random bytes encoded as hex |

The API runtime identity `pebble-api@cse416-meet-people.iam.gserviceaccount.com`
has `roles/secretmanager.secretAccessor` on each of these two secrets individually.
No project-wide IAM grant was added. No existing sandbox key was modified.

Verified key restrictions, runtime secret access, signing-secret format and
owner-only ignored `.env.prod` permissions. The three formerly empty Maps/signing
credential fields are populated from these resources, without printing their values.
The application quota remains unset and storage approval remains false.

**Provisioned is not activated.** The API was not deployed or attached to the new
VPC; no production database writes were performed. Its ready revision remains
`pebble-api-00008-bdr`. Still required before activation:

1. Review storage/privacy compliance and choose the application/provider quotas.
2. Securely install the same signing bytes in production's
   `location_private.map_signing_key` using a private parameterized connection.
   Do not put the bytes into committed SQL or CI logs.
3. Configure the release to use the versioned production secrets and attach the
   production VPC/subnet with all-traffic egress. The IP-restricted server key is
   expected to fail from a laptop or from the current unattached API revision.
4. Wire the production public browser key into the approved mobile build pipeline;
   local env files are not automatically loaded by hosted CI.
5. Verify provider reachability and actual installed-app behavior after approval.

### Cost and teardown

Reserved external IPv4, NAT and Secret Manager may incur charges even before app
activation; no dollar cap was configured. Google Maps provider quotas are shared at
the project level unless separately configured. Separate keys do not guarantee
separate billing or strict app identity.

These cloud resources are persistent, unlike the cleaned-up rehearsal container.
To retire them, first confirm no API revision or release uses the credentials or
network, then remove only the production NAT, router, subnet, VPC and reserved
address above; delete/revoke the two dedicated API keys and two production secrets
only after checking database signing-key/preview implications. Do not delete shared
project services, sandbox resources or the production Supabase credential.

The local SDK, provisioning helper/journal and authentication state remain entirely
inside ignored `.gcloud-local/`. No application build or deployment was triggered.

## Backup options and cost review — November 13, 2026

Rechecked the live backup API: no listed recovery points, PITR disabled. Organization
`pebble` is accessible, but the CLI organization listing does not expose subscription
or billing details; the current plan has **not** been verified.

Current official published options:

- Pro starts at USD 25/month per organization and includes seven days of daily
  backups. Compute is per project, with USD 10/month organization compute credit.
  Two Micro projects would ordinarily total about USD 35/month before additional
  usage/taxes. This is an example, not an inspected bill or guaranteed quote.
- Seven-day PITR adds about USD 100/month **per project** (USD 0.137/hour) on a paid
  plan. Fourteen days is about USD 200/month, 28 days about USD 400/month.
- Daily backups can lose up to approximately one day's changes. PITR documentation
  describes up to approximately two minutes RPO; actual restore duration must be
  measured. PITR latest timestamps can lag on an idle DB without implying lost data.
- Database backups do not include Storage API object bytes or external provider
  configuration. Current profile image bytes live in the database, but other
  storage usage needs separate inventory.

For a budget-conscious initial release, Pro daily backups plus a tested pre-release
recovery process may be acceptable **if the operator accepts the data-loss window**.
PITR is preferable for lower data-loss tolerance but is not a universal launch policy
requirement. No subscription, paid feature, backup export or restore was initiated.

Next operator check: organization Billing and production Database > Backups in the
Supabase Dashboard. If already on Pro, investigate missing backups rather than
buying a duplicate upgrade. Do not restore over production for the drill: restore
to an approved isolated target and include its temporary compute cost in approval.

Sources: https://supabase.com/pricing and
https://supabase.com/docs/guides/platform/backups (retrieved November 13, 2026).
