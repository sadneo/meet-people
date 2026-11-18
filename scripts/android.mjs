import { spawnSync } from 'node:child_process'
import { hostedBuildEnv, hostedTarget } from './lib/targets.mjs'

const args = process.argv.slice(2)
const shell = process.platform === 'win32' // pnpm is a .cmd shim on Windows
const createUser = ['node', 'scripts/create-android-dev-user.mjs']
let env = process.env
let steps
if (args.includes('--user')) steps = [createUser]
else if (args.includes('--dev')) steps = [createUser, ['node', 'scripts/build-android-dev.mjs'], ['pnpm', 'exec', 'cap', 'open', 'android']]
else {
  let target
  try { target = hostedTarget(args, {}) } catch (error) {
    console.error(`${error.message}\nUsage: pnpm android --target sandbox|production | pnpm android --dev | pnpm android --user`)
    process.exit(2)
  }
  // Mobile builds never read .env (envDir: false), so these are the only values that reach the APK.
  env = hostedBuildEnv(target)
  console.log(`In Android Studio, pick the ${target.name}Debug build variant so the package matches this build's URL scheme.`)
  steps = [['pnpm', 'exec', 'vite', 'build', '--config', 'vite.mobile.config.ts', '--mode', 'android'], ['pnpm', 'exec', 'cap', 'sync', 'android'], ['pnpm', 'exec', 'cap', 'open', 'android']]
}
for (const [command, ...rest] of steps) {
  const result = spawnSync(command, rest, { stdio: 'inherit', shell, env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
