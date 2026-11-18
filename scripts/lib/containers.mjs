import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { stat as fsStat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const maxBuffer = 8 * 1024 * 1024
const socketPath = (env, uid = process.getuid()) => join(env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`, 'podman/podman.sock')
const withSocket = (env, uid, info) => info?.isSocket() ? { ...env, DOCKER_HOST: `unix://${socketPath(env, uid)}` } : { ...env }
const onPath = name => (process.env.PATH ?? '').split(delimiter).filter(Boolean).some(directory => { try { accessSync(join(directory, name), constants.X_OK); return true } catch { return false } })
const cliName = found => found ? 'docker' : 'podman'

export async function engineEnv(env = process.env, { stat = fsStat, uid } = {}) {
  if (env.DOCKER_HOST) return { ...env }
  return withSocket(env, uid, await Promise.resolve(stat(socketPath(env, uid))).catch(() => null))
}

function engineEnvSync(env) {
  if (env.DOCKER_HOST) return { ...env }
  try { return withSocket(env, undefined, statSync(socketPath(env))) } catch { return { ...env } }
}

export async function engineCli({ which = onPath } = {}) {
  return cliName(await which('docker'))
}

export async function container(args, { input, env } = {}) {
  const run = execute(await engineCli(), args, { env: await engineEnv({ ...process.env, ...env }), maxBuffer, encoding: 'utf8' })
  if (input !== undefined) {
    run.child.stdin.on('error', () => {})
    run.child.stdin.end(input)
  }
  return (await run).stdout.trim()
}

const cliSync = () => cliName(onPath('docker'))

export function containerSync(args, { input, env } = {}) {
  return execFileSync(cliSync(), args, { input, env: engineEnvSync({ ...process.env, ...env }), maxBuffer, encoding: 'utf8' }).trim()
}

export function containerResult(args, { input, env, maxBuffer: limit = maxBuffer, encoding = 'utf8' } = {}) {
  return spawnSync(cliSync(), args, { input: typeof input === 'string' && encoding === 'buffer' ? Buffer.from(input) : input, env: engineEnvSync({ ...process.env, ...env }), maxBuffer: limit, encoding })
}

export async function engineReachable() {
  try { await container(['info']); return true } catch { return false }
}
