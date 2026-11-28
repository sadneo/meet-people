// Builds the Android dev variant (the one with the "skip login" button) against this worktree's stack and syncs
// it into android/. The emulator reaches this computer at 10.0.2.2; pnpm dev:mobile serves the API it calls.
import { spawnSync } from 'node:child_process'
import { androidDevCredentials } from './dev-account.mjs'
import { androidApiPort } from './dev.mjs'
import { requireStack, stackKeys } from './lib/stack.mjs'
import { readSecrets } from './lib/targets.mjs'

const shell = process.platform === 'win32' // pnpm is a .cmd shim on Windows
const stack = requireStack()
let keys
try { keys = stackKeys(stack) } catch { console.error('Local Supabase for this worktree is not running. Run pnpm dev:mobile first.'); process.exit(1) }
const login = androidDevCredentials(stack.projectId)
const maps = readSecrets().VITE_GOOGLE_MAPS_API_KEY
const env = {
  ...process.env,
  CAP_CLEARTEXT: '1', // read by capacitor.config.ts: the emulator talks plain http to this computer
  VITE_API_BASE_URL: `http://10.0.2.2:${androidApiPort}`,
  VITE_SUPABASE_URL: `http://10.0.2.2:${stack.ports.api}`,
  VITE_SUPABASE_PUBLISHABLE_KEY: keys.publishableKey,
  VITE_DEV_LOGIN_EMAIL: login.email,
  VITE_DEV_LOGIN_PASSWORD: login.password,
  ...(maps && { VITE_GOOGLE_MAPS_API_KEY: maps }),
}
for (const args of [['exec', 'vite', 'build', '--config', 'vite.mobile.config.ts', '--mode', 'android-dev'], ['exec', 'cap', 'sync', 'android']]) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env, shell })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log(`\nDev build synced. Keep pnpm dev:mobile running (API on port ${androidApiPort}), open Android Studio with \`pnpm exec cap open android\`, then Run.`)
