import { Capacitor } from '@capacitor/core'

// Custom URL scheme the Android app registers. Keep in sync with AndroidManifest.xml,
// capacitor.config.ts (appId) and the Supabase redirect allow-list.
export const APP_SCHEME = 'com.cse416.meetpeople'

export const isNative = () => Capacitor.isNativePlatform()

// Web build: VITE_API_BASE_URL is unset, so requests stay same-origin (/api/...).
// Android build: set to the hosted site, because the WebView origin is https://localhost.
export function apiUrl(path: string) {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
  return `${base}${path}`
}

// Where Supabase email links (confirm, magic link, password reset) should land.
// `path` includes any query string, e.g. '/auth/callback?returnTo=%2F'.
export function authRedirect(path: string) {
  return isNative() ? `${APP_SCHEME}://app${path}` : `${window.location.origin}${path}`
}
