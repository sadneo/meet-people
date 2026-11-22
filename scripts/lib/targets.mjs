import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..')
const targets = JSON.parse(readFileSync(join(repoRoot, 'shared/targets.json'), 'utf8'))

export function readSecrets(root = repoRoot) {
  const file = join(root, '.env')
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
}

// Hosted commands never default: an agent must name the project it is about to touch.
export function hostedTarget(args, secrets = readSecrets()) {
  const name = args[args.indexOf('--target') + 1]
  if (!args.includes('--target') || !Object.hasOwn(targets, name ?? '')) throw new Error('Choose the hosted project: --target sandbox|production')
  return { name, ...targets[name], serviceRoleKey: secrets[`${name.toUpperCase()}_SUPABASE_SERVICE_ROLE_KEY`] }
}

// Names, not lengths: public IDs (OAuth client IDs, Firebase project IDs) legitimately ship inside an APK.
export const privateValues = secrets => Object.fromEntries(Object.entries(secrets)
  .filter(([name, value]) => value && /SECRET|SERVICE_ROLE|TOKEN|PASSWORD|SIGNING_KEY|SERVER_API_KEY|SERVICE_ACCOUNT/.test(name)))

// A hosted APK gets exactly the target's public values: nothing VITE_* or CAP_* from the shell.
export function hostedBuildEnv(target, base = process.env) {
  const env = Object.fromEntries(Object.entries(base).filter(([name]) => !/^(VITE_|CAP_)/.test(name)))
  return { ...env, VITE_API_BASE_URL: target.apiBaseUrl, VITE_SUPABASE_URL: target.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: target.supabasePublishableKey,
    VITE_APP_SCHEME: target.appScheme, ...(target.androidMapsKey && { VITE_GOOGLE_MAPS_API_KEY: target.androidMapsKey }) }
}

// Overrides ios/App/Pebble.xcconfig, so one Xcode target builds either app (like Android's flavours).
export const iosTargetXcconfig = target => [
  `PEBBLE_BUNDLE_ID = ${target.iosBundleId}`,
  `PEBBLE_DISPLAY_NAME = ${target.appName}`,
  `PEBBLE_APP_SCHEME = ${target.appScheme}`,
  `PEBBLE_FIREBASE_APP_ID = ${target.iosFirebaseAppId ?? ''}`,
  `PEBBLE_FIREBASE_API_KEY = ${target.iosFirebaseApiKey ?? ''}`,
  '',
].join('\n')

export function withoutTarget(args) {
  const at = args.indexOf('--target')
  return at < 0 ? args : args.filter((_, index) => index !== at && index !== at + 1)
}
