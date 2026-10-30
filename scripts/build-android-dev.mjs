// Builds the Android dev variant (the one with the "skip login" button) and syncs it into android/.
// The release path is unchanged: `pnpm build:android` still builds `--mode android` from .env.android.
import { spawnSync } from 'node:child_process'

const shell = process.platform === 'win32' // pnpm is a .cmd shim on Windows
const env = { ...process.env, CAP_ANDROID_MODE: 'android-dev' } // read by capacitor.config.ts
for (const args of [['exec', 'vite', 'build', '--mode', 'android-dev'], ['exec', 'cap', 'sync', 'android']]) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', env, shell })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('\nDev build synced. Open Android Studio with `pnpm exec cap open android`, then Run.')
