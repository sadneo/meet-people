import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { hostedBuildEnv, hostedTarget, iosTargetXcconfig } from './lib/targets.mjs'

const [platform, ...args] = process.argv.slice(2)
const ios = platform === 'ios'
const shell = process.platform === 'win32' // pnpm is a .cmd shim on Windows
const createUser = ['node', 'scripts/create-android-dev-user.mjs']
const writeIosTarget = target => { if (ios) writeFileSync(new URL('../ios/App/Pebble.target.xcconfig', import.meta.url), iosTargetXcconfig(target)) }
let env = process.env
let steps
if (args.includes('--user')) steps = [createUser]
else if (args.includes('--dev')) {
  // The dev build keeps the default (production) URL scheme, so it uses the production app identity.
  writeIosTarget(hostedTarget(['--target', 'production'], {}))
  steps = [createUser, ['node', 'scripts/build-mobile-dev.mjs', platform], ['pnpm', 'exec', 'cap', 'open', platform]]
} else {
  let target
  try { target = hostedTarget(args, {}) } catch (error) {
    console.error(`${error.message}\nUsage: pnpm ${platform} --target sandbox|production | pnpm ${platform} --dev | pnpm ${platform} --user`)
    process.exit(2)
  }
  // Mobile builds never read .env (envDir: false), so these are the only values that reach the app.
  env = hostedBuildEnv(target)
  writeIosTarget(target)
  console.log(ios ? `Xcode will build ${target.iosBundleId} (${target.appName}).`
    : `In Android Studio, pick the ${target.name}Debug build variant so the package matches this build's URL scheme.`)
  steps = [['pnpm', 'exec', 'vite', 'build', '--config', 'vite.mobile.config.ts', '--mode', 'android'], ['pnpm', 'exec', 'cap', 'sync', platform], ['pnpm', 'exec', 'cap', 'open', platform]]
}
for (const [command, ...rest] of steps) {
  const result = spawnSync(command, rest, { stdio: 'inherit', shell, env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
