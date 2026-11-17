import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { accessSync, constants, statSync } from 'node:fs'
import { access, stat as fsStat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const maxBuffer = 8 * 1024 * 1024
const socketPath = env => join(env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid()}`, 'podman/podman.sock')
const withHost = (env, socket) => socket ? { ...env, DOCKER_HOST: `unix://${socketPath(env)}` } : { ...env }
const pathDirectories = () => (process.env.PATH ?? '').split(delimiter).filter(Boolean)

export async function engineEnv(env = process.env, { stat = fsStat } = {}) {
  if (env.DOCKER_HOST) return { ...env }
  try { return withHost(env, (await stat(socketPath(env))).isSocket()) } catch { return { ...env } }
}

function engineEnvSync(env) {
  if (env.DOCKER_HOST) return { ...env }
  try { return withHost(env, statSync(socketPath(env)).isSocket()) } catch { return { ...env } }
}

async function onPath(name) {
  for (const directory of pathDirectories()) {
    try { await access(join(directory, name), constants.X_OK); return true } catch { /* try the next directory */ }
  }
  return false
}

export async function engineCli({ which = onPath } = {}) {
  return await which('docker') ? 'docker' : 'podman'
}

export async function container(args, { input, env } = {}) {
  const run = execute(await engineCli(), args, { env: await engineEnv({ ...process.env, ...env }), maxBuffer, encoding: 'utf8' })
  if (input !== undefined) {
    run.child.stdin.on('error', () => {})
    run.child.stdin.end(input)
  }
  return (await run).stdout.trim()
}

const cliSync = () => pathDirectories().some(directory => { try { accessSync(join(directory, 'docker'), constants.X_OK); return true } catch { return false } }) ? 'docker' : 'podman'

export function containerSync(args, { input, env } = {}) {
  return execFileSync(cliSync(), args, { input, env: engineEnvSync({ ...process.env, ...env }), maxBuffer, encoding: 'utf8' }).trim()
}

export function containerResult(args, { input, env, maxBuffer: limit = maxBuffer, encoding = 'utf8' } = {}) {
  return spawnSync(cliSync(), args, { input: typeof input === 'string' && encoding === 'buffer' ? Buffer.from(input) : input, env: engineEnvSync({ ...process.env, ...env }), maxBuffer: limit, encoding })
}

export async function engineReachable() {
  try { await container(['info']); return true } catch { return false }
}
