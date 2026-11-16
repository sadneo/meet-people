# Dev and Test Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `pnpm dev`, four test commands, about 18 scripts in total, and no fixed host port or shared database between worktrees, test runs or agents.

**Architecture:** Three small Node helpers (`scripts/lib/ports.mjs`, `containers.mjs`, `stack.mjs`) own port allocation, the Docker/Podman choice and Supabase stack identity. Launchers (`scripts/dev.mjs`, `scripts/test-*.mjs`) use them. Every hardcoded `54321` / `meet-people` / `supabase_db_meet-people` guard switches to the current stack from `stack.mjs`.

**Tech Stack:** Node 22 ESM (`.mjs` with a `.d.mts` for TS importers), Supabase CLI 2.117 (`SUPABASE_PROJECT_ID`, `SUPABASE_*_PORT` env overrides, verified), Vite, Playwright, `concurrently`, `node:test`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-dev-and-test-scripts-design.md`

## Global Constraints

- pnpm only; never npm/npx (`pnpm dlx` / `pnpm exec`).
- No new dependencies.
- Main checkout keeps project id `meet-people` and credentials directly in `~/.local/share/pebble/`; linked worktrees use `meet-people-<slug>` and `~/.local/share/pebble/<project_id>/`; test stacks are `meet-people-test-<run-id>`.
- Every local-only guard stays: loopback `http:` origin, no userinfo/path/query, container label `com.supabase.cli.project` equal to the expected project id. Only the literal port/name becomes the current stack's.
- Credential file checks unchanged: regular non-symlink, owner uid, mode `0600`, ≤ 8192 bytes, strict keys.
- Teardown removes containers, volumes and networks by label `com.supabase.cli.project=<id>`; `supabase stop` is not trusted (it fails to prune volumes on Podman).
- Engine: if `DOCKER_HOST` unset and `$XDG_RUNTIME_DIR/podman/podman.sock` is a socket, set `DOCKER_HOST=unix://…`; raw CLI is `docker` when on PATH, else `podman`.
- Match the surrounding terse style; no comments except non-obvious why.

## Review Focus

- Two `pnpm test:integration` runs started within the same second in two worktrees: distinct project ids, distinct ports, both pass, nothing left behind. → Task 10 final check.
- `pnpm test:integration` killed with Ctrl-C mid-start: next run's reaper removes the orphaned stack. → Task 3 test `reaps stacks whose owner pid is gone`.
- A port taken between allocation and bind: launcher retries, never talks to the foreign server (run-id mismatch). → Task 5 test `rejects a server answering with another run id`.
- `pnpm dev` with no container socket: exits 1 naming `systemctl --user start podman.socket` or Docker, starts nothing. → Task 6 test.
- `pnpm dev` in a worktree whose `.pebble/dev.json` ports are now occupied by something else: reallocates instead of failing. → Task 3 test `reallocates remembered ports that are busy`.

---

### Task 1: Port allocation

**Files:**
- Create: `scripts/lib/ports.mjs`, `tests/scripts/ports.test.mjs`

**Interfaces:**
- Produces: `freePorts(count: number, preferred?: number[]): Promise<number[]>` — tries `preferred` first (each only if bindable on 127.0.0.1), fills the rest by binding port 0; all sockets are held open until the whole set is chosen, then closed. Returns distinct ports.
- Produces: `isFree(port: number): Promise<boolean>`.

- [ ] **Step 1: Failing tests** in `tests/scripts/ports.test.mjs` (`node:test`):
  - `returns distinct ports`: `freePorts(8)` → 8 unique integers in 1024–65535.
  - `uses preferred ports when free`: pick a free port p via `freePorts(1)`, then `freePorts(2,[p])[0] === p`.
  - `skips busy preferred ports`: hold a server on p; `freePorts(1,[p])[0] !== p`.
- [ ] **Step 2:** `node --test tests/scripts/ports.test.mjs` → FAIL (module missing).
- [ ] **Step 3:** Implement with `node:net` `createServer().listen(port,'127.0.0.1')`.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(scripts): allocate free local ports`.

### Task 2: Container engine helper

**Files:**
- Create: `scripts/lib/containers.mjs`, `tests/scripts/containers.test.mjs`
- Modify: `scripts/supabase.sh` (keep socket logic; also export `SUPABASE_*` env it is given — no change needed if env passes through; verify only)

**Interfaces:**
- Produces: `engineEnv(env = process.env, { stat }?): Promise<NodeJS.ProcessEnv>` — returns env with `DOCKER_HOST` set per Global Constraints.
- Produces: `engineCli({ which }?): Promise<'docker'|'podman'>`.
- Produces: `container(args: string[], options?: { input?: string, env?: object }): Promise<string>` — runs the CLI with `engineEnv`, returns trimmed stdout, throws on non-zero.
- Produces: `containerSync(args, options?)`: same, synchronous (`execFileSync`), for existing sync callers.
- Produces: `engineReachable(): Promise<boolean>` — `container(['info'])` succeeds.

- [ ] **Step 1: Failing tests** with injected `stat`/`which`: socket present + no `DOCKER_HOST` → set; `DOCKER_HOST` already set → untouched; `which('docker')` false → `'podman'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Replace `tools/qa-real-users/docker.mjs`'s `execute('docker', …)` with `container(...)` (one line) so the QA harness also works on podman-only machines; run `node --test tools/qa-real-users/*.test.mjs` → PASS.
- [ ] **Step 6:** Commit `feat(scripts): pick Docker or Podman for container commands`.

### Task 3: Supabase stack identity and lifecycle

**Files:**
- Create: `scripts/lib/stack.mjs`, `scripts/lib/stack.d.mts`, `tests/scripts/stack.test.mjs`
- Modify: `.gitignore` (add `/.pebble/`)

**Interfaces:**
- Consumes: Task 1 `freePorts`, `isFree`; Task 2 `container`, `engineEnv`.
- Produces:
  - `devProjectId(root = repoRoot): string` — `'meet-people'` when `<root>/.git` is a directory, else `'meet-people-' + slug(basename(root))` (slug: lowercase `[a-z0-9-]`, max 40).
  - `credentialsDir(projectId: string, home = os.homedir()): string` — `~/.local/share/pebble` for `meet-people`, else `~/.local/share/pebble/<projectId>`.
  - `type Stack = { projectId: string, ports: { api, db, shadow, studio, mail }, apiUrl: string, dbContainer: string }`.
  - `stackEnv(stack: Stack): Record<string,string>` — `SUPABASE_PROJECT_ID`, `SUPABASE_API_PORT`, `SUPABASE_DB_PORT`, `SUPABASE_DB_SHADOW_PORT`, `SUPABASE_STUDIO_PORT`, `SUPABASE_INBUCKET_PORT`, `PEBBLE_SUPABASE_PROJECT_ID`, `PEBBLE_SUPABASE_URL`.
  - `devStack(root?): Promise<Stack>` — reads `.pebble/dev.json`; if the stack's db container is running, reuse its recorded ports; else reuse remembered ports that are all free, else `freePorts(5, [54321,54322,54320,54323,54324])`; writes `.pebble/dev.json` (mode 0600).
  - `testStack(runId: string): Promise<Stack>` — project `meet-people-test-<runId>`, `freePorts(5)`.
  - `startStack(stack, { minimal?: boolean, workdir?: string, siteUrl?: string }): Promise<{ apiUrl, publishableKey, anonKey, serviceRoleKey }>` — runs `sh scripts/supabase.sh [--workdir] start [-x studio,mailpit,logflare,vector,imgproxy,edge-runtime,supavisor,postgres-meta]` with `stackEnv` + `SUPABASE_AUTH_SITE_URL`; then parses `status --output json`. When `minimal`, labels the run owner by writing `/tmp/opencode/pebble-stacks/<projectId>.json` `{ pid: process.pid }` (falls back to `os.tmpdir()`).
  - `removeStack(projectId): Promise<void>` — `rm -f` containers, `volume rm -f`, `network rm` by label; tolerates none.
  - `reapTestStacks(): Promise<string[]>` — for each distinct `com.supabase.cli.project` label starting `meet-people-test-` whose owner file's pid is not alive (or missing), `removeStack`; returns removed ids.
  - `currentStack(root?): Stack | null` — sync; from `PEBBLE_SUPABASE_PROJECT_ID`/`PEBBLE_SUPABASE_URL` env, else `.pebble/dev.json`, else null. Used by one-off scripts and guards.
  - `assertLocalStack(url: string, stack: Stack): void` — throws unless `new URL(url).origin === stack.apiUrl` and URL has no userinfo/path/query/hash.
  - `stack.d.mts` declares the above for TS importers (`tsconfig` has `allowJs: false`).

- [ ] **Step 1: Failing tests** (pure parts, injected fs/`container`):
  - `main checkout keeps meet-people`, `worktree gets slugged id` (`/x/Pebble Friend_UI` → `meet-people-pebble-friend-ui`).
  - `credentialsDir` both cases.
  - `stackEnv` exact keys/values for a fixed Stack.
  - `reallocates remembered ports that are busy`: dev.json with a busy port → new ports written.
  - `reaps stacks whose owner pid is gone`: fake `container` listing labels `meet-people-test-a` (owner pid 1 alive? use `process.pid` alive) and `meet-people-test-b` (pid 999999 dead) and `meet-people` → only `-b` removed; `meet-people` never touched.
  - `assertLocalStack` rejects `http://127.0.0.1:54321` when stack is on another port, rejects userinfo/path.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Real check:** `node -e "import('./scripts/lib/stack.mjs').then(async s=>{const t=await s.testStack('selfcheck');console.log(await s.startStack(t,{minimal:true}));await s.removeStack(t.projectId)})"` → prints keys; afterwards `docker ps -a --filter label=com.supabase.cli.project=meet-people-test-selfcheck -q` is empty and no volume/network with that label remains.
- [ ] **Step 6:** Commit `feat(scripts): per-worktree and per-run Supabase stacks`.

### Task 4: Supabase config accepts any local port

**Files:**
- Modify: `supabase/config.toml` (`[auth] site_url = "env(SUPABASE_AUTH_SITE_URL)"` only if the CLI substitutes it — otherwise rely on the `SUPABASE_AUTH_SITE_URL` env override and leave `site_url`; `additional_redirect_urls` add `"http://127.0.0.1:*/**"`, `"http://localhost:*/**"` and keep existing entries)

- [ ] **Step 1:** Edit config.
- [ ] **Step 2: Verify:** start a minimal test stack (Task 3 helper) and `curl -s "$API/auth/v1/settings"` returns 200; run `node tests/integration/local/test-local-auth.mjs` against it after Task 7 lands — for now verify only that the stack starts with the edited config. Remove the stack.
- [ ] **Step 3:** Commit `chore(supabase): allow auth redirects on any loopback port`.

### Task 5: Servers prove which run they belong to

**Files:**
- Modify: `api/index.ts:80` (health returns `{ status: 'ok', run: process.env.PEBBLE_RUN_ID }` when set; extend `HealthResponseSchema` in `shared/` with optional `run: string`)
- Modify: `vite.config.ts`, `vite.isolated.config.ts` — tiny plugin serving `GET /__pebble/run` → `process.env.PEBBLE_RUN_ID ?? ''` (dev server and preview server)
- Create: `scripts/lib/wait.mjs`, `tests/scripts/wait.test.mjs`

**Interfaces:**
- Produces: `waitForRun(url: string, runId: string, { timeoutMs = 60000 }): Promise<void>` — polls `url` (JSON `run` field or plain text) until it equals `runId`; throws `Another server is answering on <url>` immediately on a mismatching non-empty id, and on timeout.

- [ ] **Step 1: Failing tests:** `waitForRun` against an in-process HTTP server returning the right id → resolves; returning `other` → rejects with `/Another server/`; existing `tests/unit` health tests still pass.
- [ ] **Step 2–4:** Run → FAIL, implement, run `node --test tests/scripts/wait.test.mjs` and `pnpm exec vitest run --config vite.config.ts` → PASS.
- [ ] **Step 5:** Commit `feat: health and dev servers report their run id`.

### Task 6: Guards and credentials follow the current stack

**Files (every one listed by `git grep -nE "54321|supabase_db_meet-people|seedContainer|'meet-people'" -- scripts dev tests tools`):**
- Modify: `scripts/demo-seed/plan.ts` (`seedContainer` → getter from `currentStack()`), `scripts/{seed-local-demo,seed-local-messages,seed-local-portraits,queue-local-demo,queue-local-event-demo,active-local-demo,backfill-local-event-images,run-local-event-groups,start-local-demo-api}.{ts,mjs}`, `scripts/local-worker-diagnostics.ts`, `dev/development-login.ts`, `dev/provision-development-account.ts`, `scripts/doctor.mjs`, `tests/integration/local/*.mjs`, `tests/integration/offline/{demo-scenarios,demo-seed-real}.ts`
- Modify tests: `tests/unit/development-login-server.test.ts`, `tests/unit/development-provisioning.test.ts`, `tests/doctor.test.mjs` (inject stack instead of relying on 54321)
- Leave unchanged: Android `10.0.2.2:54321` tests (device-side guard, any port allowed there already), `tests/unit/env.test.ts`, `remote-messaging-config.test.ts`, `supabase-callback-init.test.ts` (fixtures only).

**Interfaces:**
- Consumes: Task 3 `currentStack`, `assertLocalStack`, `credentialsDir`; Task 2 `container`/`containerSync` replace raw `docker` / `execFileSync('docker', …)`.

- [ ] **Step 1:** For each file: `'meet-people'` label check → `stack.projectId`; `supabase_db_meet-people` → `stack.dbContainer`; `http://127.0.0.1:54321` equality → `assertLocalStack(url, stack)`; `join(homedir(),'.local/share/pebble')` → `credentialsDir(stack.projectId)`. When `currentStack()` is null, throw `No local stack for this worktree. Run pnpm dev first.`
- [ ] **Step 2:** `development-login.ts`: credential `url` must equal current stack `apiUrl` (replaces implicit 54321 via provisioning).
- [ ] **Step 3:** Update the three unit/doctor tests to pass a stack via env (`PEBBLE_SUPABASE_PROJECT_ID`, `PEBBLE_SUPABASE_URL`) or injection, keeping every rejection case (`http://user@…`, `/path`, remote, LAN) plus new case `rejects 127.0.0.1 on a port that is not this stack's`.
- [ ] **Step 4: Verify:** `git grep -nE "54321|supabase_db_meet-people" -- scripts dev tests/integration tests/doctor.test.mjs` → only Task 3 preferred-port list remains; `pnpm typecheck && pnpm lint && pnpm exec vitest run --config vite.config.ts && node --test tests/doctor.test.mjs tests/scripts/*.test.mjs` → PASS.
- [ ] **Step 5:** Commit `refactor: local guards use the current worktree's stack`.

### Task 7: `pnpm dev`

**Files:**
- Create: `scripts/dev.mjs`, `tests/scripts/dev.test.mjs`
- Modify: `scripts/doctor.mjs` (accept `{ stack }` and probe its ports/container instead of fixed ones; usage text → `pnpm dev --check`), `scripts/write-local-env.mjs` (export `ensureLocalEnv(keys)` writing `.env.local` only when missing; values include no port-specific data except via env at launch)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `parts(context): Part[]` (pure, testable) where `Part = { name, required: boolean, ready: boolean, needs: string, command?: string, env?: object }` for: `supabase`, `env`, `web`, `mobile`, `api`, `functions` (needs `supabase/.env`), `worker` (needs `<credentialsDir>/event-group-worker.json`).
- Produces: `helpText(parts): string` — table of part / required / requires.

Behaviour:
- `--help`: print `helpText` and exit 0. `--check`: run doctor against the dev stack, exit with its code. `--remote`: run `scripts/run-remote-messaging.mjs` with `PORT`/`API_PORT`/`VITE_PORT` from `freePorts(2)` (edit that script to read them from env, defaulting to free ports, not 3301).
- Default: `engineReachable()` false → print `Start Docker, or rootless Podman: systemctl --user start podman.socket` and exit 1. Then `devStack()` → start if not running → `ensureLocalEnv` → `freePorts(3,[3000,3001,3002])` (retry ≤3 on bind failure) → `concurrently` with names `web,mobile,api[,functions][,worker]`, env `{ ...stackEnv, SUPABASE_URL, VITE_SUPABASE_URL, keys, VITE_PORT, API_PORT, PORT, PEBBLE_RUN_ID }` per process → `waitForRun` on web/mobile/api → print the three URLs and one `skipped <part>: needs <requirement>` line per optional part not ready. Ctrl-C stops app processes only.

- [ ] **Step 1: Failing tests:** `parts` with no `supabase/.env` → `functions.ready === false` and `needs` mentions `supabase/.env`; with worker credentials present → `worker.ready`; `helpText` contains every part name; `main(['--help'])` exits 0 without touching the engine (inject); `main([])` with `engineReachable: () => false` exits 1 and prints `podman.socket`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`node --test tests/scripts/dev.test.mjs tests/doctor.test.mjs`).
- [ ] **Step 5: Real check:** `pnpm dev` in this worktree starts all parts; `curl` the printed web URL and `/api/health` → 200 with this run id. In a second shell in `/home/aidan/Projects/pebble-friend-ui`… do not touch that worktree; instead create a scratch worktree `git worktree add /tmp/opencode/pebble-dev-2 HEAD`, `pnpm install --frozen-lockfile --offline`, `pnpm dev` there → different ports, different project id, both up. Stop both; remove the scratch worktree's stack with `removeStack` and the worktree.
- [ ] **Step 6:** Commit `feat: pnpm dev starts the whole local stack`.

### Task 8: Browser and built-app tests on free ports

**Files:**
- Create: `scripts/test-browser.mjs`
- Modify: `playwright.config.ts` (port from `PEBBLE_BROWSER_PORT`, throw if unset; `webServer.command` passes `--port`; drop `PLAYWRIGHT_REUSE_SERVER`), `vite.isolated.config.ts` (port from `PEBBLE_BROWSER_PORT`), `playwright.integration.config.ts` (unchanged semantics; inherits)
- Replace: `scripts/test-built.sh` → `scripts/test-built.mjs`

**Interfaces:**
- `scripts/test-browser.mjs [playwright args…]`: `freePorts(1)` → spawn `pnpm exec playwright test --config playwright.config.ts …args` with `PEBBLE_BROWSER_PORT`, `PEBBLE_RUN_ID`; exit with its code.
- `scripts/test-built.mjs [playwright args…]` (exported `runBuilt(args, env)` for Task 9): `freePorts(2)`; start API (`node --env-file-if-exists=.env.local dist/api/api/server.js`) and `vite preview` with `PEBBLE_RUN_ID`; `waitForRun` both; run `playwright.built.config.ts` with `PLAYWRIGHT_BASE_URL`; kill both on exit/signal.

- [ ] **Step 1:** Implement; `pnpm test:browser` (old name still wired in package.json until Task 10 → call `node scripts/test-browser.mjs` directly) → PASS.
- [ ] **Step 2: Collision check:** run `node scripts/test-browser.mjs --workers=2` twice concurrently (`&`) → both PASS.
- [ ] **Step 3:** Commit `test: browser suites pick their own ports`.

### Task 9: `test`, `test:integration`, `test:hosted`

**Files:**
- Create: `scripts/test-integration.mjs`, `scripts/test-hosted.mjs`
- Modify: `tests/integration/local-services.test.mjs` (removed; its two checks move into the runner), `tests/README.md`

**`test:integration [--matching]`** (sections printed as `== <name>` and a final pass/fail table; first failure does not stop later independent sections; exit 1 if any failed):
1. `reapTestStacks()`; `runId = randomBytes(4).hex`; `testStack(runId)`; `startStack(minimal)`; `process.on('exit'|'SIGINT'|'SIGTERM')` → `removeStack`.
2. `db types`: `supabase gen types typescript --local` (stack env) → compare with `src/types/database.ts`, fail with a diff hint.
3. `sql contracts`: `seed-messaging.sql`, `hosted-services.sql`, `dining-menus.sql`, `sbengaged-month-sync.sql` via `container(['exec','-i',db,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input})`.
4. `local auth`: `node tests/integration/local/test-local-auth.mjs` with stack env.
5. `schema replay`: `node tests/integration/local/test-product-schema.mjs` with stack env.
6. `demo scenarios`: `tsx tests/integration/offline/demo-scenarios.ts`.
7. `built app`: `pnpm build` then `runBuilt([], stackEnv)`.
8. `--matching` only: second stack `meet-people-test-<runId>-m` via `scripts/start-matching-supabase.py` (edit: take workdir/project from env, start through `scripts/supabase.sh` with stack env) then `node tests/integration/local/test-matching-http.mjs`.

**`test:hosted <url> [--account|--product|--messaging]`**: no flag → `tests/integration/hosted/test-hosted.mjs <url>`; flags map to the three existing scripts with their current env-file/Chromium settings.

**`test`** (package.json only): `vitest run --config vite.config.ts && node --test tests/doctor.test.mjs tests/scripts/*.test.mjs tests/deployment.test.mjs tests/production-migration-audit.test.mjs tests/production-recovery.test.mjs tools/qa-real-users/*.test.mjs && node src/alt/tests/account-ui.check.cjs`.

- [ ] **Step 1:** Implement both runners.
- [ ] **Step 2:** `node scripts/test-integration.mjs` → all sections PASS; afterwards no `meet-people-test-*` label remains.
- [ ] **Step 3: Parallel check:** in this worktree and the Task 7 scratch worktree start `node scripts/test-integration.mjs` at the same time → both PASS, distinct project ids in output, nothing left behind.
- [ ] **Step 4: Interrupt check:** start it, `kill -INT` during "built app" → stack removed; start again, `kill -9` → next run prints the reaped id.
- [ ] **Step 5:** Commit `test: one integration command on its own temporary stack`.

### Task 10: Scripts, demo/android dispatchers, CI, docs

**Files:**
- Create: `scripts/demo.mjs` (`demo <seed|populate|queue|event|messages|portraits|active|remove|images|matchmaking-once|dining-scrape|dining-preview> [args…]` → the existing command for each, passing extra args through; unknown/none → usage listing actions, exit 1), `scripts/android.mjs` (`android [--dev] [--user]`: `--user` → create-android-dev-user; `--dev` → build-android-dev then `cap open android`; none → mobile android build, `cap sync`, `cap open`)
- Delete: `scripts/apply-android-changes.mjs`, `scripts/test-built.sh`
- Modify: `package.json` scripts to exactly:
  `dev`, `build`, `build:web`, `build:mobile`, `build:api`, `android`, `typecheck`, `lint`, `test`, `test:browser`, `test:integration`, `test:hosted`, `verify` (typecheck, lint, test, build), `supabase` (`node scripts/supabase.mjs` — thin: devStack env + `sh scripts/supabase.sh "$@"`), `db:types`, `demo`, `hosting:configure`.
- Modify: `.github/workflows/ci.yml` (quick: install, `pnpm verify`, image build; browser: `pnpm test:browser --workers=4`; integration: install, Playwright install, `pnpm test:integration`; `CI` job unchanged), `.github/workflows/prepare.yml` (`VITE_DEV_TOOLS=true pnpm build:web` / `build:mobile`), `.github/workflows/release.yml` (only if `test:hosted` invocation changed — it does not)
- Modify docs: `README.md`, `tests/README.md`, `src/alt/README.md` (`node src/alt/serve.mjs`), `docs/demo-data.md`, `docs/matchmaking-demo.md`, `docs/local-demo-messages.md`, `docs/local-demo-portraits.md`, `docs/sbengaged-images.md`, `docs/api-routes-and-security.md`, `docs/PUSH-NOTIFICATIONS.md`, `docs/ANDROID-IMPLEMENTATION-STEPS.md`, `.claude/skills/qa/**` (only command names) — every `pnpm <removed-script>` → new form. Do not rewrite historical `qa/runs/**`.

- [ ] **Step 1:** Implement dispatchers and package.json.
- [ ] **Step 2: Verify no dangling references:** for each removed script name `git grep -nE "pnpm (run )?<name>([^:a-z-]|$)" -- . ':!qa/runs' ':!docs/superpowers'` → none.
- [ ] **Step 3:** `pnpm verify` → PASS. `pnpm test:browser` → PASS. `pnpm test:integration` → PASS. `pnpm dev --help` → table. `pnpm demo` → usage, exit 1.
- [ ] **Step 4:** `pnpm exec actionlint` is not installed — instead `node -e` parse each workflow with the `yaml` package if present, else visually diff; confirm `ci.yml` job ids and the `CI` aggregate name are unchanged.
- [ ] **Step 5:** Commit `chore: trim pnpm scripts to dev, test and build essentials` and `ci: run the same commands developers run` (two commits).
