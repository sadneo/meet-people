import type { SpawnSyncReturns } from 'node:child_process'

type Options = { input?: string | Buffer; env?: Record<string, string | undefined> }
type Result = { maxBuffer?: number }

export function container(args: string[], options?: Options): Promise<string>
export function containerSync(args: string[], options?: Options): string
export function containerResult(args: string[], options: Options & Result & { encoding: 'buffer' }): SpawnSyncReturns<Buffer>
export function containerResult(args: string[], options?: Options & Result): SpawnSyncReturns<string>
export function engineReachable(): Promise<boolean>
