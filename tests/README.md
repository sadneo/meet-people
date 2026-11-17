# Testing

Run commands from the repository root. Use pnpm exclusively.

| Directory | Command | Boundary |
| --- | --- | --- |
| `tests/unit/` | `pnpm test` | Vitest logic, React components/hooks, mocked transports and source-contract checks |
| `tests/browser/` | `pnpm test:browser` | Playwright UI journeys against isolated Vite source on a free port |
| `tests/integration/` | `pnpm test:integration` | A temporary local Supabase stack: types, SQL contracts, Auth/account persistence, schema replay, built app |

`pnpm test` runs Vitest, the Node tests (`tests/scripts`, doctor, deployment,
migration audit, recovery, `tools/qa-real-users`) and the alt-frontend check. It
runs no browser, integration or hosted checks and needs no services.

## Unit tests

```sh
pnpm test
pnpm exec vitest run tests/unit/unified-account-readback.test.tsx
pnpm exec vitest list --config vite.config.ts --filesOnly
```

Vitest discovers only `tests/unit/**/*.test.{ts,tsx}`. Fixtures stay beside their
tests. In-memory HTTP servers with mocked downstream services belong here too;
they do not require a real database.

## Browser tests

```sh
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:browser tests/browser/wiring.spec.ts
pnpm test:browser --list
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an installed Chromium instead.
The runner starts `vite.isolated.config.ts`, loads no env files, starts no API
server and supplies no real Supabase client. Tests provide source-module/API
fixtures. Tests needing an authenticated app must install those fixtures explicitly.
`playwright.isolated.config.ts` remains a compatibility alias for this same suite.

## Integration tests

```sh
pnpm test:integration              # needs Docker or Podman
pnpm test:integration --matching   # also the matching-profile stack (needs python)
```

Each run starts its own temporary Supabase stack (`meet-people-test-<id>` on free
ports) and removes it on exit, Ctrl-C or SIGTERM, so parallel worktrees and agents
never share a database. A `kill -9` leaves the stack for the next run to reap.
It never touches the `pnpm dev` stack. Sections print as `== <name>`, later
sections still run after a failure, and a PASS/FAIL table ends the run:

| Section | What it checks |
| --- | --- |
| `db types` | `src/types/database.ts` matches `supabase gen types` (fix: `pnpm db:types`) |
| `sql contracts` | `tests/integration/sql/` seed-messaging, hosted-services, dining-menus, sbengaged-month-sync |
| `local auth` | two disposable users: sign-up, login, recovery, onboarding/account persistence and isolation |
| `schema replay` | Auth DDL from the stack's database replayed into a separate network-none PostgreSQL |
| `built app` | builds, then `tests/integration/built/` against the built web + API on free ports |
| `matching` | `--matching` only: `test-matching-http.mjs` on a second stack |

Additional existing checks remain explicit:

| Location / command | Prerequisites |
| --- | --- |
| `node scripts/test-browser.mjs --config playwright.integration.config.ts` | Real Express/SQL journey; requires the existing guarded offline database fixture named in `tests/integration/offline/disposable.ts` |
| `tests/integration/offline/` | Individual API/SQL/race harnesses; each retains its original disposable database/container guards |
| `tests/integration/offline/demo-scenarios.ts` | Currently out of date with the demo seed; not run by `test:integration` |
| `tests/integration/sql/` | SQL acceptance sources and fixtures; run only against their documented target/schema prerequisites |
| `tests/integration/local/` | Additional explicit local-service scripts; they resolve the stack from `PEBBLE_SUPABASE_PROJECT_ID` and `PEBBLE_SUPABASE_URL`, else `.pebble/dev.json` (`pnpm dev`) |
| `pnpm test:hosted <https-origin>` | Opt-in deployed-site smoke check |
| `pnpm test:hosted <https-origin> --account` | Opt-in hosted account/browser check; retains legacy onboarding expectations |
| `pnpm test:hosted <https-origin> --product` | Opt-in hosted product/API check; optional real browser login when Chromium is on PATH |
| `pnpm test:hosted <https-origin> --messaging` | Opt-in hosted messaging check |

The hosted account/product scripts use administrative credentials and create
disposable users. Supply the target and credentials explicitly in the process
environment or ignored `.env.hosting.local`; ordinary suites never run them.

For an already-running local production build:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 pnpm exec playwright test --config playwright.built.config.ts
```

Built-app tests never intercept `/src/supabase.ts`; source-mocked tests are never
selected by the built runner. Results use separate `test-results/` subdirectories.

## CI and historical reports

`.github/workflows/checks.yml` calls the reusable `ci.yml` suite for PRs into
`dev` only. PRs into `main` must come from `dev`, and releases do not re-run
tests. See the
[deployment runbook](../docs/deployment.md#releases). No test hooks run
automatically on local commits.

Older handoff/QA reports retain historical paths and commands. Translate
`tests/<file>.test.*` to `tests/unit/`, `e2e/` to `tests/browser/`, SQL files to
`tests/integration/sql/`, and `tests/offline/` to `tests/integration/offline/`.
Use the commands above instead of retired `test:e2e`, `test:auth` and `test:built`.
The old email-link/password-toggle tests and credential browser runner were removed;
current email-first, session, callback, recovery and onboarding coverage is retained.

## Current frontend coverage

The `wiring` branch retires the previous screen implementations and their specific
UI/visual assertions. `tests/browser/wiring.spec.ts` covers the replacement UI’s
API flows, account gates, full onboarding, preference persistence, private photo
upload, consent, manual Friends queue checks, message retry idempotency, safety
and responsive navigation. Backend/client contracts and owner/session lifecycle
unit tests are retained. See `docs/FRONTEND-WIRING.md` for boundaries and lint
limitations. These mocked browser checks do not verify a deployed database.
