import type { CapacitorConfig } from '@capacitor/cli'
import { existsSync, readFileSync } from 'node:fs'

// `cap sync` runs right after the matching `vite build`, so the env file for that build is the
// single source of truth for where the app talks: .env.android for normal builds, and
// .env.android-dev when scripts/build-android-dev.mjs sets CAP_ANDROID_MODE=android-dev.
// Cleartext HTTP (and mixed content) is only switched on when that file points at a plain
// http:// address such as the emulator's 10.0.2.2 host. A hosted https:// backend gets a locked-down WebView.
function usesCleartextBackend() {
  const file = process.env.CAP_ANDROID_MODE === 'android-dev' ? '.env.android-dev' : '.env.android'
  if (!existsSync(file)) return false
  return /^\s*VITE_(API_BASE|SUPABASE)_URL\s*=\s*["']?http:\/\//im.test(readFileSync(file, 'utf8'))
}
const cleartext = usesCleartextBackend()

const config: CapacitorConfig = {
  // Must be globally unique on Google Play and can never change after publishing.
  // If you change it, change APP_SCHEME in src/platform/native.ts and the manifest too.
  appId: 'com.cse416.meetpeople',
  appName: 'Pebble',
  // Matches build.outDir in vite.config.ts.
  webDir: 'dist/web',
  server: {
    // WebView origin becomes https://localhost (this is what the API's CORS allow-list expects).
    androidScheme: 'https',
    cleartext,
  },
  android: {
    allowMixedContent: cleartext,
  },
  plugins: {
    // Capacitor 8 injects --safe-area-inset-* variables, which design-system/tokens.css already reads.
    SystemBars: { insetsHandling: 'css' },
  },
}

export default config
