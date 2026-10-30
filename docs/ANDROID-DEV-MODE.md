# Android dev mode: "Skip login (dev account)"

A separate build of the Android app that shows a **Skip login (dev account)** button on the login screen.
It signs in as a fixed account on your **local** Supabase. Normal builds (`pnpm android`,
`pnpm build:android`) are unchanged and never contain it.

## What keeps it out of real builds
- It exists only in builds made with `--mode android-dev`. Anything else removes the button, the sign-in code
  and the credentials from the bundle (checked with a real Vite build: not even a password left in
  `.env.local` makes it into a release build).
- Even in the dev build, the button only appears inside the Android app and only when `VITE_SUPABASE_URL` is a
  private `http://` address (`10.0.2.2`, `localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`).
  A hosted `https://...supabase.co` project never qualifies.
- `capacitor.config.ts` still turns cleartext HTTP on only for `http://` backends, and picks the env file that
  matches the build, so a release build stays locked down even when `.env.android-dev` exists.

## One-time setup
1. Add these three lines to `"scripts"` in `package.json`:
```
"build:android:dev": "node scripts/build-android-dev.mjs",
"android:dev": "pnpm build:android:dev && cap open android",
"android:dev-user": "node --env-file-if-exists=.env.local scripts/create-android-dev-user.mjs",
```
2. Create `.env.android-dev` in the project root (it is for local use; do not commit it):
```
VITE_API_BASE_URL=http://10.0.2.2:3001
VITE_SUPABASE_URL=http://10.0.2.2:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<the local publishable key, same as in .env.android today>
VITE_DEV_LOGIN_EMAIL=android-dev@example.com
VITE_DEV_LOGIN_PASSWORD=pick-something-local-only-123
```
   Check it is ignored: `git check-ignore -v .env.android-dev`. If nothing is printed, add it to `.gitignore`.
   The password only unlocks an account on your own machine, but do not reuse a real one.

## Each session
Use **Git Bash** for the Supabase scripts (they need `sh`). Docker Desktop must be running.
```
pnpm supabase:start
pnpm env:local
pnpm dev:api              # leave running in its own terminal
pnpm android:dev-user     # creates the dev account (safe to repeat; it resets the password)
pnpm android:dev          # builds the dev variant and opens Android Studio -> press Run
```
On the login screen tap **Skip login (dev account)**. The first time, you land in the normal onboarding;
finish your profile once. It lives in your local database, so later sign-ins skip it.

## Using your seeded users instead
`supabase/seed.sql` creates 12 users (`alice@example.com`, `bob@example.com`, ... all with password `password123`).
Once the seed fix below is applied you can set `VITE_DEV_LOGIN_EMAIL=alice@example.com` and
`VITE_DEV_LOGIN_PASSWORD=password123` and skip `pnpm android:dev-user`. Seeded users may still need the app's
onboarding before they can use every feature.

The seed used to leave NULL in the auth token columns, which breaks the local auth service ("Database error
finding users"). `seed.sql` now ends with a fix, so `pnpm supabase:reset` produces a healthy database. For a
database that is already running, run `scripts/fix-local-auth-tokens.sql` once in Studio.

## Email links on a local backend
- `supabase/config.toml` now allows `com.cse416.meetpeople://app/**` as a redirect. Restart Supabase after
  pulling the change: `pnpm supabase:stop` then `pnpm supabase:start`.
- Local emails land in Inbucket (http://127.0.0.1:54324). Confirmation is switched on, so sign-ups need it.
  The link starts with `http://127.0.0.1:54321/...`, which means "the emulator itself" on the emulator. Open the
  email on your PC, copy the link, and replace `127.0.0.1` with `10.0.2.2` before opening it in the emulator's browser.

## Going back to a normal build
Run `pnpm build:android` (or `pnpm android`) before building anything you will install elsewhere, so the
APK is made from `.env.android` and has no dev button. To confirm, search the built files for your dev
password; there should be no results:
```
findstr /S /M /C:"your-dev-password" android\app\src\main\assets\public\assets\*.js
```

## Troubleshooting
| Message or symptom | Cause |
|---|---|
| No button appears | Not built with `pnpm android:dev`, or `VITE_SUPABASE_URL` is not a private http address |
| "The dev account does not exist yet" | Run `pnpm android:dev-user`, then try again |
| "Set VITE_DEV_LOGIN_EMAIL and VITE_DEV_LOGIN_PASSWORD" | `.env.android-dev` is missing those lines; fix it and rebuild |
| "Cannot reach Supabase at ... from this device" | The app could not connect. Supabase is not running, or this address does not work from the device. Open the address (add `/auth/v1/health`) in the emulator's browser: any response, even an error, means it is reachable |
| "Dev sign-in failed (AuthApiError ...)" | Supabase answered but refused the sign-in; the text in brackets is the reason |
| `android:dev-user` says SUPABASE_SERVICE_ROLE_KEY is required | Run `pnpm env:local` first so `.env.local` has it |
| `android:dev-user`: "Supabase could not read its user list" / "Database error finding users" | Seeded users with empty (NULL) token columns that the auth service cannot read. Use a different `VITE_DEV_LOGIN_EMAIL`, or run `scripts/fix-local-auth-tokens.sql` in Studio. The real error is in `docker logs` for the `supabase_auth_...` container |
| Android Studio: "could not terminate previous instance of 'app'" | The emulator could not stop the old copy. Force-stop it (`adb shell am force-stop com.cse416.meetpeople`), press Stop then Run again; if it persists, `adb kill-server`, `adb uninstall com.cse416.meetpeople`, or cold-boot the emulator |
| `android:dev-user`: "email is taken, but no account with it appears" | A deleted account still holds the email. Use a different `VITE_DEV_LOGIN_EMAIL` (then rebuild with `pnpm android:dev`), or remove the stale row in Studio; the script prints the exact SQL |
| `android:dev-user` refuses to run | `SUPABASE_URL` is not local; it only works against a local Supabase |
| Works in the emulator, not on a real phone | `10.0.2.2` only exists inside the emulator; a phone needs your PC's LAN address (untested) |
