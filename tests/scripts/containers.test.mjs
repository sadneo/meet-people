import assert from 'node:assert/strict'
import test from 'node:test'
import { container, engineCli, engineEnv, engineReachable } from '../../scripts/lib/containers.mjs'

const socket = async () => ({ isSocket: () => true })
const missing = async () => { throw new Error('ENOENT') }

test('sets DOCKER_HOST from the podman socket', async () => {
  const env = await engineEnv({ XDG_RUNTIME_DIR: '/run/user/7' }, { stat: socket })
  assert.equal(env.DOCKER_HOST, 'unix:///run/user/7/podman/podman.sock')
})

test('falls back to /run/user/<uid> without XDG_RUNTIME_DIR', async () => {
  const env = await engineEnv({}, { stat: socket })
  assert.equal(env.DOCKER_HOST, `unix:///run/user/${process.getuid()}/podman/podman.sock`)
})

test('leaves an existing DOCKER_HOST untouched', async () => {
  const env = await engineEnv({ DOCKER_HOST: 'tcp://elsewhere:1' }, { stat: socket })
  assert.equal(env.DOCKER_HOST, 'tcp://elsewhere:1')
})

test('leaves DOCKER_HOST unset without a socket', async () => {
  const env = await engineEnv({ PATH: 'x' }, { stat: missing })
  assert.equal(env.DOCKER_HOST, undefined)
  assert.equal(env.PATH, 'x')
})

test('prefers docker, falls back to podman', async () => {
  assert.equal(await engineCli({ which: async () => true }), 'docker')
  assert.equal(await engineCli({ which: async name => name !== 'docker' }), 'podman')
})

test('container runs the CLI, trims stdout and throws on failure', async () => {
  const cli = await engineCli()
  assert.match(await container(['--version']), new RegExp(cli, 'i'))
  assert.equal(typeof await engineReachable(), 'boolean')
  await assert.rejects(container(['definitely-not-a-command']))
})
