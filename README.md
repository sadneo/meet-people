# Meet People

## Requirements

- Node.js 22
- pnpm 11.25.0
- Docker-compatible container runtime (Docker or rootless Podman)
- Nix users can install the declared development tools with `nix develop`.

## Current local demo: Friends and Dating

This runbook describes the **existing, activated Arch demo**, last checked on
2026-10-19, in:

```sh
cd /home/Danuu/Projects/meet-people-worktrees/reconciled-ui-baseline
```

The local Supabase project is `meet-people` (container
`supabase_db_meet-people`), the app is **http://127.0.0.1:3006**, and the API uses
port **3001**. This is not a deployed or production-ready service. Private pages
require a real signed-in, onboarded account; the development account has normal
matching and privacy restrictions, not access to every profile.

### 1. Start the existing local stack

If these services are already running, use them; do not launch duplicate processes.
If stopped, start Supabase, then keep the API and web commands running in separate
terminals from this worktree:

```sh
# Terminal 1: start the existing local Supabase containers; preserve their data
pnpm exec supabase start

# Terminal 2: API, using only the local public key in runtime memory
node scripts/start-local-demo-api.mjs

# Terminal 3: PC browser frontend; port 3006 proxies API requests to port 3001
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_API_BASE_URL=http://127.0.0.1:3006 pnpm dev:web --port 3006
```

The browser's local public Supabase configuration and the development-user
provisioning must already exist. The API launcher does not create accounts, install
schema, or write environment files. Never copy service keys into browser variables,
README examples, or chat. Do not reset the database to prepare a demo.

**Fresh machine/database:** these launch commands alone are insufficient. The
reviewed account, safety, trusted-location, Friends, Dating and photo schema was
installed separately on this specific local database. Do not blindly replay the
candidate SQL or historical migrations over it. See the
[activation inventory and acceptance evidence](docs/demo-matchmaking-readiness.md)
and [account reconciliation order](docs/dev-account-reconciliation.md). A fresh
installation still needs a target-specific reviewed activation plan.

### 2. Prepare the fictional demo accounts

```sh
pnpm demo:seed --dry-run       # preview 50 profiles without database/network access
pnpm demo:seed                 # create/onboard 50; choose a password at the hidden prompt
```

The logins are `pebble-demo-001@example.test` through
`pebble-demo-050@example.test`, all using the password you enter. They are clearly
labelled fictional accounts with varied ages 20–34, bios, shared interests/schedules,
education/occupation/languages, Dating identities/preferences and illustrated DEMO
avatars. The first pair has an inclusive preferred age range for easier demos;
other pairs show narrower preferences. They use the reviewed Stony Brook campus
anchor, not individual GPS positions. No real messages or connections are seeded.

New accounts are **not in the Friends queue**. They **are opted into Dating**.
Default reruns preserve completed profile edits and removed photos, refresh the
fixtures' Stony Brook search references and re-enable their discovery/Dating.
Existing Friends queue memberships are preserved. Use the same password on reruns.
Only marker-owned fictional identities can be edited by these scripts.

The campus catalogue expires after seven days, and account search references also
expire. After reviewing the existing campus entry, an operator can explicitly renew
it and refresh fixture references with:

```sh
pnpm demo:seed --refresh-location
```

This does not renew the development account's own search area: select and save
Stony Brook again in each mode's preferences if needed. See
[all seed options, safety guards and rerun behavior](docs/demo-data.md), including
`--count`, `--no-photos`, and explicit profile/password reset flags.

### 3. Sign in and check the development account

Open http://127.0.0.1:3006/login and choose **Sign in as development user**.
This uses the existing operator-provisioned account and still enforces canonical
onboarding. Complete any required chapters. In Settings, enable global discovery
and the discovery setting for the mode you will show.

For each mode separately, save a **temporary Stony Brook University search area**
from the reviewed location result, and compatible distance/age preferences. City
text by itself is insufficient. The previously verified development-account setup
used ages 18–99 and 15 miles; both users' filters must permit each other. In Dating,
complete your own Dating details and clarify who to meet if prompted; start
Dating discovery separately. Pause discovery before editing enabled Dating details.
The two modes keep independent filters; interests and the usual week are shared
with Profile.

**Current ordinary-login blocker:** commit `13be71e` switched `/login` to the
email-first `AuthScreen`, whose Continue action calls `/api/auth/email`. The current
API has no matching handler. The local development-user button uses a separate
path, but ordinary email-first login/registration must not be presented as verified
working on this revision. Earlier successful password-login evidence predates this
route change. The seeder authenticates fixtures directly through real Supabase Auth;
that does not verify their current browser login. A second browser account accepting
a request is gated on repairing/re-verifying this login path. Do not bypass Auth to
work around it.

### 4. Demo Friends: queue fixtures, then manually find a candidate

Run this just before the Friends presentation:

```sh
pnpm demo:queue --count 2      # queue fictional accounts 001 and 002 for FRIENDS only
```

In the signed-in development account, open **Friends**, choose **Find Friends**,
then **Check for a match**. This uses the real persisted queue and real matching
algorithm. A check returns **at most one** eligible candidate. Two queued fixtures
do not create a group or guarantee two matches. Reciprocal ages/radii, current
trusted search areas, discovery, blocks and existing relationships still apply.
Interests and schedule overlap are softer ranking signals; no match is a valid
result. Queued fixtures need no open browser window and do not imply online presence.

```sh
pnpm demo:queue --count 1                 # queue only 001
pnpm demo:queue --start 3 --count 2       # choose 003 and 004 instead
pnpm demo:queue --count 2 --dry-run      # preview without changing anything
pnpm demo:queue --count 2 --leave        # remove only 001 and 002 from Friends queue
```

Queue commands are idempotent and do not change Dating participation. To end the
presentation, use **Cancel search** in your development account too. Seed reruns
preserve existing fixture queue memberships, so use `--leave` for each range you
queued. No automatic request, connection, chat, reward or completed match is created.

### 5. Demo Dating: discovery, candidate and request

Switch to **Dating**, confirm/save the Dating preferences described above, then
choose **Start Dating discovery** if not already enabled and **Find someone**.
There is **no Dating queue command**: eligible opted-in accounts are discovered
independently of Friends. Candidates must meet reciprocal identity/target, age,
distance, adult, location, discovery and safety rules. Not all 50 profiles will be
eligible for the development account.

Show the candidate's permitted profile fields, interests and demo avatar. Use
**Skip for this visit** to look again, or **Send connection request** to persist a
real request. A sent request is not an accepted match. The recipient must sign in
separately and accept in **Messages / Connections**; this browser step currently
has the ordinary-login gate above. The scripts never auto-accept for the recipient.
Previously, two real signed-in accounts completed candidate → request → recipient
acceptance → saved connection readback locally. That proves the backend flow, not
that the newly changed login screen has been revalidated.

Use **Pause Dating discovery** to stop your own participation. `demo:queue --leave`
has no effect on Dating. Default `demo:seed` reruns opt the fixtures back into Dating.

### What can and cannot be presented

| Feature | Demo status / boundary |
| --- | --- |
| Development-user sign-in and canonical onboarding | Previously exercised with the real local account; current source retains the separate development button. Recheck before presenting after the login route change. No guest bypass. |
| Friends preferences, real queue and manual candidate | Verified with real local accounts and the script integration test. At most one eligible candidate per check; no group-ready/completed-match story. |
| Dating preferences, consent and reciprocal candidate discovery | Verified with real signed-in local accounts and seeded fixtures. Current trusted areas and mutual eligibility required. |
| Dating request and recipient acceptance | Real local request/acceptance/persisted readback passed before the login route change. Sending requires a real eligible recipient; a fresh two-browser presentation is gated on ordinary login repair/re-verification. |
| Fictional population and queue scripts | Six focused tests and actual two-account Auth/SQL/readback/matcher checks passed. Full 50-account creation/load has not been executed; run the seed before rehearsing. |
| Profile/settings, shared interests/week and independent mode filters | Canonical save/readback exercised for the demo subset. Do not claim every settings feature or cross-surface privacy policy is fully certified. |
| Shared profile photo displayed on Dating | Implemented; actual seeded private JPEG readback passed. Owner editor/state and isolated upload/remove lifecycle passed. User-supplied upload/removal through the current local UI still needs rehearsal. One shared photo, not a separate Dating gallery. |
| Chat send/read, live block/report actions | Implemented contracts have bounded isolated tests; these actions were not exercised with the retained real demo relationship. Do not present them as live-demo verified. |
| Downtime/background matching, multi-person groups, ready states, notifications, plans and rewards | Outside the verified demo. Downtime/group/post-match lifecycle remains deferred; no claim of a background worker, delivery, rewards or completed group match. |
| Google sign-in, arbitrary geocoding, production/remote/mobile distribution | Not activated or verified by this local demo. Stony Brook search-area distance is not live device tracking or realtime presence. |

Before presenting, rehearse Friends and Dating with the actual current filters and
at least one fresh eligible recipient. Existing accepted connections, blocks, expired
locations, opted-out profiles or incompatible preferences can remove candidates;
adding more fixtures does not override these rules. Never delete real history or
weaken authorization to force a match. See [detailed acceptance and remaining live
checks](docs/demo-matchmaking-readiness.md); its earlier chronological login notes
are superseded by the current-login warning above.

## General development setup

For dependencies on a fresh checkout, use `pnpm install --frozen-lockfile` (or enter
`nix develop` first on Nix). The general `pnpm dev` command defaults to web port3000
and API3001; use the explicit commands above for the current port3006 demo. The
Supabase wrapper supports a rootless Podman socket when available. Schema activation
and reset commands are not routine demo setup or proof of integration readiness.

## Environment

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public | Supabase project URL for the browser client. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key for the browser client. |
| `SUPABASE_URL` | Server-only | Supabase URL for privileged API operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase service-role key for privileged API operations. |
| `PORT` | Server-only | API listening port; defaults to `3001`. |

`pnpm env:local` writes public browser values and private API values to ignored `.env.local`. The API development command loads this file. Never expose the service-role key through a `VITE_*` variable.

The authenticated events UI is available at `/events`. Do not blindly apply pending
account migrations during reconciliation. See [the events backend guide](docs/events-backend.md)
for sign-in, persistent event groups, verification, and later prototype merging.

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

The app requires verified Auth and four persisted onboarding chapters: explicit
identity, at least three interests, social intent, then birthdate/city/availability
and distance/group choices. There is no guest preview or automatic queue entry.
See [accounts](docs/accounts.md), [access policy](docs/app-access.md) and the guarded
[DEV account runbook](docs/development-onboarding.md). Google is not activated.
The current local activation and real-account evidence are described above. Source
checks or disposable DB tests alone do not establish readiness for a different target.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Parent runs isolated mocked browser suites and reviews screenshots. Real Auth
scripts (`pnpm test:auth`), services, resets, schema installation and provider calls
are separate operations requiring approval, not part of these source-only checks.

Install a browser once when Playwright has not already provisioned one:

```bash
pnpm exec playwright install chromium
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an already installed browser.
For example, in PowerShell:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm test:e2e
```

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
