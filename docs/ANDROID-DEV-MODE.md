# Android dev mode: "Skip login (dev account)"

A separate build of the Android app that shows a **Skip login (dev account)** button on the login screen.
It signs in as a generated account on this worktree's **local** Supabase. Hosted builds
(`pnpm android --target sandbox|production`) and release builds never contain it.

## What keeps it out of real builds
- It exists only in builds made with `--mode android-dev`. Anything else removes the button, the sign-in code
  and the credentials from the bundle (checked with a real Vite build: not even a `VITE_DEV_LOGIN_*` value
  left in the environment makes it into a release build).
- Even in the dev build, the button only appears inside the Android app and only when `VITE_SUPABASE_URL` is a
  private `http://` address (`10.0.2.2`, `localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`).
  A hosted `https://...supabase.co` project never qualifies.
- `capacitor.config.ts` turns cleartext HTTP on only for the `pnpm android --dev` build (it sets `CAP_CLEARTEXT=1`),
  so every other build stays locked down.

## No setup file
There is nothing to create. `pnpm android --dev` generates the dev login once per stack and keeps it in
`~/.local/share/pebble/<project>/android-dev-account.json` (the main checkout uses `~/.local/share/pebble/` directly).
It builds the APK against `http://10.0.2.2:3100` (the API) and `http://10.0.2.2:<this stack's Supabase port>`,
reading the local publishable key from the running stack.

## Each session
Use **Git Bash** for the Supabase scripts (they need `sh`). Docker Desktop must be running.
```
pnpm dev:mobile         # Supabase, worker, functions and the API on port 3100; leave running in its own terminal
pnpm android --dev      # creates the dev login, builds the dev variant and opens Android Studio -> press Run
pnpm android --user     # only if needed: re-creates or resets the dev login (safe to repeat)
```
`pnpm dev:mobile` is for the emulator only: it starts no web servers and is not meant for browsers. Only one
can run at a time, because the dev APK always calls port 3100.

On the login screen tap **Skip login (dev account)**. The first time, you land in the normal onboarding;
finish your profile once. It lives in your local database, so later sign-ins skip it.

## Seeded users
`supabase/seed.sql` creates 12 users (`alice@example.com`, `bob@example.com`, ... all with password `password123`).
The skip button always uses the generated dev login; to use a seeded user, sign in with it on the normal login
screen. Seeded users may still need the app's onboarding before they can use every feature.

The seed used to leave NULL in the auth token columns, which breaks the local auth service ("Database error
finding users"). `seed.sql` now ends with a fix, so `pnpm supabase db reset` produces a healthy database. For a
database that is already running, run `scripts/fix-local-auth-tokens.sql` once in Studio.

## Email links on a local backend
- `supabase/config.toml` now allows `com.cse416.meetpeople://app/**` as a redirect. Restart Supabase after
  pulling the change: `pnpm supabase stop` then `pnpm supabase start`.
- Local emails land in Inbucket (http://127.0.0.1:54324 for the main checkout; other worktrees get their own
  ports). Confirmation is switched on, so sign-ups need it.
  The link starts with `http://127.0.0.1:<Supabase port>/...`, which means "the emulator itself" on the emulator. Open the
  email on your PC, copy the link, and replace `127.0.0.1` with `10.0.2.2` before opening it in the emulator's browser.

## Going back to a normal build
Run `pnpm android --target sandbox|production` before building anything you will install elsewhere, so the
APK is made from that project's values in `shared/targets.json` and has no dev button. To confirm, search the
built files for the dev password from `android-dev-account.json`; there should be no results:
```
findstr /S /M /C:"your-dev-password" android\app\src\main\assets\public\assets\*.js
```

## Troubleshooting
| Message or symptom | Cause |
|---|---|
| No button appears | Not built with `pnpm android --dev`, or `VITE_SUPABASE_URL` is not a private http address |
| "The dev account does not exist yet" | Run `pnpm android --user`, then try again |
| "Set VITE_DEV_LOGIN_EMAIL and VITE_DEV_LOGIN_PASSWORD" | Not built with `pnpm android --dev`; rebuild with it |
| "Cannot reach Supabase at ... from this device" | The app could not connect. Supabase is not running, or this address does not work from the device. Open the address (add `/auth/v1/health`) in the emulator's browser: any response, even an error, means it is reachable |
| "Dev sign-in failed (AuthApiError ...)" | Supabase answered but refused the sign-in; the text in brackets is the reason |
| `pnpm android --dev`/`--user`: "Local Supabase for this worktree is not running" or "No local stack for this worktree" | Run `pnpm dev:mobile` first |
| `pnpm android --user`: "Supabase could not read its user list" / "Database error finding users" | Seeded users with empty (NULL) token columns that the auth service cannot read. Delete `android-dev-account.json` so a new email is generated, or run `scripts/fix-local-auth-tokens.sql` in Studio. The real error is in `docker logs` for the `supabase_auth_...` container |
| Android Studio: "could not terminate previous instance of 'app'" | The emulator could not stop the old copy. Force-stop it (`adb shell am force-stop com.cse416.meetpeople`), press Stop then Run again; if it persists, `adb kill-server`, `adb uninstall com.cse416.meetpeople`, or cold-boot the emulator |
| `pnpm android --user`: "email is taken, but no account with it appears" | A deleted account still holds the email. Delete `android-dev-account.json` and rerun `pnpm android --dev`, or remove the stale row in Studio; the script prints the exact SQL |
| Works in the emulator, not on a real phone | `10.0.2.2` only exists inside the emulator, and the dev build always uses it; it is emulator-only |
