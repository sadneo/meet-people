export type Stack = {
  projectId: string
  ports: { api: number; db: number; shadow: number; studio: number; mail: number }
  apiUrl: string
  dbContainer: string
}

type Engine = (args: string[]) => Promise<string>

export function devProjectId(root?: string, home?: string): string
export function credentialsDir(projectId: string, home?: string): string
export function stackEnv(stack: Stack): Record<string, string>
export function readOwner(projectId: string): { pid: number; host: string; started: string } | undefined
export function alive(pid: number): boolean
export function devStack(root?: string, deps?: { container?: Engine; home?: string }): Promise<Stack>
export function testStack(runId: string): Promise<Stack>
export function startStack(
  stack: Stack,
  options?: { minimal?: boolean; workdir?: string; siteUrl?: string },
): Promise<{ apiUrl: string; publishableKey: string; anonKey: string; serviceRoleKey: string }>
export function startDevStack(root?: string, deps?: {
  container?: Engine
  start?: typeof startStack
  remove?: (projectId: string) => Promise<void>
  ports?: (count: number) => Promise<number[]>
  options?: { minimal?: boolean; workdir?: string; siteUrl?: string }
  signal?: AbortSignal
  home?: string
}): Promise<{ stack: Stack; keys: Awaited<ReturnType<typeof startStack>> }>
export function startTestStack(stack: Stack, deps?: {
  start?: typeof startStack
  remove?: (projectId: string) => Promise<void>
  ports?: (count: number) => Promise<number[]>
  options?: { minimal?: boolean; workdir?: string; siteUrl?: string }
  signal?: AbortSignal
}): Promise<{ stack: Stack; keys: Awaited<ReturnType<typeof startStack>> }>
export function removeStack(projectId: string, deps?: { container?: Engine; volumes?: boolean; home?: string }): Promise<void>
export function reapTestStacks(deps?: {
  container?: Engine
  owner?: (projectId: string) => { pid?: number; host?: string; started?: string } | undefined
  remove?: (projectId: string) => Promise<void>
  now?: number
  host?: string
  isAlive?: (pid: number) => boolean
}): Promise<string[]>
export function currentStack(root?: string, env?: Record<string, string | undefined>): Stack | null
export function requireStack(root?: string, env?: Record<string, string | undefined>): Stack
export function supabaseStatus(stack: Stack): Record<string, string>
type Keys = { apiUrl: string; publishableKey: string; serviceRoleKey: string }
export function stackKeys(stack: Stack): Keys
export function childEnv(stack: Stack, keys: Keys): NodeJS.ProcessEnv
export function assertLocalStack(url: string, stack: Stack): void
