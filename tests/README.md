# Testing

Run commands from the repository root. Use pnpm exclusively.

| Directory | Command | Boundary |
| --- | --- | --- |
| `tests/unit/` | `pnpm test:unit` | Vitest logic, React components/hooks, mocked transports and source-contract checks |
| `tests/browser/` | `pnpm test:browser` | Playwright UI journeys against isolated Vite source on port 3194 |
| `tests/integration/` | `pnpm test:integration` | Real local Supabase Auth/account persistence and disposable PostgreSQL schema replay |

`pnpm test` aliases `test:unit`. `pnpm verify` runs typecheck → lint → unit tests
→ build. Neither command runs browser, integration or hosted checks.

## Unit tests

```sh
pnpm test:unit
pnpm test:unit tests/unit/unified-account-readback.test.tsx
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
pnpm supabase:start
pnpm test:integration
pnpm test:integration:auth
pnpm test:integration:schema
```

The default suite runs two existing checks sequentially:

- Local Auth creates two disposable users, verifies authentication, recovery,
  onboarding/account persistence and isolation, then removes the users.
- Schema replay reads only Auth DDL from `supabase_db_meet-people`, starts a
  separate network-none PostgreSQL container and removes it afterwards.

Docker-compatible tooling and the local Supabase stack must already be available.
The runner does not reset the local database, provision demo accounts, load hosted
credentials or invoke hosted checks.

Additional existing checks remain explicit:

| Location / command | Prerequisites |
| --- | --- |
| `pnpm test:browser:built` | Builds web/API, starts local servers on 3100/3101, runs only `tests/integration/built/`, then stops servers |
| `pnpm test:integration:browser` | Real Express/SQL journey; requires the existing guarded offline database fixture named in `tests/integration/offline/disposable.ts` |
| `tests/integration/offline/` | Individual API/SQL/race harnesses; each retains its original disposable database/container guards |
| `tests/integration/sql/` | SQL acceptance sources and fixtures; run only against their documented target/schema prerequisites |
| `tests/integration/local/` | Additional explicit local-service scripts; inspect each script's environment/service prerequisites before running |
| `pnpm test:hosted <https-origin>` | Opt-in deployed-site smoke check |
| `pnpm test:hosted:account` | Opt-in hosted account/browser check; retains legacy onboarding expectations |
| `pnpm test:hosted:product` | Opt-in hosted product/API check; optional real browser login when an executable path is supplied |

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
`main` and `dev`. Releases run that same suite against the resolved source SHA;
manual overrides require an explicit reason. See the
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
