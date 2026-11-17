export type Stack = {
  projectId: string
  ports: { api: number; db: number; shadow: number; studio: number; mail: number }
  apiUrl: string
  dbContainer: string
}

type Engine = (args: string[]) => Promise<string>

export function devProjectId(root?: string): string
export function credentialsDir(projectId: string, home?: string): string
export function stackEnv(stack: Stack): Record<string, string>
export function devStack(root?: string, deps?: { container?: Engine }): Promise<Stack>
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
}): Promise<{ stack: Stack; keys: Awaited<ReturnType<typeof startStack>> }>
export function removeStack(projectId: string, deps?: { container?: Engine }): Promise<void>
export function reapTestStacks(deps?: {
  container?: Engine
  owner?: (projectId: string) => number | undefined
  remove?: (projectId: string) => Promise<void>
}): Promise<string[]>
export function currentStack(root?: string, env?: Record<string, string | undefined>): Stack | null
export function requireStack(root?: string, env?: Record<string, string | undefined>): Stack
export function supabaseStatus(stack: Stack): Record<string, string>
type Keys = { apiUrl: string; publishableKey: string; serviceRoleKey: string }
export function stackKeys(stack: Stack): Keys
export function childEnv(stack: Stack, keys: Keys): NodeJS.ProcessEnv
export function assertLocalStack(url: string, stack: Stack): void
