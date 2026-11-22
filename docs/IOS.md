# iOS

The iOS app is the same Capacitor shell as Android (`dist/mobile` inside a WebView). It was scaffolded on
Linux and **has never been built**: everything below "On the Mac" is the first verification pass.

## What is in the repo

| Piece | Where |
|---|---|
| Xcode project (Swift Package Manager, no CocoaPods) | `ios/App/App.xcodeproj` |
| Identity per target (bundle id, name, URL scheme, Firebase ids) | `ios/App/Pebble.xcconfig` (production defaults), overridden by the gitignored `ios/App/Pebble.target.xcconfig` that `pnpm ios` writes from `shared/targets.json` |
| Push: Firebase Messaging package, FCM token handed to Capacitor | `ios/App/App/AppDelegate.swift` |
| Push entitlement, URL scheme, permission strings | `ios/App/App/App.entitlements`, `ios/App/App/Info.plist` |
| `ios` push platform | `api/push.ts`, `supabase/migrations/20261122000000_push_devices_ios.sql` |

| Target | Bundle id | Name | URL scheme |
|---|---|---|---|
| `production` | `garden.pebble.ios` | Pebble | `com.cse416.meetpeople` |
| `sandbox` | `garden.pebble.ios.dev` | Pebble Dev | `com.cse416.meetpeople.dev` |

The URL schemes are the Android ones, so email links and the Supabase redirect allow-lists need no change.
There is one Xcode target: switching targets rewrites `Pebble.target.xcconfig`, so only one of the two apps is
built at a time (Android uses flavours instead).

## 1. Apple Developer account (any computer)

1. Make sure your Apple ID has two-factor authentication on (appleid.apple.com).
2. Enroll at https://developer.apple.com/programs/enroll/ ($99/year).
   - **Individual**: the App Store shows your personal name as the seller. Usually approved within 48 hours.
   - **Organization**: shows the organization's name, but needs a legal entity, a D-U-N-S number (free, can
     take 1–2 weeks to issue) and a website on the organization's domain. Decide this before enrolling.
3. When approved, note the **Team ID** (developer.apple.com → Account → Membership details).
4. **Certificates, Identifiers & Profiles → Identifiers → +** → App IDs → App. Register
   `garden.pebble.ios` and `garden.pebble.ios.dev`, each with **Push Notifications** ticked.
   (Xcode's automatic signing would also create them, but registering them now avoids surprises.)
5. **Keys → +** → tick **Apple Push Notifications service (APNs)** → download the `.p8` file. It can be
   downloaded only once: store it with the Android signing material (encrypted, never in git). Note the Key ID.
6. **App Store Connect** (appstoreconnect.apple.com) → Apps → + → New App: platform iOS, name Pebble,
   bundle id `garden.pebble.ios`, any SKU (e.g. `pebble-ios`). Fill in the privacy policy URL and the age rating
   when you get to them; TestFlight works before the listing is complete.

## 2. Firebase (any computer)

Push goes through the same Firebase project as Android (`cse416-meet-people`); the dispatcher does not change.

1. Firebase console → Project settings → **Add app → iOS**, twice: `garden.pebble.ios` and `garden.pebble.ios.dev`.
   Skip the "download config file" and SDK steps: the app reads its ids from `shared/targets.json`.
2. From each app's `GoogleService-Info.plist` (or the app's settings page) copy `GOOGLE_APP_ID` and `API_KEY`
   into `iosFirebaseAppId` and `iosFirebaseApiKey` of the matching entry in `shared/targets.json`. Both are public ids.
3. Project settings → **Cloud Messaging** → each iOS app → APNs Authentication Key → upload the `.p8`
   with its Key ID and your Team ID.

Until step 2 is done the app runs normally, but turning notifications on reports a failure.

## 3. Database

Apply `20261122000000_push_devices_ios.sql` to sandbox and production **before** deploying the API from
this branch, as with any migration. Without it, iOS registrations fail with a database error.

## 4. On the Mac

Needs Xcode 16.2 or newer (Firebase 12), Node and pnpm. Docker is only needed for `--dev`.

```sh
pnpm install
pnpm ios --target sandbox      # builds mobile against sandbox, writes the xcconfig, syncs and opens Xcode
```

In Xcode:
1. Wait for packages to resolve (Capacitor plugins and firebase-ios-sdk). Commit the new
   `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.
2. App target → Signing & Capabilities → pick your team. Push Notifications should already be listed
   (from `App.entitlements`).
3. Run on a simulator, then on a phone.

Dev mode, against this computer's local stack (simulator only):
```sh
pnpm dev:mobile                # its own terminal
pnpm ios --dev                 # then Run in Xcode and tap "Skip login (dev account)"
```

### First-run checklist
- [ ] Builds without warnings about `Pebble.xcconfig` or `PEBBLE_*` (a literal `$(PEBBLE_…)` in the app name or
      bundle id means the xcconfig did not load: check the Debug and Release base configurations of the App target).
- [ ] Home screen name is "Pebble Dev" for sandbox and "Pebble" for production.
- [ ] Sign up/login works; a password-reset email link opens the app (URL scheme).
- [ ] Safe areas look right on a notched phone (the CSS reads `--safe-area-inset-*`).
- [ ] Location prompt appears and nearby results load.
- [ ] Profile photo: choose from library and take a photo.
- [ ] Settings → Notifications on this phone → allow → a row with `platform = 'ios'` appears in `push_devices`.
      Then follow the delivery checks in `PUSH-NOTIFICATIONS.md`. Simulators on Apple silicon can receive pushes.
- [ ] Tapping a notification opens Messages.
- [ ] Maps load. Hosted builds reuse `androidMapsKey`; if Google rejects it from iOS, add an iOS entry
      to `shared/targets.json` and to `hostedBuildEnv`.

## 5. TestFlight and App Store

Product → Archive → Distribute App → App Store Connect. Raise `CURRENT_PROJECT_VERSION` (build number) in
Xcode for every upload; `MARKETING_VERSION` is the user-facing version. Archive with the production target
(`pnpm ios --target production` first).

Review blockers to settle before submitting:
- **Sign in with Apple** (App Review guideline 4.8): the login screen offers "Continue with Google", so Apple
  requires an equivalent privacy-focused login option, in practice Sign in with Apple. Supabase supports it as
  an OAuth provider; it needs a Services ID and a Sign in with Apple key from the developer account.
- **Google sign-in inside the WebView**: Google blocks OAuth in embedded browsers. Check it on a device; Android has the same issue.
- Account deletion inside the app already exists (guideline 5.1.1(v)).
- `ITSAppUsesNonExemptEncryption` is `false` (HTTPS only), which skips the export-compliance question.
