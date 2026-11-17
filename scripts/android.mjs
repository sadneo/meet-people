import { spawnSync } from 'node:child_process'
import { childEnv, currentStack, stackKeys } from './lib/stack.mjs'

const args = process.argv.slice(2)
const dev = args.includes('--dev')
const shell = process.platform === 'win32' // pnpm is a .cmd shim on Windows
const stack = args.includes('--user') && currentStack()
let env = process.env
if (stack) {
  try { env = childEnv(stack, stackKeys(stack)) } catch {
    console.error('Local Supabase for this worktree is not running. Run pnpm dev first.')
    process.exit(1)
  }
}
const steps = args.includes('--user')
  ? [['node', '--env-file-if-exists=.env.local', 'scripts/create-android-dev-user.mjs']]
  : dev
    ? [['node', 'scripts/build-android-dev.mjs'], ['pnpm', 'exec', 'cap', 'open', 'android']]
    : [['pnpm', 'exec', 'vite', 'build', '--config', 'vite.mobile.config.ts', '--mode', 'android'], ['pnpm', 'exec', 'cap', 'sync', 'android'], ['pnpm', 'exec', 'cap', 'open', 'android']]
for (const [command, ...rest] of steps) {
  const result = spawnSync(command, rest, { stdio: 'inherit', shell, env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
