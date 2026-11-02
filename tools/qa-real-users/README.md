# Two real users, one removable QA directory

This harness uses the **already installed** Node, pnpm, Supabase CLI, Docker,
Playwright/Chromium and application dependencies. It does not install packages,
download browsers, change global agent settings, write your normal `.env.local`,
or reset your development database. k6 and Hermes are not required.

The initial implementation supports **Linux** (process birth-time verification
uses `/proc`). Other contributors need the project's usual `pnpm install`, a
running local Docker engine and an existing compatible Playwright Chromium.
Preflight reports missing prerequisites; it never installs them silently.

The only persistent source integration outside this directory is the root ESLint
configuration, which recognizes these Node files. No dependency/lockfile changes
are needed.

## What lives where

```text
tools/qa-real-users/                 reusable code and tester prompts
/tmp/opencode/pebble-qa/<run-id>/     ALL run-generated host files (outside Git, 0700)
    manifest.json                   ownership + process birth times + image baseline
    stack/supabase/                  disposable config and migration snapshot
    cache/, tmp/, config/, data/     redirected application/CLI/browser caches
    actors.json, runtime.json       private credentials (0600; never publish)
    control/                        private browser-control tokens
    agents/a/, agents/b/             screenshots, action logs, findings, traces
    logs/, smoke-results.json       startup/service logs and browser journey results
```

Docker additionally stores this run's containers, volumes, network and image
layers in Docker's existing data directory. They are not extra project folders
to hunt down. The purge command manages them by their exact project ownership.
Existing application files, dev credentials, dev containers and other projects
are never cleanup targets. Run artifacts can contain secrets, especially traces
and Supabase startup logs. The entire run directory is private and ignored by Git.

## Start

From the repository root:

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs preflight
pnpm exec tsx tools/qa-real-users/cli.mjs up --count 100
```

`up` prints a run ID. Copy it for the commands below. The default QA app is
`http://127.0.0.1:3300`, API `3301`, browser controllers `3302/3303`, Supabase
`55421` and Mailpit `55424`. A different `--slot 1` (0–9) reserves a different
explicit port block. Occupied ports cause failure, not termination of existing apps.

The stack uses a unique project ID and JWT secret, its own native UUID schema,
local email confirmations and a custom Docker network bound to **127.0.0.1**.
Unneeded Studio/analytics/edge-runtime containers are excluded. No hosted provider
credentials are inherited. Browser traffic is restricted to this run's origins
unless explicitly opting in to Google Maps with `--maps` (see below).

`--count 100` means **98 background profiles + two fresh UI users**, not 100
concurrent browsers or agents. The two UI users are never pre-created, confirmed,
signed in or onboarded by the fixture adapter. Background fixtures may be
operator-created and use existing seed factories. Counts 4–100 are supported;
at least 8 total accounts are needed for the three background demo-event scenarios.
500 accounts and performance/load testing are deliberately a later milestone.

## Optional 100 actual UI-created users (separate run)

Keep the existing `up --count 100` run for **98 fixtures + two independent AI
testers**. Use a **second isolated run** for 100 actual UI-created accounts:

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs up --count 100 --ui-users 100 --slot 1
pnpm exec tsx tools/qa-real-users/cli.mjs batch UI_RUN_ID --pairs 1
pnpm exec tsx tools/qa-real-users/cli.mjs batch UI_RUN_ID --pairs 4 --resume
pnpm exec tsx tools/qa-real-users/cli.mjs status UI_RUN_ID
pnpm exec tsx tools/qa-real-users/cli.mjs report UI_RUN_ID
```

`--ui-users` defaults to 2 and must be even, 2–100 and no greater than `--count`.
Background fixture count is `count - uiUsers`. With both set to 100, **no
background auth accounts, profiles, social/event fixtures or demo location seed
are created**. Schema migrations still run; explicitly enabled Maps signing may
configure its private signing key, never an account, consent or location. The
private plan generates fictional credentials/personas only, not registered users.
All 100 UI users share this one run's database; batches never reset/reseed it.

Batch mode (`uiUsers > 2`) does not start browsers at `up`. `batch` starts only
controllers A/B for the next fixed pair and runs their journeys sequentially:
real registration → local email-link confirmation → logout → password login →
every onboarding chapter → enter app → profile display-name edit/save → full
page reload and saved-value assertion → logout. Both contexts are closed between
pairs. API/web/Supabase stay running. `--pairs` defaults to **one**, accepts 1–50,
and means a bounded number of **sequential pairs**, never simultaneous users.
Names, usernames and ages vary deterministically; every actor chooses the three
provided interests Coffee, Art and Music. This is scripted coverage, **not 100
autonomous AI agents**, visual review, concurrency or load testing.

`agents/user-001/` through `agents/user-100/` retain separate evidence and separate
300-action budgets. Private `batch-plan.json` fixes identity/role/ordinal;
`actors.json` contains only the assigned pair. No arbitrary actor paths or session
injection are accepted. `batches/pair-001/results.json` etc. preserve per-pair
checkpoints without overwriting previous pairs; `batch.json` persists incremental
per-user stages and pair state. Status/report show planned UI/background counts,
completed/failed/untouched states, and explicitly limited coverage. Planned counts
are not a claim that those accounts have already been created.

After any successful pair, a further invocation needs explicit `--resume`.
Only a contiguous prefix of fully completed pairs can be skipped. A failed pair
stops the entire invocation immediately; the second registration is not attempted
if the first actor fails. Failed/running/partial states or an existing pair/user
evidence directory **refuse replay**, even if registration may not have happened.
An interrupted command leaves its active pair ambiguous: use `stop UI_RUN_ID` to
close owned browsers/services, preserve the evidence, and investigate. Do not
edit progress, delete evidence or re-register those identities to force resume.
There is intentionally no automatic repair/retry/recovery command. A run paused
cleanly between completed pairs can continue with `batch ... --resume` while
services stay up; local-only stopped runs can use `up UI_RUN_ID` first.
`smoke`, `agent` and `brief` are rejected for batch runs to prevent untracked
registration; they remain unchanged for the existing two-user mode.

**Coverage limitation:** discovery opt-in/setup, skip/undo/request, dating,
messaging, event queues and other social journeys are **not scripted by batch**.
An empty discovery pool or disabled Maps is not silently seeded/bypassed and is
not reported as a discovery pass. Use the separate two-agent run for exploratory
coverage, and report that separately from the 100-account scripted pass. Live
Linux acceptance (November2026) passed100/100 scripted UI journeys in one
database, with read-only counts confirming100 registered/verified accounts and
completed profiles. This used the finite QA auth limits below, not normal
production-rate throughput. Screenshots were sampled, not exhaustively reviewed.

### Local email/signup limits

For batch projects only, generated `stack/supabase/config.toml` sets finite
`[auth.rate_limit]` values: `email_sent=300`, `sign_in_sign_ups=300`,
`token_verifications=150`. These are **QA-only settings for this isolated project**;
no global/hosted config changes and no limit is disabled. Real email confirmation
stays enabled and the default per-recipient email frequency stays unchanged.
The current [Supabase CLI config reference](https://supabase.com/docs/guides/cli/config)
(checked November 2026) describes email sends per hour (SMTP-dependent), signup/
sign-in requests and token verifications per five-minute interval per IP, and
local SMTP/Mailpit delivery. Actual local enforcement depends on the installed
CLI/Auth version; a 429 is retained as a failure, not retried, reset or bypassed.
The application email-lookup endpoint separately defaults to **10 checks/IP per
10 minutes** (each signup/password-login journey needs two). Batch services
explicitly set `QA_AUTH_EMAIL_REQUESTS_PER_WINDOW=300` and `QA_RUN_ID`; the API
accepts this finite override only in development with a valid QA run ID and an
isolated loopback QA Supabase port. Production, normal development and ordinary
two-agent runs retain the default. Its global1000-check backstop is unchanged.
These rates are not product throughput claims. Start with one pair, inspect its
evidence, and continue in small operator-controlled batches.

## Choose deterministic smoke or AI exploration

For a deterministic first check:

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs smoke RUN_ID
```

This types through the real email-first registration flow, confirms each actor's
local email, logs out, signs in with a password, and completes every onboarding
chapter for A and B. It saves checkpoints and never injects a session, mocks a
response, admin-confirms those users, or clicks **Sign in as dev**. A failure keeps
evidence and does not repair data or bypass the failed step. Smoke is **not** a
full visual review or a claim that every button works. It runs once per fresh run;
use a new run to repeat fresh registration. Browser sessions remain open afterward.

To use two AI testers, ask the existing coding assistant to launch two separate
tester agents, each with its own brief:

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs brief RUN_ID a
pnpm exec tsx tools/qa-real-users/cli.mjs brief RUN_ID b
```

The harness does **not** install or silently launch a paid LLM engine. The two
browser controllers are not themselves AI agents. They let two agents in your
existing assistant safely control different real sessions. Agents A/B follow
`agent-a.md` / `agent-b.md` and `coverage.md`. They are report-only: no fixes,
commits, database access, package installs, or production actions. If smoke ran
first, they continue from its real UI-established sessions and document which
journeys smoke already covered; otherwise they register through the UI themselves.

## Browser-controller actions

Read the current page and inspect the returned PNG with an image-capable tool:

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs agent RUN_ID a look
```

Other actions are JSON on stdin; no passwords belong in command arguments:

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs agent RUN_ID a <<'JSON'
{"method":"credential","field":"email","target":{"label":"Email"}}
JSON
```

| Method | Arguments / behavior |
| --- | --- |
| `persona` | Own fictional name, username, birthdate/email and peer's name; never passwords |
| `goto` | `path` within this run's app |
| `look`, `screenshot` | Accessibility snapshot, masked PNG, sanitized URL and recent problems |
| `click` | `target` |
| `fill` | `target`, `value` for ordinary form values |
| `credential` | `field`: email/password/confirm; types the private credential in a real UI control |
| `check` | `target`, optional `checked` |
| `select` | `target`, `value` |
| `upload` | `target`, `file: "avatar.png"`; only this run's fixture is accepted |
| `key` | `key`, optional `target` |
| `scroll` | `y`, optional `x` |
| `viewport` | Integer `width`, `height` between 240 and 2560 |
| `wait` | `target`, optional `state` and bounded `timeout`, or an app-relative `url` |
| `assert-value` | `target`, `value`; compare a real input's current value after a UI reload |
| `email` | Reads only the actor's local inbox and opens a validated local confirmation link |
| `coverage` | `coverage: {feature, scenario, status, evidence, notes}`; use `phase: "ready-for-social"` for handoff |
| `peers` | Read-only peer coverage, not their credentials or session |
| `finding` | `finding: {id, severity, title, steps, expected, actual, screenshot}` |
| `finish` | Close that actor's browser, preserving its trace |

Targets use one of `{role, name, exact?}`, `{label, exact?}`, `{text, exact?}` or
`{selector}`. Hidden Discover cards require a `:visible` selector. There is no
arbitrary JavaScript evaluation, API-write command, arbitrary file upload or token
injection action. Each actor has a 300-action safety budget; reporting remains
available after exhaustion. Controller ports require private bearer tokens and
are loopback-only. Expected validation/rate limits are not automatically bugs.

## Inspect, report, stop, resume

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs list
pnpm exec tsx tools/qa-real-users/cli.mjs status RUN_ID
pnpm exec tsx tools/qa-real-users/cli.mjs report RUN_ID
pnpm exec tsx tools/qa-real-users/cli.mjs log RUN_ID api
pnpm exec tsx tools/qa-real-users/cli.mjs stop RUN_ID
pnpm exec tsx tools/qa-real-users/cli.mjs up RUN_ID
```

`stop` saves browser traces, terminates owned processes and stops only the QA
containers. Data and evidence remain. `up RUN_ID` resumes the stored database
with fresh browser contexts; users sign back in through the UI, not cached-token
injection. Resume appends action/findings/coverage history, continues screenshot
numbering, and writes a distinct trace per browser session. The 300-action budget
is per actor/run and does not reset on resume. Agents must independently reproduce/deduplicate findings before
calling them confirmed. `report.json` includes blocked/uncovered areas and does
not turn console messages into automatically confirmed bugs.

Event queue join/leave can be tested, but the optional event scoring worker is
not started by this first harness; a waiting queue must not be called a successful
proposal/chat. Real-device behavior and unavailable account-export/deletion
features remain out of scope.

### Optional real Google Maps

Maps are disabled by default. To enable paid Maps calls, stop the run and resume
with `up RUN_ID --maps`. This reads only `VITE_GOOGLE_MAPS_API_KEY`,
`GOOGLE_MAPS_SERVER_API_KEY` and `GOOGLE_MAPS_STORAGE_APPROVED=true` from the
repository's private `.env.local`; development database settings are never loaded.
Keys are copied to private runtime state and removed by purge. Browser traffic is
allowed only to the explicit Maps API/static and Google Fonts hosts in addition
to the local services. Google sign-in remains blocked. The server Maps budget is
100 requests per API process/day by default. To explicitly authorize another
bounded server limit use `up --count 100 --ui-users 100 --maps --maps-budget 300`
(add `--slot 1` if another run is active). `--maps-budget` accepts integers 1–1000
only with `--maps`; the limit is stored in private `runtime.json` and preserved
through all browser pair rotations (also reused on a Maps-enabled resume unless
explicitly changed). Batch never restarts API/web to reset the counter, and once a
paid batch starts it refuses continuation after an API process identity change.
Do not restart the API or change budgets to evade quota. The underlying app
counter is process/day scoped, not a durable billing ledger; this is not a Google billing cap and does not cover browser map
loads. Configure billing alerts and API/referrer restrictions in Google Cloud.
Every resume requires `--maps` again to opt in; `up RUN_ID` returns to local-only.

## Remove everything from a run

Preview exact targets first if desired:

```sh
pnpm exec tsx tools/qa-real-users/cli.mjs purge RUN_ID --images --dry-run
pnpm exec tsx tools/qa-real-users/cli.mjs purge RUN_ID --images
```

This closes owned browser/app/setup processes, removes this project's containers,
database/photo volumes and network, verifies they're gone, then deletes the
**one** run directory. Failed/interrupted runs use the same command; stale
operation locks are recovered only when the original process birth time is gone.
Ownership mismatch fails closed and retains the manifest for investigation.

`--images` only removes image references used by this run whose image IDs were
absent before it started and which are not used by another container. Shared or
pre-existing images stay. There is no global prune or `--all`. Docker/OS metadata
and your assistant's own conversation logs are outside this harness's ownership;
purge is not byte-for-byte restoration of the entire laptop. Unattributable image
downloads from an interrupted Docker pull are not globally pruned.

Once every run is purged, only this reusable source directory remains; purge also
removes the runtime parent if it is empty. The runtime root is deliberately short
because Chromium's Unix socket paths cannot fit under a deep repository checkout.
There are no randomly scattered browser profiles to hunt down. To remove the
tooling too, delete this source directory and remove its ESLint glob.
No new system package needs uninstalling.

## Checks

```sh
node --test tools/qa-real-users/*.test.mjs
pnpm exec eslint tools/qa-real-users/*.mjs
```

These safety tests do not start Docker or mutate a database. A separate live
acceptance run must verify startup, both real-user journeys, stop/resume and purge
while checking that the existing development stack remains unchanged.
