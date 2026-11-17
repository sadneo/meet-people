import type * as Stack from '../../scripts/lib/stack.mjs'

// The no-argument fallback reads the worktree's real .pebble/dev.json; point it at a root that has none.
const noRoot = '/nonexistent/pebble-test-root'

export const hermeticStack = (actual: typeof Stack): typeof Stack => ({
  ...actual,
  currentStack: (root = noRoot, env = process.env) => actual.currentStack(root, env),
  requireStack: (root = noRoot, env = process.env) => actual.requireStack(root, env),
})
