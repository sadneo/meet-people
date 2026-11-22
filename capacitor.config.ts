import type { CapacitorConfig } from '@capacitor/cli'

// Cleartext HTTP (and mixed content) is only for the dev APK, whose backend is the emulator's plain-http
// 10.0.2.2 host; scripts/build-mobile-dev.mjs sets CAP_CLEARTEXT=1 for its `cap sync`. Hosted builds get a locked-down WebView.
const cleartext = process.env.CAP_CLEARTEXT === '1'

const config: CapacitorConfig = {
  // Android only: the iOS bundle id comes from ios/App/Pebble.xcconfig. Must be globally unique on Google Play and can never change after publishing.
  // If you change it, change APP_SCHEME in src/platform/native.ts and the manifest too.
  appId: 'garden.pebble.android',
  appName: 'Pebble',
  // Matches build.outDir in vite.mobile.config.ts (Android and iOS).
  webDir: 'dist/mobile',
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
    CapacitorHttp: { enabled: true },

  },
}

export default config