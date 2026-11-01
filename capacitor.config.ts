import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  // Must be globally unique on Google Play and can never change after publishing.
  // If you change it, change APP_SCHEME in src/platform/native.ts and the manifest too.
  appId: 'com.cse416.meetpeople',
  appName: 'Pebble',
  // Matches build.outDir in vite.mobile.config.ts (Android and future iOS).
  webDir: 'dist/mobile',
  server: {
    // WebView origin becomes https://localhost (this is what the API's CORS allow-list expects).
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Capacitor 8 injects --safe-area-inset-* variables, which design-system/tokens.css already reads.
    SystemBars: { insetsHandling: 'css' },
  },
}

export default config
