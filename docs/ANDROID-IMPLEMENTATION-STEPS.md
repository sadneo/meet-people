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
node scripts/apply-android-changes.mjs              # adds the 4 npm scripts to package.json
pnpm add @capacitor/push-notifications google-auth-library
```
Commit `pnpm-lock.yaml` too: the Dockerfile installs with a frozen lockfile.
Your `.gitignore` probably ignores `.env.*`, so keep the example file with `git add -f .env.android.example`.

## 3. Database (local)
`config.toml` and `seed.sql` changed, so restart and rebuild:
```
pnpm supabase:stop
pnpm supabase:start
pnpm supabase:reset        # rebuilds the local database: migrations + fixed seed. This wipes local data.
pnpm env:local
```
To keep your local data instead of resetting, run the fix and the two push migrations by hand (all are safe to repeat):
```
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/fix-local-auth-tokens.sql
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261104060000_push_notifications.sql
docker exec -i supabase_db_meet-people psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261104060100_push_accepted_and_match.sql
```
(`supabase_db_meet-people` comes from `project_id` in `supabase/config.toml`.)

## 4. Dev-mode account and settings
Create `.env.android-dev` in the project root (do not commit it):
```
VITE_API_BASE_URL=http://10.0.2.2:3001
VITE_SUPABASE_URL=http://10.0.2.2:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<the local publishable key already in your .env.android>
VITE_DEV_LOGIN_EMAIL=android-dev@example.com
VITE_DEV_LOGIN_PASSWORD=pick-something-local-only-123
```
Then start the API in its own terminal (`pnpm dev:api`) and in another:
```
pnpm android:dev-user
```

## 5. Checks
```
pnpm typecheck
pnpm test:unit        # the new tests should pass; other failures may already exist in your repo
pnpm test:alt
```
If `pnpm lint` complains about `src/alt/`, add `src/alt/**` to the ignores in `eslint.config.js`.

## 6. Run it on the emulator
```
pnpm android:dev
```
In Android Studio press Run, then tap **Skip login (dev account)** on the login screen.
Dev builds only appear with `pnpm android:dev`. **Before building anything to install elsewhere, run
`pnpm build:android`** so the app is built from `.env.android` and has no dev button.

## 7. Later
- **Push notifications:** needs a Firebase project and `google-services.json`; see `PUSH-NOTIFICATIONS.md`.
- **Hosted backend / real phones:** see `ANDROID-REMOTE-BACKEND.md`. Nothing is deployed yet.
- **Something failed?** The troubleshooting table in `ANDROID-DEV-MODE.md` covers the errors seen so far.
