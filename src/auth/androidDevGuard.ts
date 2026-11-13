import { isNative } from '../platform/native'

export type AndroidDevEnvironment = { mode: string; native: boolean; supabaseUrl: string | undefined }

// The dev shortcut may only talk to a Supabase on the developer's own machine or LAN, over plain http.
// A hosted https project never qualifies, so a mistaken build cannot expose a login button for real data.
export function isPrivateDevUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? '')
    if (url.protocol !== 'http:') return false
    const host = url.hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '10.0.2.2'
      || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
  } catch {
    return false
  }
}

export function androidDevLoginAllowed(environment: AndroidDevEnvironment) {
  return environment.mode === 'android-dev' && environment.native && isPrivateDevUrl(environment.supabaseUrl)
}

// Callers must also test `import.meta.env.MODE === 'android-dev'` inline so release builds drop the whole branch.
export function getAndroidDevEnvironment(): AndroidDevEnvironment {
  return { mode: import.meta.env.MODE, native: isNative(), supabaseUrl: import.meta.env.VITE_SUPABASE_URL }
}
