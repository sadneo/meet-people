import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { childEnv, requireStack, stackKeys } from './lib/stack.mjs'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const actions = {
  seed: ['scripts/seed-local-demo.ts'],
  populate: ['scripts/seed-local-demo.ts', '--scenarios', '--refresh-location', '--for-development-account'],
  queue: ['scripts/queue-local-demo.ts'],
  event: ['scripts/queue-local-event-demo.ts'],
  messages: ['scripts/seed-local-messages.ts'],
  portraits: ['scripts/seed-local-portraits.ts'],
  active: ['scripts/active-local-demo.ts'],
  remove: ['scripts/active-local-demo.ts', '--action', 'remove'],
  images: ['scripts/backfill-local-event-images.ts'],
  'matchmaking-once': ['api/active-friends-worker-main.ts'],
  'dining-scrape': ['scripts/scrape-dining-menus.ts'],
  'dining-preview': ['tools/dining-preview/server.ts'],
}

const [action, ...rest] = process.argv.slice(2)
if (!Object.hasOwn(actions, action ?? '')) {
  console.error(`Usage: pnpm demo <action> [args…]\nActions: ${Object.keys(actions).join(', ')}`)
  process.exit(1)
}
// A caller that already chose a stack (the integration run) passes it in the environment.
let env = process.env // the dining tools use no credentials, so they skip the stack
if (!env.PEBBLE_SUPABASE_PROJECT_ID && !action.startsWith('dining-')) {
  try {
    const stack = requireStack(root, {})
    env = childEnv(stack, stackKeys(stack))
  } catch (error) {
    console.error(error.message.startsWith('No local stack') ? error.message : 'Local Supabase for this worktree is not running. Run pnpm dev first.')
    process.exit(1)
  }
}
const result = spawnSync(resolve(root, 'node_modules/.bin/tsx'), [...actions[action], ...rest], { cwd: root, env, stdio: 'inherit' })
process.exit(result.status ?? 1)
