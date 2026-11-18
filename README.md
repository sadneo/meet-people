# Pebble / Meet People

A student social app for finding friends, dates and campus events. On the `wiring`
branch, the alternate Pebble design is the default frontend, connected to the
existing backend. See [frontend integration](docs/FRONTEND-WIRING.md),
[design authority](docs/DESIGN.md), and [route plan](docs/UI-PLAN.md).

## Hosting

Production: https://pebble.garden. See [deployment and hosting](docs/deployment.md)
for sandbox domains, setup, releases, provider configuration and recovery.

## Develop

Use Node.js 22 and pnpm (the version is declared in `package.json`). Local Supabase
requires Docker or rootless Podman. Nix users can install the declared development
tools with `nix develop`.

```sh
pnpm install --frozen-lockfile
pnpm dev --help   # what pnpm dev starts and what each part requires
pnpm dev --check  # read-only diagnostics
pnpm dev
```

`pnpm dev` starts this worktree's own Supabase stack (reused when already running)
and the web, mobile and API servers on free ports, then prints their URLs. The
first checkout to start tries the familiar ports (web 3000, mobile 3002, API 3001);
every other worktree gets its own Supabase project and ports, so any number of
checkouts can run at once. Optional edge functions start when `.env` exists; the
event-group worker creates its own local credentials. Ctrl-C stops the app
processes; `pnpm supabase stop` stops the Supabase stack.

Configuration: copy `.env.example` to `.env` (gitignored) and fill in only what you
need; every key is optional. Local Supabase URLs and keys never go in a file: `pnpm dev`
passes them to everything it starts, and `pnpm demo`, `pnpm android --dev` and
`pnpm supabase` find the running stack themselves. A new worktree copies `.env` from the
main checkout on its first `pnpm dev`. Public hosted values live in `shared/targets.json`;
commands that touch a hosted project need `--target sandbox|production`.

`pnpm dev:mobile` is for the Android emulator only: it starts this worktree's Supabase,
worker, functions and the API on fixed port 3100, with no web servers. It is not meant for
browsers; see [Android dev mode](docs/ANDROID-DEV-MODE.md).

`pnpm dev --check` checks local tools, configuration, ports, this worktree's Supabase
database and core RPC signatures. It never installs packages, starts services, signs
in, applies migrations, resets data or prints configuration values. Optional Maps,
development-login metadata and worker-schema checks do not verify live provider,
account or worker readiness. Occupied app ports are warnings, not failures. Use
`pnpm dev --check --json` for structured results. Failures exit 1; warnings alone
exit 0. Diagnostics target only this worktree's local database, never a configured
remote backend.

Both frontends proxy `/api` to the same local API.

To test this branch against a hosted Supabase project, run
`pnpm dev --remote --target sandbox|production` and open the `/messages` URL it prints.
It needs that target's `*_SUPABASE_SERVICE_ROLE_KEY` in `.env`, ignores local
`VITE_*` settings and runs the branch's API on a free port. Install the realtime and
typing migrations on that project first; see
[messaging activation and manual testing](docs/messaging-realtime.md#test-against-remote-supabase).
With the remote test app running and the Supabase CLI logged in,
`pnpm test:hosted <url> --messaging --target <t>` runs the production acceptance check with temporary
accounts and automatic cleanup. It writes `test-results/remote-messaging-report.json`.

Web (`src/web/App.tsx`) is the desktop-first public website: a demo-matched landing
page, event browsing and legal pages. It has no Sign in link. Until an app listing exists, the
Android badge opens Google Play's general store; the iOS badge is non-interactive.
Web hosts no authentication forms or private destinations. Mobile (`src/mobile/App.tsx`) is the application,
used by Capacitor Android and the browser preview. Signed-out startup opens login;
returning sessions pass through account readiness to Garden or onboarding.

The browser requires `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. The server requires its existing Supabase URL,
public key and server-only service-role credentials as appropriate. Locally `pnpm dev`
supplies all of these; see [environment handling](.env.example). Never expose private
keys through `VITE_*`. Android builds set `VITE_API_BASE_URL` themselves.

Sign in with a real Supabase account and complete the four persisted onboarding
chapters. The loopback-only development sign-in still uses the existing separately
provisioned account; it does not seed data or bypass authentication. See
[development setup](docs/development-onboarding.md) and
[local schema prerequisites](docs/demo-matchmaking-readiness.md).

`pnpm dev` applies new local migrations on start, and gives an empty local database
its migrations and seed. If the CLI rejects the migration history (for example after
a migration was renamed), it warns and still starts; fix it with
`pnpm supabase migration repair` or `pnpm supabase db reset`. Missing optional
capabilities display unavailable states.
The new frontend does not change deployed Auth, database or hosting configuration.

Active SQL inputs live in [`supabase/schema-sources/`](supabase/schema-sources/README.md).
Its guide explains source ordering, generated migrations, and deployment hashes.

## Verify and build

```sh
pnpm verify             # lint, test, build (build typechecks first)
pnpm test               # unit, script, deployment and alt checks; needs nothing running
pnpm test:browser       # mocked-API browser tests on free ports
pnpm test:integration   # real local Supabase on a temporary stack, torn down afterwards
pnpm test:hosted <url>  # smoke check of a deployed site (--account, --product, --messaging opt in; they need --target)
```

Browser tests use synthetic API/session fixtures. `pnpm test:integration` starts its
own Supabase stack and built app on free ports, so it never touches `pnpm dev`'s
database. See [test commands](tests/README.md). Current full-lint limitations are
recorded in [the integration notes](docs/FRONTEND-WIRING.md).

The website builds to `dist/web`, mobile to `dist/mobile`, and the server to `dist/api`
(`pnpm build`, or `build:web`, `build:mobile`, `build:api`). Production runs the compiled
output with `node dist/api/api/server.js`. `pnpm android` builds mobile using the
existing Android environment mode and syncs it to Capacitor (`--dev` builds the
skip-login variant). Prefix `VITE_DEV_TOOLS=true` to `build:web` or `build:mobile` for the devtools variants.
Releases from `dev` publish web to `web.dev.pebble.garden` and mobile to
`mobile.dev.pebble.garden`, both using `pebble-sandbox`. Releases from `main`
publish web to `pebble.garden` using `pebble-production`.
For hosting setup, use [the deployment runbook](docs/deployment.md).

For labeled local test users, messaging, Dating and event-group queues, run
`pnpm demo populate --dry-run` to preview, then `pnpm demo populate` to populate
60 contacts around the existing development login and fill all upcoming event
queues with labeled test contacts. Run `pnpm dev` in a
separate terminal to match event queues using saved interests and availability,
without Gemini or external scoring. See [demo data](docs/demo-data.md) for
scenario logins, reruns and the required activated local backend.

## Integration boundaries

Accounts, profile facts/photos, preferences, Friends/Dating matching, events,
connections, messages and safety actions use existing APIs. Friends checks are
manual and return one person at a time. Dating discovery requires its own explicit
consent. Saved notification preferences do not prove notification delivery.

Garden now has an account-backed economy; see [Pebble earning and activation](docs/PEBBLE-ECONOMY.md). Weekly scene history remains device-local. The earlier demo’s simulated plans,
group growth, account export/deletion and support delivery are not presented as
working backend operations. Policy pages provide the contact for manual requests.
