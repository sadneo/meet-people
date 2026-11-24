import { containerResult, containerSync } from '../lib/containers.mjs'
import { requireStack } from '../lib/stack.mjs'

export const localStack = () => requireStack()

export function verifiedStack(message: string) {
  const stack = localStack()
  const metadata = JSON.parse(containerSync(['inspect', '--format', '{"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}}}', stack.dbContainer]))
  if (!metadata.running || metadata.project !== stack.projectId) throw new Error(message)
  return stack
}

export function psql(args: string[], input: string, maxBuffer?: number) {
  return containerResult(['exec', '-i', localStack().dbContainer, 'psql', ...args], { input, maxBuffer })
}
