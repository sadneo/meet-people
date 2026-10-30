# Android app on a hosted backend

The app already sends every request through `apiUrl()` (`src/platform/native.ts`), so moving off the
local stack is configuration plus one-time hosting setup. Do the steps in order; `HOSTING-SETUP.md` and
`pnpm hosting:configure` cover the web deploy and may already do some of steps 1-4.

## 1. Hosted Supabase
1. Create a project; note the **URL**, **publishable key** and **service-role key** (Settings -> API Keys).
2. Push the schema: `pnpm exec supabase link --project-ref <ref>` then `pnpm exec supabase db push`.
3. Regenerate types only against local (`pnpm supabase:types`); do not point it at production by accident.

## 2. Supabase Auth settings (Authentication -> URL Configuration)
- **Site URL**: your web URL.
- **Redirect URLs**: add `com.cse416.meetpeople://app/**` (and your web `/auth/callback` and `/reset-password`).
  Without it, confirm / magic-link / reset emails will not return to the app.
- The built-in email sender is heavily rate-limited. Configure custom SMTP before real users sign up.

## 3. Deploy the API (Cloud Run, matches `firebase.json`: service `pebble-api`, `us-east4`)
```
gcloud run deploy pebble-api --source . --region us-east4 --allow-unauthenticated ^
  --set-env-vars SUPABASE_URL=https://<ref>.supabase.co,SUPABASE_PUBLISHABLE_KEY=<publishable> ^
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=supabase-service-role:latest
```
(`^` is the cmd.exe line continuation; use `\` in bash.) `--allow-unauthenticated` is correct: the API
authenticates users itself with their Supabase bearer token. Keep the service-role key in Secret Manager.
The API already allows the Android WebView origins (`https://localhost`, `capacitor://localhost`).
Check: `curl https://<cloud-run-url>/api/health` -> `{"status":"ok"}`.

The event-group worker (`dist/api/api/event-group-worker-main.js`) is a run-once job, not part of the
server. Deploy it as a Cloud Run **Job** with the same image and a scheduler if you use event groups.

## 4. Firebase Hosting (optional but recommended)
`pnpm build:web` then `firebase deploy --only hosting`. `/api/**` is rewritten to the Cloud Run service,
so `https://<site>.web.app/api/health` works and the app needs only one base URL.

## 5. Build the Android app
1. `copy .env.android.example .env.android` and fill in the hosted values.
2. `pnpm android` (builds with `--mode android`, runs `cap sync`, opens Android Studio).
3. Run on a device. For an emulator against your local stack, use the commented `10.0.2.2` block in
   `.env.android.example`; cleartext is switched on automatically only for `http://` values.

## 6. Verify on a device
- Sign up with a real email; tapping the confirmation link opens Pebble.
  Without an email, test the link wiring: `adb shell am start -a android.intent.action.VIEW -d "com.cse416.meetpeople://app/login"`.
- Browse events, edit profile + photo, send a connection request, message, block/report.
- Settings -> Delete account on a throwaway account (needs the service-role key on the API).

## 7. Before publishing to Google Play
- Release signing: create a keystore, then `cd android && gradlew.bat bundleRelease`. Raise `versionCode` each upload.
- In-app account deletion exists (Settings). Play also asks for a public **web link** to request deletion;
  the Privacy page and support email can serve, but enter that URL in Play Console -> Data safety.
- Fill in the Data safety form (location, photos, messages, email).
- `android:allowBackup="true"` in the manifest lets Android back up app data (including the saved session);
  consider setting it to `false`.
