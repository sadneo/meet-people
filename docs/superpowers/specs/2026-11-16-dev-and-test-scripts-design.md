# Developer and test scripts: one `dev`, few tests, zero port collisions

## Why

`package.json` grew one script per task (69 today). A developer actually needs
three things: bring the whole local stack up, run the kinds of test that exist,
and not think about ordering. Worktrees and parallel agents must never collide
on a port or a database, and must never test another checkout's code.

## Goals

- `pnpm dev` starts everything a developer needs, in one labelled terminal.
- `pnpm dev --help` lists what it starts and what each part requires;
  `pnpm dev --check` runs the existing read-only doctor.
- Tests grouped by what they need: nothing / mocked browser / a real local
  Supabase / a hosted site.
- No fixed host port anywhere in dev or tests. Any number of `pnpm dev`, test
  and agent runs, in any worktrees, can run at once.
- Works with Docker and with rootless Podman (with or without a `docker` shim).
- CI runs the same commands a developer runs; no CI-only test steps.

## Non-goals

- Changing production deploy steps beyond the script names they call.
- Changing what any existing test asserts.
- Upgrading the Supabase CLI.

## Anti-goals

- A test that passes because it reached another worktree's server or database.
- A launcher that silently skips a required part.
- Weakening any local-only safety guard (they generalise from "port 54321" to
  "the loopback URL of this run's own stack").

## Approaches considered

1. **OS-assigned free ports + one Supabase per worktree for `dev`, one
   temporary Supabase per integration run.** Chosen.
2. Everything in compose with a private network per run. Rejected: needs
   Supabase's self-hosted compose next to the CLI config, and podman-compose
   differs from docker compose.
3. Fixed port blocks per worktree. Rejected: slots run out and leak on crashes.

## Design

### Ports

A shared helper `scripts/lib/ports.mjs` gets `n` distinct ports by binding
`n` sockets to port 0 on 127.0.0.1 at once, reading them, then closing them all.
Services start immediately and bind strictly (Vite already uses `strictPort`;
Express fails on `EADDRINUSE`). If any bind fails, the launcher retries with a
fresh set (3 attempts).

Every server the launcher or a test starts is verified before use: the API's
`/api/health` echoes `PEBBLE_RUN_ID` from its environment and Vite serves the
same id at `/__pebble/run-id` in dev and in the isolated test config. A
mismatching answer is treated as a failed start.

`pnpm dev` first tries the familiar ports (web 3000, API 3001, mobile 3002,
Supabase 54321+) for the first checkout to start, and records whatever it got
in `.pebble/dev.json` (gitignored) so the next `pnpm dev` in that worktree
reuses them when free.

### Containers

`scripts/lib/containers.mjs` (and `scripts/supabase.sh`) choose the engine
once: the Podman socket when present (as today), CLI `docker` if on PATH,
otherwise `podman`. Every raw `docker …` call in scripts and tests goes
through it. No hardcoded container names: the database container is
`supabase_db_<project_id>`, derived from the current stack.

### Supabase stacks

The project id and ports are passed to the Supabase CLI via `SUPABASE_PROJECT_ID`
and `SUPABASE_*_PORT` (verified with CLI 2.117 on Podman).

- **Dev stack:** `pebble-<worktree-slug>`, long-lived, one per worktree.
- **Test stack:** `pebble-test-<run-id>`, created by `pnpm test:integration`,
  with studio, mailpit, logflare, vector, imgproxy, edge-runtime, supavisor and
  postgres-meta excluded. Torn down on exit and on signals. Teardown removes
  containers, volumes and network by the `com.supabase.cli.project` label
  because `supabase stop` fails to prune volumes on Podman.
- **Reaper:** each test run first removes `pebble-test-*` stacks whose owner
  pid (recorded in a container label / state file) is no longer alive.

A shared helper `scripts/lib/stack.mjs` exposes the current stack
(`{ projectId, apiUrl, dbContainer, keys }`) from environment set by the
launcher, falling back to `.pebble/dev.json` for one-off scripts (demo tools)
run in the worktree. All local-only guards compare against
`stack.apiUrl` instead of the literal `http://127.0.0.1:54321`.

### Per-stack credentials (my call)

The development-login account and the event-group worker credentials live in
`~/.local/share/pebble/<project_id>/` instead of directly in
`~/.local/share/pebble/`, because each stack is a separate database. All the
existing file checks (owner, mode 0600, no symlink, size, strict keys) stay.

### `pnpm dev`

Starts, in order, with labelled output (`concurrently`):

| Part | Required | Requires |
| --- | --- | --- |
| Supabase dev stack (reused when running) | yes | Docker or Podman |
| `.env.local` (written only when missing; Supabase values are passed by env, so stale values never matter) | yes | Supabase running |
| Web, mobile, API | yes | `pnpm install` |
| Edge functions (all) | optional | `supabase/.env` |
| Event-group worker (watch) | optional | worker credentials for this stack |

Required parts missing → stop with the requirement named. Optional parts
missing → one "skipped X: needs Y" line. Ctrl-C stops app processes; the
Supabase dev stack keeps running (`pnpm supabase stop` stops it).

### Scripts (69 → about 18)

| Script | Replaces |
| --- | --- |
| `dev` | `dev`, `dev:web`, `dev:mobile`, `dev:api`, `dev:groups`, `env:local`, `doctor`, `dev:doctor`, `supabase:functions:serve*` |
| `build`, `build:web`, `build:mobile`, `build:api` | `build:*:devtools` (set `VITE_DEV_TOOLS=true` inline) |
| `android` (`--dev`) | `android`, `android:dev`, `build:android`, `build:android:dev`, `android:dev-user` |
| `typecheck`, `lint` | — |
| `test` | `test`, `test:unit`, `test:doctor`, `test:alt`, `test:deployment`, qa-real-users tests |
| `test:browser` | — (now on free ports) |
| `test:integration` | `test:integration*`, `test:browser:built`, `test:demo-populate`, `supabase:check`, `supabase:start:matching`, CI's inline SQL steps |
| `test:hosted <url> [--account\|--product\|--messaging]` | `test:hosted*` |
| `verify` | typecheck + lint + `test` |
| `supabase` | `supabase:start`, `:stop`, `:reset` (passthrough with engine + stack env) |
| `db:types` | `supabase:types` |
| `demo <action>` | `demo:*`, `events:images`, `matchmaking:active:once`, `dining:scrape`, `dining:preview` |
| `hosting:configure` | — |

Dropped: `start:*`, `preview*` (production calls `node dist/...`), `dev:alt`
(documented as `node src/alt/serve.mjs`), `dev:remote` (folded in as
`pnpm dev --remote`), `scripts/apply-android-changes.mjs`.

### CI

`ci.yml`: quick = install, `pnpm verify`, image build; browser = unchanged;
integration = install, Playwright install, `pnpm test:integration`; the `CI`
aggregate job is unchanged. `prepare.yml` uses inline `VITE_DEV_TOOLS=true`.
`release.yml` only changes `test:hosted` invocations if needed.
`test:integration` prints a labelled section per check so CI logs stay readable.

## Calls made after the builder check

- **Existing data is kept.** The main checkout (where `.git` is a directory)
  keeps project id `meet-people` and the credential files directly in
  `~/.local/share/pebble/`. Linked worktrees use `meet-people-wt-<slug>` and
  `~/.local/share/pebble/<project_id>/`. Test stacks are `meet-people-test-<run-id>`.
- **Auth redirects on any port.** `config.toml` allows
  `http://127.0.0.1:*/**` and `http://localhost:*/**`; `site_url` is set per
  stack through `SUPABASE_AUTH_SITE_URL`.
- **`test:integration` default** runs everything that works on a standard
  stack: type-drift check, SQL contract files from CI, local auth and schema
  replay, demo scenarios, and built-app browser tests (it builds first).
  `--matching` additionally starts the separate matching-profile stack and runs
  the matching HTTP check. The disposable-container browser journey
  (`playwright.integration.config.ts`) needs hand-built fixtures that no script
  creates; it stays a documented manual command, not a script.
- **`verify`** = typecheck, lint, `test`, build (keeps today's build step).
  `test` includes `test:deployment` (no services; it builds into `dist/`).
- **No container socket** → `pnpm dev` stops and names what to start
  (`systemctl --user start podman.socket` or Docker). It does not start it.
- **`pnpm dev --remote`** = today's `dev:remote`: no local stack, web + API
  against the hosted project in `.env`.
- **`pnpm test:hosted <url>`** with no flag = today's smoke check only (what
  `release.yml` runs). `--account`, `--product`, `--messaging` opt in.

## Left to the builder

- Exact module layout under `scripts/lib/`.
- Whether `demo` is a dispatcher script or a `tsx` entry with subcommands.
- Updating README.md, tests/README.md and docs that reference removed scripts.
