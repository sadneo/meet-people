# Pebble / Meet People

A student social app for finding friends, dates and campus events. On the `wiring`
branch, the alternate Pebble design is the default frontend, connected to the
existing backend. See [frontend integration](docs/FRONTEND-WIRING.md),
[design authority](docs/DESIGN.md), and [route plan](docs/UI-PLAN.md).

## Hosting

The app is live at https://cse416-meet-people.web.app. See
[HOSTING-SETUP.md](HOSTING-SETUP.md) for email delivery, deployment credentials,
Google/Gemini, billing, and outage notifications.

Custom-domain setup is pending: `pebble.garden` will serve production;
`desktop.dev.pebble.garden` and `mobile.dev.pebble.garden` will serve the sandbox
developer build. All three deploy from `main`. See [deployment setup](docs/deployment.md).

## Develop

Use Node.js 22 and pnpm (the version is declared in `package.json`). Local Supabase
requires Docker or rootless Podman. Nix users can install the declared development
tools with `nix develop`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Vite serves the app on `http://127.0.0.1:3000` and proxies `/api` to the Express
server on port 3001. The new frontend is the main app; there is no separate
alternate demo server.

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

## Verify and build

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
pnpm build:web
pnpm build:api
pnpm lint
```

Browser tests use synthetic API/session fixtures. Database and hosted checks are
separate; see [test commands](tests/README.md). Current full-lint limitations are
recorded in [the integration notes](docs/FRONTEND-WIRING.md).

The built web app is in `dist/web`; the server is in `dist/api`.
`pnpm start:api` starts the compiled API, and `pnpm preview` serves the built web app.
For existing hosting setup, use [HOSTING-SETUP.md](HOSTING-SETUP.md).

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
