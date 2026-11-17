import { spawnSync } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const checks = {
  '--account': { script: 'account', envFile: true, chromium: true },
  '--product': { script: 'product', envFile: true },
  '--messaging': { script: 'messaging' },
}
const [url, ...rest] = process.argv.slice(2)
const flagIndex = rest.findIndex(arg => arg in checks)
const check = checks[rest[flagIndex]]
if (!url || url.startsWith('--') || new Set(rest.filter(arg => arg in checks)).size > 1) {
  console.error('Usage: pnpm test:hosted <url> [--account|--product|--messaging]')
  process.exit(2)
}
const args = rest.filter((_, index) => index !== flagIndex)

const onPath = name => (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, name)).find(file => {
  try { accessSync(file, constants.X_OK); return true } catch { return false }
})

const env = { ...process.env, HOSTED_URL: url }
if (check?.chromium) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = onPath('chromium') ?? ''
const command = check
  ? [...(check.envFile ? ['--env-file-if-exists=.env.hosting.local'] : []), `tests/integration/hosted/test-hosted-${check.script}.mjs`, ...args]
  : ['tests/integration/hosted/test-hosted.mjs', url, ...args]
const result = spawnSync(process.execPath, command, { cwd: root, env, stdio: 'inherit' })
process.exit(result.status ?? 1)
