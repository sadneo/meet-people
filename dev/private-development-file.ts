import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Stats } from 'node:fs'

const execute = promisify(execFile)
type WindowsAccess = { user: string; owner: string; reparse: boolean; allows: string[] }
export function privateWindowsAccess(value: WindowsAccess) {
  // Administrators and SYSTEM already control this machine. No other user or group may access credentials.
  const trusted = new Set([value.user, 'S-1-5-18', 'S-1-5-32-544'])
  return /^S-1-5-21-/.test(value.user) && value.owner === value.user && !value.reparse &&
    Array.isArray(value.allows) && value.allows.length > 0 && value.allows.every(sid => trusted.has(sid))
}
export function privatePosixAccess(stat: Pick<Stats, 'uid' | 'mode'>, uid: number | undefined) {
  return uid !== undefined && stat.uid === uid && (stat.mode & 0o7777) === 0o600
}
export async function validatePrivateDevelopmentFile(path: string, stat: Stats) {
  if (process.platform !== 'win32') {
    if (!privatePosixAccess(stat, process.getuid?.())) throw new Error('Invalid credential file permissions')
    return
  }
  // Fixed script and environment argument: never interpolate a path into shell source.
  // Windows mode bits/getuid cannot describe NTFS access control.
  const script = `
$ErrorActionPreference = 'Stop'
$attributes = [System.IO.File]::GetAttributes($env:PEBBLE_CREDENTIAL_FILE)
$acl = [System.IO.File]::GetAccessControl($env:PEBBLE_CREDENTIAL_FILE)
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allows = @($acl.Access | Where-Object { $_.AccessControlType -eq 'Allow' } | ForEach-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value })
@{ user = $user; owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; reparse = [bool]($attributes -band [System.IO.FileAttributes]::ReparsePoint); allows = $allows } | ConvertTo-Json -Compress
`
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 5000, maxBuffer: 16384, env: { ...process.env, PEBBLE_CREDENTIAL_FILE: path },
  })
  if (!privateWindowsAccess(JSON.parse(stdout))) throw new Error('Invalid credential file permissions')
}
