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
pnpm run doctor
pnpm dev
```

`pnpm run doctor` (or `pnpm dev:doctor`) checks local tools, configuration, ports, the owned Supabase database
and core RPC signatures. It never installs packages, starts services, signs in,
applies migrations, resets data or prints configuration values. Optional Maps,
development-login metadata and worker-schema checks do not verify live provider,
account or worker readiness. Occupied app ports are warnings, not failures.
Use `pnpm run doctor --json` for structured results, or `pnpm run doctor --help` for usage.
Use the explicit `run`: bare `pnpm doctor` may invoke pnpm's own package-manager
diagnostics instead of this project's script.
Failures exit 1; warnings alone exit 0. Diagnostics target only the fixed local
`meet-people` database, never a configured remote backend.

`pnpm dev` serves the public website on `http://127.0.0.1:3000` and the API on
port 3001. Run `pnpm dev:mobile` alongside it for mobile on `http://127.0.0.1:3002`.
Both frontends proxy `/api` to the same local API.

Web (`src/web/App.tsx`) is the responsive public website: installation information,
event browsing and legal pages. Android is coming soon; iOS is planned. It has no
login or private destinations. Mobile (`src/mobile/App.tsx`) is the application,
used by Capacitor Android and the browser preview. Signed-out startup opens login;
returning sessions pass through account readiness to Garden or onboarding.

The browser requires `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. The server requires its existing Supabase URL,
public key and server-only service-role credentials as appropriate; see
[environment handling](.env.example). Never expose private keys through `VITE_*`.
Existing `.env.local` handling and Android `VITE_API_BASE_URL` support are retained.

Sign in with a real Supabase account and complete the four persisted onboarding
chapters. The loopback-only development sign-in still uses the existing separately
provisioned account; it does not seed data or bypass authentication. See
[development setup](docs/development-onboarding.md) and
[local schema prerequisites](docs/demo-matchmaking-readiness.md).

A fresh database needs the existing schema activation process. Starting the app
does not install SQL. Missing optional capabilities display unavailable states.
The new frontend does not change deployed Auth, database or hosting configuration.

Active SQL inputs live in [`supabase/schema-sources/`](supabase/schema-sources/README.md).
Its guide explains source ordering, generated migrations, and deployment hashes.

## Verify and build

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
pnpm build:web
pnpm build:mobile
pnpm build:api
pnpm lint
```

Browser tests use synthetic API/session fixtures. Database and hosted checks are
separate; see [test commands](tests/README.md). Current full-lint limitations are
recorded in [the integration notes](docs/FRONTEND-WIRING.md).

The website builds to `dist/web`, mobile to `dist/mobile`, and the server to `dist/api`.
`pnpm start:api` starts the compiled API. `pnpm preview` serves web;
`pnpm preview:mobile` serves mobile. `pnpm build:android` builds mobile using the
existing Android environment mode and syncs it to Capacitor. Both products have
optional `build:web:devtools` / `build:mobile:devtools` variants.
Releases from `dev` publish web to `web.dev.pebble.garden` and mobile to
`mobile.dev.pebble.garden`, both using `pebble-sandbox`. Releases from `main`
publish web to `pebble.garden` using `pebble-production`.
For hosting setup, use [the deployment runbook](docs/deployment.md).

For labeled local test users, messaging, Dating and event-group queues, run
`pnpm demo:populate --dry-run` to preview, then `pnpm demo:populate` to populate
60 contacts around the existing development login and fill all upcoming event
queues with labeled test contacts. Run `pnpm dev:groups` in a
separate terminal to match event queues using saved interests and availability,
without Gemini or external scoring. See [demo data](docs/demo-data.md) for
scenario logins, reruns and the required activated local backend.

## Integration boundaries

Accounts, profile facts/photos, preferences, Friends/Dating matching, events,
connections, messages and safety actions use existing APIs. Friends checks are
manual and return one person at a time. Dating discovery requires its own explicit
consent. Saved notification preferences do not prove notification delivery.

Garden remains a local creative feature. The earlier demo’s simulated plans,
group growth, account export/deletion and support delivery are not presented as
working backend operations. Policy pages provide the contact for manual requests.
