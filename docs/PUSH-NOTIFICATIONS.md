# Push notifications (Android)

Flow: a message or connection request is saved -> a database trigger queues a push (`push_outbox`) for
people who have a registered phone -> the dispatcher (`api/push-dispatcher-main.ts`) sends it through
Firebase Cloud Messaging -> the phone shows an alert; tapping it opens Messages.

Alerts are generic ("New message" / "New connection request"). Names and message text are never sent,
so nothing sensitive reaches the lock screen or Google's servers.

## 1. Install dependencies and add the script
```
pnpm add @capacitor/push-notifications google-auth-library
```
Add this line to `"scripts"` in `package.json`:
```
"start:push": "node dist/api/api/push-dispatcher-main.js",
```
Commit the updated `pnpm-lock.yaml` (the Dockerfile installs with `--frozen-lockfile`).

## 2. Firebase
1. Open the Firebase project you already use for hosting -> Project settings -> **Add app** -> Android.
   Package name: `com.cse416.meetpeople`.
2. Download `google-services.json` into `android/app/google-services.json`. The Gradle files already apply
   the Google services plugin when that file exists.
3. Project settings -> **Service accounts** -> *Generate new private key*. This JSON lets the server send
   notifications: store it in Secret Manager and never commit it.

## 3. Database
`supabase/migrations/20261029000000_push_notifications.sql` and `20261029010000_push_accepted_and_match.sql` create
`push_devices`, `push_outbox`, the triggers and `push_claim`. Apply them: `pnpm exec supabase db push` (hosted) or reset your local database.
If your newest existing migration has a later timestamp, rename this file with a newer one first.

## 4. Run the dispatcher
It needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`
and `PUSH_DISPATCH_ENABLED=true`.
- **Locally:** put those in `.env.local`, add `PUSH_DISPATCH_INTERVAL_MS=5000`, then
  `pnpm exec tsx --env-file=.env.local api/push-dispatcher-main.ts`.
- **Hosted:** deploy it as a Cloud Run **Job** from the same image (command
  `node dist/api/api/push-dispatcher-main.js`), the way `scripts/deploy-worker.sh` deploys the event-group
  worker, and trigger it every minute with Cloud Scheduler. Alerts arrive within about a minute. For faster
  delivery, run it as an always-on process with `PUSH_DISPATCH_INTERVAL_MS=5000`.

## 5. Build and test
```
pnpm install
pnpm android
```
Use a real phone, or an emulator image that includes **Google Play** (plain AOSP images cannot receive pushes).
1. Sign in on the phone -> Settings -> turn on **Notifications on this phone** and allow the prompt.
2. Check the token arrived: `select user_id, platform, last_seen_at from push_devices;`
3. From a second account (the web app is fine), message or send a connection request to the phone's user.
4. A row appears in `push_outbox`, then `sent_at` is filled in when the dispatcher runs, and the phone shows the alert.
5. Tap it: Pebble opens on Messages.

| Symptom | Likely cause |
|---|---|
| Toggle says notifications are blocked | Android permission denied: allow it in phone Settings -> Apps -> Pebble |
| No row in `push_devices` | Phone could not reach the API, or `google-services.json` is missing from `android/app` (rebuild after adding it) |
| `push_outbox` stays empty | Recipient has no device registered, the two users have a block, or the migration is not applied |
| `push_outbox` fills but `sent_at` stays null | Dispatcher is not running, or `PUSH_DISPATCH_ENABLED` is not `true` |
| Dispatcher logs `FCM send failed` with 401/403 | Wrong service-account key or project id; the key's project must match `google-services.json` |
| Works on a phone, not the emulator | Emulator image has no Google Play services |

## Behaviour and limits
- Push is opt-in per person and per phone, and is removed from the phone on logout and when the account is deleted.
- A burst of messages in one chat becomes one alert until it is sent.
- Notification settings inside the app (master switch and per-type toggles) are **not** consulted by the
  server. The phone switch in Settings is the control.
- Sent for: new messages, new connection requests, accepted connection requests (to the person who asked), and
  dating matches (to the person who sent the request). A dating request that has not been accepted is deliberately
  **not** announced, so nobody learns who liked them before matching. Part 2 lives in
  `supabase/migrations/20261029010000_push_accepted_and_match.sql`; apply it after the first migration.
- The alert uses the app icon. A dedicated white notification icon can be added later.
