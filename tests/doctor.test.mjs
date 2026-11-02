import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diagnose } from '../scripts/doctor.mjs'

function fixture(overrides = {}) {
  const calls = [], reads = []
  const secret = 'PRIVATE_SENTINEL_MUST_NEVER_APPEAR'
  const environment = `SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_test\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test\nSUPABASE_SERVICE_ROLE_KEY=${secret}\n`
  const options = {
    directory: '/project', home: '/private-home', uid: 1000, env: {}, node: '22.23.4',
    read: async path => {
      reads.push(path)
      if (path.endsWith('package.json')) return '{"packageManager":"pnpm@11.25.0"}'
      if (path.endsWith('.env.local')) return environment
      throw Object.assign(new Error(secret), { code: 'ENOENT' })
    },
    stat: async path => {
      if (path.endsWith('podman.sock')) throw new Error(secret)
      return { isFile: () => true, uid: 1000, mode: 0o100600, size: 256 }
    },
    probe: async () => false,
    run: async (file, args, options) => {
      calls.push({ file, args, options })
      if (file === 'pnpm') return { stdout: args[0] === '--version' ? '11.25.0' : '2.117.0' }
      if (args[0] === 'info') return { stdout: '"engine-version"' }
      if (args[0] === 'inspect') return { stdout: '{"running":true,"project":"meet-people"}' }
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
  for (const metadata of ['{"running":true,"project":"foreign"}', '{"running":false,"project":"meet-people"}', 'invalid']) {
    const { options, calls } = fixture()
    const original = options.run
    options.run = async (file, args, config) => file === 'docker' && args[0] === 'inspect' ? { stdout: metadata } : original(file, args, config)
    const report = await diagnose(options)
    assert.equal(check(report, 'supabase-db').status, 'fail')
    assert.ok(!calls.some(call => call.file === 'docker' && call.args[0] === 'exec'))
  }
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

test('environment precedence, public keys and secret variable names are checked without contacting remote services', async () => {
  const { options, secret } = fixture({ env: {
    SUPABASE_URL: 'https://remote.example.test', VITE_SUPABASE_URL: 'https://remote.example.test',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_PRIVATE_SENTINEL_MUST_NEVER_APPEAR',
    VITE_PRIVATE_KEY: 'PRIVATE_SENTINEL_MUST_NEVER_APPEAR', PORT: '4001',
  } })
  const ports = []
  options.probe = async port => { ports.push(port); return true }
  const report = await diagnose(options)
  assert.equal(check(report, 'SUPABASE_URL').status, 'warn')
  assert.equal(check(report, 'VITE_SUPABASE_PUBLISHABLE_KEY').status, 'fail')
  assert.equal(check(report, 'browser-secrets').status, 'fail')
  assert.equal(check(report, 'api-proxy').status, 'warn')
  assert.deepEqual(ports, [3000, 4001])
  assert.ok(!JSON.stringify(report).includes(secret))
})

test('optional capabilities, occupied ports and newer Node versions are warnings rather than failures', async () => {
  const { options } = fixture({ node: '26.0.0', probe: async () => true })
  const report = await diagnose(options)
  for (const id of ['node', 'maps', 'port:web', 'port:api']) assert.equal(check(report, id).status, 'warn')
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

test('missing environment values and invalid ports fail without probing invalid endpoints', async () => {
  const { options } = fixture({ env: { VITE_PORT: 'invalid', PORT: '70000' } })
  const original = options.read
  options.read = async path => path.endsWith('.env.local') ? '' : original(path)
  options.probe = async () => { assert.fail('Invalid ports must not be probed') }
  const report = await diagnose(options)
  for (const id of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'server-key', 'port:web', 'port:api']) assert.equal(check(report, id).status, 'fail')
})

test('different browser and API backends fail, including Vite mode-specific overrides', async () => {
  const { options } = fixture()
  const original = options.read
  options.read = async path => path.endsWith('.env.development.local') ? 'VITE_SUPABASE_URL=http://127.0.0.1:55421' : original(path)
  assert.equal(check(await diagnose(options), 'supabase-targets').status, 'fail')
})

test('unreadable environment files and SQL command failures never expose error contents', async () => {
  const { options, secret } = fixture()
  const originalRead = options.read, originalRun = options.run
  options.read = async path => {
    if (path.endsWith('.env.development')) throw Object.assign(new Error(secret), { code: 'EACCES' })
    return originalRead(path)
  }
  options.run = async (file, args, config) => {
    if (file === 'docker' && args[0] === 'exec') throw new Error(secret)
    return originalRun(file, args, config)
  }
  const report = await diagnose(options)
  assert.equal(check(report, 'env-file:.env.development').status, 'fail')
  assert.equal(check(report, 'schema').status, 'fail')
  assert.ok(!JSON.stringify(report).includes(secret))
})
