# One `.env` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eight env files with one gitignored `.env` plus committed `shared/targets.json`.
**Architecture:** Local values come from the running stack (`scripts/lib/stack.mjs`); public hosted values from
`shared/targets.json`; secrets from `.env`, loaded with `process.loadEnvFile` / `parseEnv`. A small
`scripts/lib/targets.mjs` resolves a required `--target` for the three hosted commands.
**Tech Stack:** Node 22 ESM scripts, `node:test`, Vitest, Vite 8, Supabase CLI 2, Capacitor 8.
**Spec:** `docs/superpowers/specs/2026-11-17-single-env-design.md`

## Global Constraints
- pnpm only. CI workflows unchanged. No new dependencies.
- `--target` values: exactly `sandbox` | `production`; required where it exists; no default.
- Prefixed secrets: `SANDBOX_SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`.
- Android dev API port: `3100`.

## Review Focus
- `.env` missing entirely: `pnpm dev` must still start (all secrets optional) — `loadEnvFile` only if it exists.
- `--target` missing or misspelled on a hosted command: usage error, no network call.
- Prefixed key missing for the chosen target: clear error naming the variable.
- Port 3100 busy on `pnpm dev:mobile`: clear error, nothing started.
- A local `.env` `VITE_*` value must not reach a hosted Android build (`envDir: false`).

---

### Task 1: targets
- Create `shared/targets.json`, `scripts/lib/targets.mjs`, test `tests/scripts/targets.test.mjs`.
- Produces: `hostedTarget(args: string[], secrets: Record<string,string>) => { name, supabaseUrl, supabasePublishableKey, supabaseProjectRef, apiBaseUrl, androidMapsKey, serviceRoleKey? }`
  (throws `Usage: --target sandbox|production` when missing/invalid); `readSecrets(root) => Record<string,string>` (parsed `.env` or `{}`);
  `withoutTarget(args) => string[]`.
- Tests: missing target throws; `--target staging` throws; `--target sandbox` returns sandbox ref `wixdiotkntapwrbibaom` and `SANDBOX_SUPABASE_SERVICE_ROLE_KEY`; `--target=production` form not supported (only `--target X`).

### Task 2: local dev
- `scripts/dev.mjs`: load `.env` when present; functions part ready on `.env`, `--env-file .env`; drop `env` part and `ensureLocalEnv`;
  `copySecrets` default `['.env']`; `--android` mode (API on 3100, worker + functions, no web/mobile servers; fails if 3100 busy);
  `--remote` passes remaining args to `run-remote-messaging.mjs`. `scripts/supabase.mjs` loads `.env`. `package.json` adds `"dev:mobile": "node scripts/dev.mjs --android"`.
- Tests in `tests/scripts/dev.test.mjs`: copySecrets on `.env`; functions need `.env`; `--android` parts are api/worker/functions with api port 3100; help lists parts.

### Task 3: `.env.local` readers
- Remove `--env-file-if-exists=.env.local` from `test-built.mjs`, `demo.mjs`, `android.mjs`; `.claude/skills/qa/scripts/qa-browser.mjs` uses `requireStack`;
  `tools/qa-real-users/config.mjs` reads `.env`; messages in `dev/development-login.ts`, `tests/integration/local/test-events-live.mjs`; `.envrc` = `use flake`;
  delete `scripts/write-local-env.mjs`.

### Task 4: doctor
- `scripts/doctor.mjs`: read `.env` only; warn `legacy-env:<file>` for each legacy file; drop stack-derived URL/key checks; ports from env only.
- Tests in `tests/doctor.test.mjs` updated: legacy file warns; `.env` unreadable fails `env-file:.env`; browser-secrets and maps still checked.

### Task 5: Android
- `capacitor.config.ts` cleartext = `process.env.CAP_CLEARTEXT === '1'`; `vite.mobile.config.ts` `envDir: false`.
- `scripts/build-android-dev.mjs` builds env from the stack + `android-dev-account.json`; `scripts/create-android-dev-user.mjs` generates/stores credentials;
  `scripts/android.mjs` `--dev` runs user creation first, hosted build requires `--target`; `build-android-release.mjs` uses `targets.production`.

### Task 6: hosted tooling
- `run-remote-messaging.mjs` main builds configuration from `hostedTarget`; `test-hosted.mjs` requires `--target` for check flags and passes env;
  `test-hosted-messaging.mjs` reads `process.env`; `configure-hosted.mjs` refuses unless `CI=true`; `package.json` drops `.env.hosting.local`.

### Task 7: docs and examples
- Rewrite `.env.example`; delete `.env.android.example`, `supabase/.env.example`; update README and docs that name old files.

### Task 8: verify
- Migrate this worktree (`supabase/.env` → `.env`, delete `.env.local`); `pnpm lint`, `pnpm test`, `pnpm typecheck`; run `pnpm dev` and `pnpm dev:mobile`, hit email check, dev login, Google redirect.
