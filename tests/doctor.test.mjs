import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diagnose } from '../scripts/doctor.mjs'

const projectId = 'meet-people-wt-x'
const stack = { projectId, ports: { api: 55321, db: 55322, shadow: 55320, studio: 55323, mail: 55324 }, apiUrl: 'http://127.0.0.1:55321', dbContainer: `supabase_db_${projectId}` }

function fixture(overrides = {}) {
  const calls = [], reads = []
  const secret = 'PRIVATE_SENTINEL_MUST_NEVER_APPEAR'
  const environment = `GOOGLE_CLIENT_ID=google-client\nSANDBOX_SUPABASE_SERVICE_ROLE_KEY=${secret}\n`
  const options = {
    directory: '/project', stack, home: '/private-home', uid: 1000, env: {}, node: '22.23.4',
    read: async path => {
      reads.push(path)
      if (path.endsWith('package.json')) return '{"packageManager":"pnpm@11.25.0"}'
      if (path === '/project/.env') return environment
      throw Object.assign(new Error(secret), { code: 'ENOENT' })
    },
    stat: async path => {
      if (path.endsWith('podman.sock')) throw new Error(secret)
      return { isFile: () => true, uid: 1000, mode: 0o100600, size: 256 }
    },
    probe: async () => false,
    which: async () => true,
    run: async (file, args, options) => {
      calls.push({ file, args, options })
      if (file === 'pnpm') return { stdout: args[0] === '--version' ? '11.25.0' : '2.117.0' }
      if (args[0] === 'info') return { stdout: '"engine-version"' }
      if (args[0] === 'inspect') return { stdout: `{"running":true,"project":"${stack.projectId}"}` }
      if (args[0] === 'exec') return { stdout: '{"missing":[],"worker":true}' }
      throw new Error(secret)
    },
    ...overrides,
  }
  return { options, calls, reads, secret }
}
const check = (report, id) => report.checks.find(item => item.id === id)

test('healthy local setup is inspected without mutations, authentication or secret output', async () => {
  const { options, calls, reads, secret } = fixture()
  const report = await diagnose(options)
  assert.equal(report.summary.fail, 0)
  assert.equal(check(report, 'schema').status, 'pass')
  assert.equal(check(report, 'development-login').status, 'pass')
  assert.ok(!JSON.stringify(report).includes(secret))
  assert.ok(reads.every(path => !path.includes('development-account.json')))
  assert.ok(calls.every(call => call.options.timeout === 5000 && call.options.maxBuffer === 65536))
  for (const { file, args } of calls) {
    if (file === 'pnpm') assert.ok(args.join(' ') === '--version' || args.join(' ') === 'exec supabase --version')
    else assert.ok(file === 'docker' && ['info', 'inspect', 'exec'].includes(args[0]))
  }
  const sql = calls.find(call => call.file === 'docker' && call.args[0] === 'exec').args
  assert.ok(sql.includes(stack.dbContainer))
  assert.ok(calls.filter(call => call.args[0] === 'inspect').every(call => call.args.at(-1) === stack.dbContainer))
  assert.ok(sql.includes('PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=3000'))
  assert.match(sql.at(-1), /^select /)
  assert.doesNotMatch(sql.at(-1), /insert|update|delete|create|drop|reset|alter/i)
})

test('missing tools and dependencies produce bounded, redacted failures', async () => {
  const { options, secret } = fixture({
    node: '20.0.0', run: async () => { throw new Error('PRIVATE_SENTINEL_MUST_NEVER_APPEAR') },
    stat: async () => { throw new Error('missing') },
  })
  const report = await diagnose(options)
  for (const id of ['node', 'pnpm', 'dependencies', 'supabase-cli', 'docker']) assert.equal(check(report, id).status, 'fail')
  assert.equal(check(report, 'schema'), undefined)
  assert.ok(!JSON.stringify(report).includes(secret))
})

test('foreign or stopped database containers never receive SQL commands', async () => {
  for (const metadata of ['{"running":true,"project":"foreign"}', `{"running":false,"project":"${stack.projectId}"}`, 'invalid']) {
    const { options, calls } = fixture()
    const original = options.run
    options.run = async (file, args, config) => file === 'docker' && args[0] === 'inspect' ? { stdout: metadata } : original(file, args, config)
    const report = await diagnose(options)
    assert.equal(check(report, 'supabase-db').status, 'fail')
    assert.ok(!calls.some(call => call.file === 'docker' && call.args[0] === 'exec'))
  }
})

test('a foreign project label is rejected even when the default meet-people project is expected elsewhere', async () => {
  const { options, calls } = fixture()
  const original = options.run
  options.run = async (file, args, config) => file === 'docker' && args[0] === 'inspect' ? { stdout: '{"running":true,"project":"meet-people"}' } : original(file, args, config)
  assert.equal(check(await diagnose(options), 'supabase-db').status, 'fail')
  assert.ok(!calls.some(call => call.file === 'docker' && call.args[0] === 'exec'))
})

test('legacy env files are warnings that name the file', async () => {
  const { options } = fixture()
  const original = options.read
  options.read = async path => ['/project/.env.local', '/project/supabase/.env'].includes(path) ? 'X=1' : original(path)
  const report = await diagnose(options)
  assert.equal(check(report, 'legacy-env:.env.local').status, 'warn')
  assert.match(check(report, 'legacy-env:supabase/.env').message, /supabase\/\.env is retired and may still be picked up by Vite or the Supabase CLI\. Move its secrets to \.env/)
  assert.equal(report.summary.fail, 0)
  assert.ok(!(await diagnose(fixture().options)).checks.some(item => item.id.startsWith('legacy-env:')))
})

test('hosted connection values left in an old-style .env are named, never printed', async () => {
  const { options } = fixture()
  const original = options.read
  options.read = async path => path === '/project/.env' ? 'VITE_API_BASE_URL=https://pebble.garden\nSUPABASE_SERVICE_ROLE_KEY=PRIVATE_SENTINEL_MUST_NEVER_APPEAR\nGOOGLE_CLIENT_ID=x' : original(path)
  const report = await diagnose(options)
  assert.equal(check(report, 'env-hosted-values').status, 'warn')
  assert.match(check(report, 'env-hosted-values').message, /VITE_API_BASE_URL, SUPABASE_SERVICE_ROLE_KEY/)
  assert.ok(!JSON.stringify(report).includes('PRIVATE_SENTINEL_MUST_NEVER_APPEAR'))
  assert.equal(check(await diagnose(fixture().options), 'env-hosted-values'), undefined)
})

test('a missing .env is a warning, not a failure', async () => {
  const { options } = fixture()
  const original = options.read
  options.read = async path => path === '/project/.env' ? Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' })) : original(path)
  const report = await diagnose(options)
  assert.equal(check(report, 'env-file:.env').status, 'warn')
  assert.equal(report.summary.fail, 0)
})

test('no local stack fails supabase-db without touching the database', async () => {
  const { options, calls } = fixture({ stack: null })
  const report = await diagnose(options)
  assert.equal(check(report, 'supabase-db').status, 'fail')
  assert.match(check(report, 'supabase-db').message, /No local stack for this worktree\. Run pnpm dev first\./)
  assert.ok(!calls.some(call => call.file === 'docker' && ['inspect', 'exec'].includes(call.args[0])))
})

test('development credentials are looked up in the stack credentials directory', async () => {
  const { options } = fixture()
  const seen = []
  const original = options.stat
  options.stat = async path => { seen.push(path); return original(path) }
  await diagnose(options)
  assert.ok(seen.includes('/private-home/.local/share/pebble/meet-people-wt-x/development-account.json'))
})

test('schema failures and missing prerequisites are reported without applying migrations', async () => {
  for (const stdout of ['{"missing":["get_account()"],"worker":false}', 'not-json', '{"missing":["PRIVATE_SENTINEL_MUST_NEVER_APPEAR"],"worker":true}']) {
    const { options, secret } = fixture()
    const original = options.run
    options.run = async (file, args, config) => file === 'docker' && args[0] === 'exec' ? { stdout } : original(file, args, config)
    const report = await diagnose(options)
    assert.equal(check(report, 'schema').status, 'fail')
    assert.ok(!JSON.stringify(report).includes(secret))
  }
})

test('private VITE_* names and mismatched API ports are reported without contacting remote services', async () => {
  const { options, secret } = fixture({ env: { VITE_PRIVATE_KEY: 'PRIVATE_SENTINEL_MUST_NEVER_APPEAR', PORT: '4001', VITE_PORT: '4000' } })
  const ports = []
  options.probe = async port => { ports.push(port); return true }
  const report = await diagnose(options)
  assert.equal(check(report, 'browser-secrets').status, 'fail')
  assert.equal(check(report, 'api-proxy').status, 'warn')
  assert.deepEqual(ports, [4000, 4000, 4001])
  assert.ok(!JSON.stringify(report).includes(secret))
})

test('optional capabilities, occupied ports and newer Node versions are warnings rather than failures', async () => {
  const { options } = fixture({ node: '26.0.0', probe: async () => true, env: { VITE_PORT: '4000', PORT: '4001', API_PORT: '4001' } })
  const report = await diagnose(options)
  for (const id of ['node', 'maps', 'port:web', 'port:mobile', 'port:api']) assert.equal(check(report, id).status, 'warn')
  assert.equal(report.summary.fail, 0)
})

test('unsafe development credential metadata is not mistaken for a usable account', async () => {
  const { options } = fixture()
  const original = options.stat
  options.stat = async path => path.endsWith('development-account.json') ? { isFile: () => false, mode: 0o777, uid: 99, size: 99999 } : original(path)
  assert.equal(check(await diagnose(options), 'development-login').status, 'warn')
})

test('rootless Podman socket fallback is scoped to diagnostic subprocesses', async () => {
  const { options, calls } = fixture()
  const original = options.stat
  options.stat = async path => path.endsWith('podman.sock') ? { isSocket: () => true } : original(path)
  await diagnose(options)
  assert.ok(calls.filter(call => call.file === 'docker').every(call => call.options.env.DOCKER_HOST === 'unix:///run/user/1000/podman/podman.sock'))
  assert.equal(options.env.DOCKER_HOST, undefined)
})

test('ports nobody configured are not probed', async () => {
  const { options } = fixture({ probe: async () => assert.fail('No port is configured') })
  const report = await diagnose(options)
  assert.equal(report.checks.some(item => item.id.startsWith('port:')), false)
})

test('invalid ports fail without being probed', async () => {
  const { options } = fixture({ env: { VITE_PORT: 'invalid', PORT: '70000' } })
  options.probe = async () => { assert.fail('Invalid ports must not be probed') }
  const report = await diagnose(options)
  for (const id of ['port:web', 'port:api']) assert.equal(check(report, id).status, 'fail')
})

test('a private VITE_* name inside .env fails the browser-secrets check', async () => {
  const { options } = fixture()
  const original = options.read
  options.read = async path => path === '/project/.env' ? 'VITE_SERVICE_ROLE_KEY=x' : original(path)
  assert.equal(check(await diagnose(options), 'browser-secrets').status, 'fail')
})

test('unreadable environment files and SQL command failures never expose error contents', async () => {
  const { options, secret } = fixture()
  const originalRead = options.read, originalRun = options.run
  options.read = async path => {
    if (path === '/project/.env') throw Object.assign(new Error(secret), { code: 'EACCES' })
    return originalRead(path)
  }
  options.run = async (file, args, config) => {
    if (file === 'docker' && args[0] === 'exec') throw new Error(secret)
    return originalRun(file, args, config)
  }
  const report = await diagnose(options)
  assert.equal(check(report, 'env-file:.env').status, 'fail')
  assert.equal(check(report, 'schema').status, 'fail')
  assert.ok(!JSON.stringify(report).includes(secret))
})
