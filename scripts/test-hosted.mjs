import { spawnSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostedTarget, withoutTarget } from './lib/targets.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const checks = {
  '--account': { script: 'account', chromium: true },
  '--product': { script: 'product' },
  '--messaging': { script: 'messaging' },
}
const usage = 'Usage: pnpm test:hosted <url> [--account|--product|--messaging --target sandbox|production]'
const [url, ...rest] = withoutTarget(process.argv.slice(2))
const flagIndex = rest.findIndex(arg => arg in checks)
const check = checks[rest[flagIndex]]
if (!url || url.startsWith('--') || new Set(rest.filter(arg => arg in checks)).size > 1) {
  console.error(usage)
  process.exit(2)
}
const args = rest.filter((_, index) => index !== flagIndex)

const onPath = name => (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, name)).find(file => {
  try { accessSync(file, constants.X_OK); return true } catch { return false }
})

const env = { ...process.env, HOSTED_URL: url }
if (check) {
  // These checks create and delete hosted users, so the project is always named explicitly.
  let target
  try { target = hostedTarget(process.argv.slice(2)) } catch (error) { console.error(`${error.message}\n${usage}`); process.exit(2) }
  if (!target.serviceRoleKey) { console.error(`Set ${target.name.toUpperCase()}_SUPABASE_SERVICE_ROLE_KEY in .env.`); process.exit(2) }
  Object.assign(env, { DEPLOY_ENVIRONMENT: target.name, SUPABASE_URL: target.supabaseUrl, SUPABASE_PUBLISHABLE_KEY: target.supabasePublishableKey,
    SUPABASE_SERVICE_ROLE_KEY: target.serviceRoleKey, VITE_API_BASE_URL: target.apiBaseUrl })
}
if (check?.chromium) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = onPath('chromium') ?? ''
const command = check ? [`tests/integration/hosted/test-hosted-${check.script}.mjs`, ...args] : ['tests/integration/hosted/test-hosted.mjs', url, ...args]
const result = spawnSync(process.execPath, command, { cwd: root, env, stdio: 'inherit' })
process.exit(result.status ?? 1)
