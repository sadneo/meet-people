# One `.env` file

## Why
Eight env files (`.env`, `.env.local`, `supabase/.env`, `.env.android`, `.env.android-dev`, `.env.prod`,
`.env.hosting.local`, `.env.development*`) confuse developers. Most hold either generated local values (which
go stale: `.env.local` kept a dead port) or public hosted values. Goal: a developer's whole setup is
`cp .env.example .env` (fill in what you need) and `pnpm dev`.

## Goals
- `.env` (gitignored) is the only env file anyone creates. It holds secrets only.
- Public per-target values are committed in `shared/targets.json`.
- Local stack values are read from the running stack, never written to a file.

## Non-goals
- CI (`release.yml`, `prepare.yml`) is unchanged; it keeps reading GitHub Actions variables/secrets.
  `targets.json` duplicates the public ones; unifying is a follow-up.
- `.android-signing/` (release keystore) stays as is.
- Historical `qa/runs/*/scratch` scripts are not updated.

## Anti-goals
- No secret may reach a browser bundle or APK. Mobile Vite builds use `envDir: false` and get only explicit values.
- `build-android-release.mjs` keeps its production-endpoint checks.
- No command an agent runs locally may reach a hosted project without naming it.

## Approaches
- **A. One `.env` + committed public targets (picked).** Fewest files; secrets in one place.
- B. `.env` + `supabase/.env`: keeps the Supabase CLI default location; still two files.
- C. Only delete generated files: least churn, leaves deploy files.

## Decisions
### `.env` contents (see `.env.example`, every key commented)
- Local, unprefixed: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Supabase Google OAuth), `TICKETMASTER_API_KEY`,
  `INGEST_TOKEN`, optional Maps/push keys (`VITE_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_SERVER_API_KEY`,
  `GOOGLE_MAPS_STORAGE_APPROVED`, `GOOGLE_MAPS_REQUESTS_PER_DAY`, `SEARCH_LOCATION_SIGNING_KEY`, Firebase).
- Hosted, prefixed by target: `SANDBOX_SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`.

### Hosted targets
- `--target sandbox|production` exists only on commands run locally against a hosted project:
  `pnpm dev --remote`, `pnpm test:hosted <url> --account|--product|--messaging`, `pnpm android` (hosted build).
- It is **required** there: no default, no inference from URL or `DEPLOY_ENVIRONMENT`.
- Public values come from `shared/targets.json[target]`; the service-role key from `<TARGET>_SUPABASE_SERVICE_ROLE_KEY`,
  passed to children under the unprefixed names the code already uses.
- `test:hosted <url>` without a check flag (the CI smoke check) is unchanged and takes no target.

### `hosting:configure` is CI-only
- Refuses unless `CI=true`. `.env.hosting.local` is deleted with no replacement.
- No secrets need moving: unset `INGEST_TOKEN`/`EMBED_SHARED_SECRET` keep existing vault values (or generate on the
  first run); unset `GEMINI_API_KEY`/`TICKETMASTER_API_KEY` leave existing function secrets untouched.

### `shared/targets.json`
From the GitHub environment variables. Each target: `supabaseUrl`, `supabasePublishableKey`, `supabaseProjectRef`,
`apiBaseUrl`, `androidMapsKey`. Sandbox `apiBaseUrl` is `https://mobile.dev.pebble.garden` and its `androidMapsKey`
is sandbox's `VITE_GOOGLE_MAPS_API_KEY`. Production `apiBaseUrl` is `https://pebble.garden`; its `androidMapsKey`
is null until the owner fills it in (the release build refuses null).

### Local
- `pnpm dev` / `pnpm supabase` load `.env` into the process environment (`process.loadEnvFile`), so
  `supabase start` resolves `env(GOOGLE_CLIENT_ID)` and the API/functions get the keys. Functions run with `--env-file .env`.
- `copySecrets` copies `.env` from the main checkout into a new worktree.
- `.env.local` readers use the stack (`childEnv`/`stackKeys`/`currentStack`) or `.env`; `scripts/write-local-env.mjs`
  is deleted; `.envrc` keeps `use flake` only.
- `pnpm dev --check` reads `.env` only and warns for each legacy file found: move its secrets to `.env`, delete it.

### Android
- `pnpm dev:mobile`: Android-dev only. This worktree's stack, the worker, functions and the API on fixed port
  **3100** (fails clearly if taken). No web servers. Documented as not for browser use.
- `pnpm android --dev`: ensures the emulator login exists (generated email/password stored as
  `android-dev-account.json` in the stack's credentials dir), then bundles `VITE_API_BASE_URL=http://10.0.2.2:3100`,
  `VITE_SUPABASE_URL=http://10.0.2.2:<stack API port>`, the stack's publishable key and the login.
  Cleartext comes from `CAP_CLEARTEXT=1`, the only thing `capacitor.config.ts` reads.
- `pnpm android --target <t>` and the release build read `targets.json`.

### Deleted
`.env.local`, `supabase/.env`, `.env.android`, `.env.android-dev`, `.env.prod`, `.env.hosting.local`,
`.env.android.example`, `supabase/.env.example`, `scripts/write-local-env.mjs`.
