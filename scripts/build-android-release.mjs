// Explicit production-only build. Backend secrets never enter Vite's child env.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import process from 'node:process'
import console from 'node:console'

const root = fileURLToPath(new URL('../', import.meta.url))
const tools = join(root, '.android-build')
const supplied = parseEnv(readFileSync(join(root, '.env.prod'), 'utf8'))
const signing = JSON.parse(readFileSync(join(root, '.android-signing/release.json'), 'utf8'))
const code = process.env.PEBBLE_VERSION_CODE
const name = process.env.PEBBLE_VERSION_NAME
if (!/^[1-9]\d*$/.test(code ?? '') || Number(code) > 2100000000 || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/.test(name ?? '')) throw new Error('Set an explicit positive PEBBLE_VERSION_CODE and semantic PEBBLE_VERSION_NAME.')
if (supplied.VITE_API_BASE_URL !== 'https://pebble.garden' || supplied.VITE_SUPABASE_URL !== 'https://wacgxhsdhrqigrmqaonc.supabase.co') throw new Error('Production endpoints required.')
const env = { ...process.env }
for (const key of Object.keys(env)) if (/^(VITE_|SUPABASE_|GOOGLE_MAPS_|SEARCH_LOCATION_|PEBBLE_KEY)/.test(key)) delete env[key]
for (const key of ['VITE_API_BASE_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_GOOGLE_MAPS_API_KEY']) {
  if (!supplied[key]) throw new Error(`Missing ${key}`)
  env[key] = supplied[key]
}
Object.assign(env, { VITE_DEV_TOOLS: 'false', VITE_DEV_LOGIN_EMAIL: '', VITE_DEV_LOGIN_PASSWORD: '', CAP_ANDROID_MODE: 'production',
  JAVA_HOME: join(tools, 'java', readdirSync(join(tools, 'java'))[0]), ANDROID_HOME: join(tools, 'sdk'), ANDROID_SDK_ROOT: join(tools, 'sdk'),
  GRADLE_USER_HOME: join(tools, 'gradle-cache'), ANDROID_USER_HOME: join(tools, 'android-user'), XDG_CACHE_HOME: join(tools, 'cache') })
env.PATH = `${env.JAVA_HOME}/bin:${env.PATH}`
const run = (command, args, cwd = root, override = {}) => execFileSync(command, args, { cwd, env: { ...env, ...override }, stdio: 'inherit' })
const release = join(root, 'Pebble-APKs', `Pebble-production-${name}-${code}`)
mkdirSync(join(root, 'Pebble-APKs'), { recursive: true })
if (existsSync(`${release}.apk`) || existsSync(`${release}.aab`)) throw new Error('Release output already exists; never overwrite a delivered version.')
run('pnpm', ['exec', 'vite', 'build', '--config', 'vite.mobile.config.ts', '--mode', 'production-release'])
run('pnpm', ['exec', 'cap', 'sync', 'android'])
writeFileSync(join(root, 'android/local.properties'), `sdk.dir=${env.ANDROID_HOME}\n`)
run('sh', ['gradlew', '--no-daemon', '--console=plain', 'assembleRelease', 'bundleRelease'], join(root, 'android'), {
  PEBBLE_VERSION_CODE: code, PEBBLE_VERSION_NAME: name, PEBBLE_KEYSTORE_PATH: resolve(signing.keystore),
  PEBBLE_KEYSTORE_PASSWORD: signing.storePassword, PEBBLE_KEY_ALIAS: signing.alias, PEBBLE_KEY_PASSWORD: signing.keyPassword,
})
const apk = join(root, 'android/app/build/outputs/apk/release/app-release.apk')
const listing = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' }).trim().split('\n')
if (listing.some(file => /(^|\/)\.env(?:\.|$)|\.jks$|\.keystore$|release\.json$/.test(file))) throw new Error('Unexpected private file in APK')
const contents = execFileSync('unzip', ['-p', apk], { maxBuffer: 256 * 1024 * 1024 })
for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_MAPS_SERVER_API_KEY', 'SEARCH_LOCATION_SIGNING_KEY', 'VITE_DEV_LOGIN_EMAIL', 'VITE_DEV_LOGIN_PASSWORD']) if (supplied[key] && contents.includes(Buffer.from(supplied[key]))) throw new Error(`Forbidden credential bundled: ${key}`)
if (contents.includes(Buffer.from('https://wixdiotkntapwrbibaom.supabase.co'))) throw new Error('Sandbox endpoint bundled')
for (const key of ['VITE_API_BASE_URL', 'VITE_SUPABASE_URL', 'VITE_GOOGLE_MAPS_API_KEY']) if (!contents.includes(Buffer.from(supplied[key]))) throw new Error(`Expected production setting missing: ${key}`)
run(join(env.ANDROID_HOME, 'build-tools/36.0.0/apksigner'), ['verify', '--verbose', '--print-certs', apk])
const manifest = execFileSync(join(env.ANDROID_HOME, 'build-tools/36.0.0/aapt'), ['dump', 'badging', apk], { encoding: 'utf8', env })
if (manifest.includes('application-debuggable')) throw new Error('APK is debuggable')
if (!manifest.includes("package: name='garden.pebble.android'")) throw new Error('Unexpected package ID')
const metadata = { versionCode: Number(code), versionName: name, package: 'garden.pebble.android', builtAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim(),
  apiBaseUrl: supplied.VITE_API_BASE_URL, supabaseUrl: supplied.VITE_SUPABASE_URL,
  warning: 'Build/package checks do not replace hosted-service and real-device acceptance. AAB is prepared only; nothing uploaded to Google Play.' }
for (const [source, extension] of [[apk, 'apk'], [join(root, 'android/app/build/outputs/bundle/release/app-release.aab'), 'aab']]) {
  const destination = `${release}.${extension}`
  copyFileSync(source, destination)
  writeFileSync(`${destination}.sha256`, `${createHash('sha256').update(readFileSync(destination)).digest('hex')}  ${destination.split('/').at(-1)}\n`)
}
writeFileSync(`${release}.source.json`, JSON.stringify(metadata, null, 2)+'\n')
console.info(`Production release artifacts: ${release}.{apk,aab}. Not published.`)
