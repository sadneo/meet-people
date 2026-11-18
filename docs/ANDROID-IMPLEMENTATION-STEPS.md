# Implementing the Android changes (start here)

This bundle adds, in one go: a hosted-backend setup for the Android app, in-app account deletion, push
notifications, an Android "Skip login (dev account)" mode, and fixes for your local Supabase. Detailed guides:
`ANDROID-REMOTE-BACKEND.md`, `PUSH-NOTIFICATIONS.md`, `ANDROID-DEV-MODE.md`.

Commands below are for **Git Bash** (the Supabase scripts need `sh`). Docker Desktop must be running.

## 1. Put the files in place
Work on a clean branch: `git status` should show nothing pending.
```
git switch -c android-all-changes
unzip -o ~/Downloads/android-all-changes.zip        # or:  tar -xf ~/Downloads/android-all-changes.zip
git status                                          # review what changed
```
The zip changes 12 existing files of yours and adds the rest. If you applied my earlier bundles, a few files from them
(docs, scripts, tests, one migration) are simply replaced by their newest versions. Nothing else is touched.

## 2. Package scripts and dependencies
```
pnpm add @capacitor/push-notifications google-auth-library
```
Commit `pnpm-lock.yaml` too: the Dockerfile installs with a frozen lockfile.

## 3. Database (local)
`config.toml` and `seed.sql` changed, so restart and rebuild:
```
pnpm supabase stop
pnpm supabase start
pnpm supabase db reset        # rebuilds the local database: migrations + fixed seed. This wipes local data.
pnpm dev
```
To keep your local data instead of resetting, run the fix and the two push migrations by hand (all are safe to repeat):
```
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/fix-local-auth-tokens.sql
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261104060000_push_notifications.sql
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261104060100_push_accepted_and_match.sql
```
(`supabase_db_meet-people` comes from `project_id` in `supabase/config.toml`.)

## 4. Dev-mode account and settings
Nothing to create: `pnpm android --dev` (step 6) generates the dev login and points the build at this
worktree's stack. For the emulator, run this in its own terminal (Supabase, worker, functions and the API on
port 3100; no web servers):
```
pnpm dev:mobile
```

## 5. Checks
```
pnpm typecheck
pnpm test        # the new tests should pass; other failures may already exist in your repo
node src/alt/tests/account-ui.check.cjs
```
If `pnpm lint` complains about `src/alt/`, add `src/alt/**` to the ignores in `eslint.config.js`.

## 6. Run it on the emulator
```
pnpm android --dev
```
With `pnpm dev:mobile` still running, press Run in Android Studio, then tap **Skip login (dev account)** on the login screen.
Dev builds only appear with `pnpm android --dev`. **Before building anything to install elsewhere, run
`pnpm android --target sandbox|production`** so the app is built from `shared/targets.json` and has no dev button.

## 7. Later
- **Push notifications:** needs a Firebase project and `google-services.json`; see `PUSH-NOTIFICATIONS.md`.
- **Hosted backend / real phones:** see `ANDROID-REMOTE-BACKEND.md`. Nothing is deployed yet.
- **Something failed?** The troubleshooting table in `ANDROID-DEV-MODE.md` covers the errors seen so far.
