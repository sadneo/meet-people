// Explicit release build for one environment: PEBBLE_ENVIRONMENT=production (default) or sandbox.
// Backend secrets never enter Vite's child env.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { hostedTarget, privateValues, readSecrets } from './lib/targets.mjs'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import process from 'node:process'
import console from 'node:console'
import { supabaseRefs } from './configure-deployment.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const tools = join(root, '.android-build')
const environment = process.env.PEBBLE_ENVIRONMENT || 'production'
// Independent of shared/targets.json on purpose: a wrong edit there must not produce a release.
const target = {
  production: { api: 'https://pebble.garden', packageId: 'garden.pebble.android', scheme: 'com.cse416.meetpeople', other: 'sandbox' },
  sandbox: { api: 'https://web.dev.pebble.garden', packageId: 'garden.pebble.android.dev', scheme: 'com.cse416.meetpeople.dev', other: 'production' },
}[environment]
if (!target) throw new Error('PEBBLE_ENVIRONMENT must be production or sandbox.')
const flavor = environment[0].toUpperCase() + environment.slice(1)
const hosted = hostedTarget(['--target', environment], {})
const supplied = { VITE_API_BASE_URL: hosted.apiBaseUrl, VITE_SUPABASE_URL: hosted.supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: hosted.supabasePublishableKey, VITE_GOOGLE_MAPS_API_KEY: hosted.androidMapsKey }
if (hosted.appScheme !== target.scheme) throw new Error(`${flavor} app scheme in shared/targets.json must be ${target.scheme}.`)
const signing = JSON.parse(readFileSync(join(root, '.android-signing/release.json'), 'utf8'))
const code = process.env.PEBBLE_VERSION_CODE
const name = process.env.PEBBLE_VERSION_NAME
if (!/^[1-9]\d*$/.test(code ?? '') || Number(code) > 2100000000 || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/.test(name ?? '')) throw new Error('Set an explicit positive PEBBLE_VERSION_CODE and semantic PEBBLE_VERSION_NAME.')
if (supplied.VITE_API_BASE_URL !== target.api || supplied.VITE_SUPABASE_URL !== `https://${supabaseRefs[environment]}.supabase.co`) throw new Error(`${flavor} endpoints required.`)
const env = { ...process.env }
for (const key of Object.keys(env)) if (/^(VITE_|SUPABASE_|GOOGLE_MAPS_|SEARCH_LOCATION_|PEBBLE_KEY|CAP_)/.test(key)) delete env[key]
for (const key of ['VITE_API_BASE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_GOOGLE_MAPS_API_KEY']) {
  if (!supplied[key]) throw new Error(`Missing ${key}: fill in the ${environment} entry of shared/targets.json`)
  env[key] = supplied[key]
}
Object.assign(env, { VITE_APP_SCHEME: target.scheme, VITE_DEV_TOOLS: 'false', VITE_DEV_LOGIN_EMAIL: '', VITE_DEV_LOGIN_PASSWORD: '',
  JAVA_HOME: join(tools, 'java', readdirSync(join(tools, 'java'))[0]), ANDROID_HOME: join(tools, 'sdk'), ANDROID_SDK_ROOT: join(tools, 'sdk'),
  GRADLE_USER_HOME: join(tools, 'gradle-cache'), ANDROID_USER_HOME: join(tools, 'android-user'), XDG_CACHE_HOME: join(tools, 'cache') })
env.PATH = `${env.JAVA_HOME}/bin:${env.PATH}`
const run = (command, args, cwd = root, override = {}) => execFileSync(command, args, { cwd, env: { ...env, ...override }, stdio: 'inherit' })
const release = join(root, 'Pebble-APKs', `Pebble-${environment}-${name}-${code}`)
mkdirSync(join(root, 'Pebble-APKs'), { recursive: true })
if (existsSync(`${release}.apk`) || existsSync(`${release}.aab`)) throw new Error('Release output already exists; never overwrite a delivered version.')
run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.mobile.config.ts', '--mode', `${environment}-release`])
run('pnpm', ['exec', 'cap', 'sync', 'android'])
writeFileSync(join(root, 'android/local.properties'), `sdk.dir=${env.ANDROID_HOME}\n`)
run('sh', ['gradlew', '--no-daemon', '--console=plain', `assemble${flavor}Release`, `bundle${flavor}Release`], join(root, 'android'), {
  PEBBLE_VERSION_CODE: code, PEBBLE_VERSION_NAME: name, PEBBLE_KEYSTORE_PATH: resolve(signing.keystore),
  PEBBLE_KEYSTORE_PASSWORD: signing.storePassword, PEBBLE_KEY_ALIAS: signing.alias, PEBBLE_KEY_PASSWORD: signing.keyPassword,
})
const apk = join(root, `android/app/build/outputs/apk/${environment}/release/app-${environment}-release.apk`)
const listing = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' }).trim().split('\n')
if (listing.some(file => /(^|\/)\.env(?:\.|$)|\.jks$|\.keystore$|release\.json$/.test(file))) throw new Error('Unexpected private file in APK')
const contents = execFileSync('unzip', ['-p', apk], { maxBuffer: 256 * 1024 * 1024 })
for (const [key, value] of Object.entries(privateValues(readSecrets(root)))) if (contents.includes(Buffer.from(value))) throw new Error(`Forbidden credential bundled: ${key}`)
if (contents.includes(Buffer.from(`https://${supabaseRefs[target.other]}.supabase.co`))) throw new Error(`${target.other} endpoint bundled`)
for (const key of ['VITE_API_BASE_URL', 'VITE_SUPABASE_URL', 'VITE_GOOGLE_MAPS_API_KEY']) if (!contents.includes(Buffer.from(supplied[key]))) throw new Error(`Expected ${environment} setting missing: ${key}`)
if (!contents.includes(Buffer.from(target.scheme))) throw new Error('Expected app scheme missing')
run(join(env.ANDROID_HOME, 'build-tools/36.0.0/apksigner'), ['verify', '--verbose', '--print-certs', apk])
const manifest = execFileSync(join(env.ANDROID_HOME, 'build-tools/36.0.0/aapt'), ['dump', 'badging', apk], { encoding: 'utf8', env })
if (manifest.includes('application-debuggable')) throw new Error('APK is debuggable')
if (!manifest.includes(`package: name='${target.packageId}'`)) throw new Error('Unexpected package ID')
const metadata = { versionCode: Number(code), versionName: name, environment, package: target.packageId, builtAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim(),
  apiBaseUrl: supplied.VITE_API_BASE_URL, supabaseUrl: supplied.VITE_SUPABASE_URL,
  warning: 'Build/package checks do not replace hosted-service and real-device acceptance. AAB is prepared only; nothing uploaded to Google Play.' }
for (const [source, extension] of [[apk, 'apk'], [join(root, `android/app/build/outputs/bundle/${environment}Release/app-${environment}-release.aab`), 'aab']]) {
  const destination = `${release}.${extension}`
  copyFileSync(source, destination)
  writeFileSync(`${destination}.sha256`, `${createHash('sha256').update(readFileSync(destination)).digest('hex')}  ${destination.split('/').at(-1)}\n`)
}
writeFileSync(`${release}.source.json`, JSON.stringify(metadata, null, 2)+'\n')
console.info(`${flavor} release artifacts: ${release}.{apk,aab}. Not published.`)
