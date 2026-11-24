import assert from 'node:assert/strict'
import { test } from 'node:test'
import { group, render } from '../../scripts/status.mjs'

const worktrees = [
  { path: '/p/pebble', branch: 'dev', projectId: 'meet-people', ports: { api: 54321, db: 54322, studio: 54323 } },
  { path: '/p/pebble-x', branch: 'feat/x', projectId: 'meet-people-wt-x' },
]
const proc = (pid, ppid, args, extra = {}) => ({ pid, ppid, rss: 1024, age: 3700, args, ...extra })
const procs = [
  proc(10, 1, 'node scripts/dev.mjs', { cwd: '/p/pebble-x' }),
  proc(11, 10, 'node /p/pebble-x/node_modules/vite/bin/vite.js', { cwd: '/p/pebble-x', env: { VITE_PORT: '3000' } }),
  proc(12, 10, 'node /p/pebble-x/node_modules/vite/bin/vite.js --config vite.mobile.config.ts', { cwd: '/p/pebble-x', env: { VITE_PORT: '3002' } }),
  proc(13, 10, 'node /p/pebble-x/node_modules/tsx/dist/cli.mjs watch api/server.ts', { cwd: '/p/pebble-x', env: { PORT: '3001', VITE_PORT: '9' } }),
  proc(14, 13, 'node --require tsx api/server.ts', { cwd: '/p/pebble-x' }),
  proc(15, 10, 'node /p/pebble-x/node_modules/tsx/dist/cli.mjs scripts/run-local-event-groups.ts --watch', { cwd: '/p/pebble-x' }),
  proc(20, 1, 'node scripts/test-integration.mjs', { cwd: '/p/pebble' }),
  proc(21, 20, 'node scripts/test-browser.mjs', { cwd: '/p/pebble' }),
  proc(30, 1, 'node /p/pebble/node_modules/vite/bin/vite.js', { cwd: '/p/pebble' }),
  proc(31, 30, 'node /p/pebble/node_modules/vite/bin/vite.js', { cwd: '/p/pebble' }),
  proc(40, 1, 'node scripts/dev.mjs --status', { cwd: '/p/pebble' }),
]
const containers = [
  { project: 'meet-people', count: 8, since: '19 hours' },
  { project: 'meet-people-wt-x', count: 8, since: '10 hours' },
  { project: 'meet-people-test-live', count: 5, since: '3 minutes' },
  { project: 'meet-people-test-dead', count: 4, since: '2 days' },
  { project: 'meet-people-wt-gone', count: 6, since: '3 days' },
]
const owners = { 'meet-people-test-live': { pid: 20 }, 'meet-people-test-dead': { pid: 99 } }
const model = group({ procs, containers, worktrees, owners, isAlive: pid => pid !== 99 })

test('dev launchers own their parts, by worktree, with subtree memory and ports', () => {
  const [main, x] = model.worktrees
  assert.equal(main.path, '/p/pebble')
  assert.equal(main.launchers.length, 0)
  assert.equal(main.stack.count, 8)
  assert.deepEqual(x.launchers.map(launcher => launcher.name), ['pnpm dev'])
  assert.deepEqual(x.launchers[0].parts.map(part => [part.name, part.port, part.rss]), [['web', '3000', 1024], ['mobile', '3002', 1024], ['api', '3001', 2048], ['worker', undefined, 1024]])
})

test('a nested launcher is a part of the outermost; test stacks attach to their live owner', () => {
  assert.equal(model.tests.length, 1)
  assert.equal(model.tests[0].name, 'pnpm test:integration')
  assert.deepEqual(model.tests[0].parts.map(part => part.name), ['test-browser.mjs'])
  assert.deepEqual(model.tests[0].stacks.map(stack => stack.project), ['meet-people-test-live'])
})

test('leftovers: dead-owner test stack, stack no worktree uses, and the top of an orphaned app process', () => {
  assert.deepEqual(model.leftovers.map(left => left.label), ['web pid 30', 'meet-people-test-dead', 'meet-people-wt-gone'])
  assert.equal(model.leftovers[0].hint, 'kill 30')
  assert.match(model.leftovers[1].detail, /owner pid 99 is gone/)
  assert.match(model.leftovers[2].hint, /^podman rm -f /)
})

test('render prints groups, home-relative paths and a summary', () => {
  const text = render(model, { home: '/p' })
  for (const expected of ['● feat/x  ~/pebble-x', 'web         pid 11', ':3000', '◆ test run', '! leftovers', '→ kill 30', 'up 1h01m', 'api :54321']) assert.ok(text.includes(expected), expected)
  assert.match(text, /2 dev stacks \(16 containers\) · 5 app processes · 1 test run · 3 leftovers$/)
})

test('an unreachable container engine still lists processes', () => {
  const down = group({ procs, containers: null, worktrees })
  assert.equal(down.worktrees.length, 1)
  assert.match(render(down), /Container engine not reachable/)
})
