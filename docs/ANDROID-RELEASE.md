# Android production release

The first direct-download APK uses package `garden.pebble.android`. Keep its signing
identity for future updates. Play submission is a separate run: decide Play App
Signing import/enrollment so direct-download and Play-installed signing continuity
is deliberate. Do not create a new signing key for each build.

Private material is in ignored `.android-signing/`: `pebble-release.jks` and
`release.json` (credentials). Both are owner-only; back them up together to an
encrypted, access-controlled offline/password-manager location. Do not upload them
to a GitHub release, issue, repository, APK directory or chat. Losing the signing
key can prevent updating existing direct-download installations. No off-device
backup is created by this build process.

Prerequisites: the `production` entry of `shared/targets.json` (the script refuses
while its `androidMapsKey` is null), `.android-build/` JDK/SDK, and the private
signing files. Run from the project root:

```sh
PEBBLE_VERSION_CODE=1 PEBBLE_VERSION_NAME=1.0.0 node scripts/build-android-release.mjs
```

## Production and sandbox flavours

`android/app/build.gradle` has two product flavours built from the same code:

| Flavour | Package | Name | URL scheme | Endpoints from |
|---|---|---|---|---|
| `production` (default) | `garden.pebble.android` | Pebble | `com.cse416.meetpeople` | `production` in `shared/targets.json` |
| `sandbox` | `garden.pebble.android.dev` | Pebble Dev | `com.cse416.meetpeople.dev` | `sandbox` in `shared/targets.json` |

Different packages install side by side. Each environment's API URL, Supabase URL,
publishable key, URL scheme and Maps key come from its entry in `shared/targets.json`;
no env file is involved. Build a sandbox release with:

```sh
PEBBLE_ENVIRONMENT=sandbox PEBBLE_VERSION_CODE=1 PEBBLE_VERSION_NAME=1.0.0 node scripts/build-android-release.mjs
```

Outputs are named `Pebble-<environment>-<version>-<code>`. The script sets `VITE_APP_SCHEME`
to match the flavour and rejects a bundle containing the other environment's Supabase URL.
`pnpm android --target sandbox|production` bundles the matching values and URL scheme.
Android Studio Run defaults to `productionDebug`; pick `sandboxDebug` in Build Variants for
Pebble Dev so the package matches the sandbox scheme. `android/app/google-services.json`
holds Firebase clients for both packages.

Increment versionCode for every published update; never overwrite a delivered
release. The script outputs a signed APK and AAB plus checksums/source metadata in
ignored `Pebble-APKs/`. The AAB is not uploaded anywhere. Only public frontend
settings reach Vite; signing passwords enter only the Gradle child environment.
Checks reject private env/key files, any `.env` secret found in the APK, the other
environment's Supabase URL, missing settings and debuggable APKs. Test installation and all real
service flows before publishing; these checks alone do not certify release readiness.

System Android backup is disabled to avoid backing up private WebView sessions.
Existing debug APK installations use a different certificate and cannot be updated
in place by this release identity. Explicit uninstall loses local app data; do not
uninstall anyone's app automatically. Server-owned account data is separate.
