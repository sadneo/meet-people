import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { requireStack, supabaseStatus } from './lib/stack.mjs'

export function ensureLocalEnv({ apiUrl, publishableKey, serviceRoleKey }, file = '.env.local') {
  try {
    writeFileSync(file, [
      `VITE_SUPABASE_URL=${apiUrl}`,
      `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
      `SUPABASE_URL=${apiUrl}`,
      `SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
      `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
      '',
    ].join('\n'), { flag: 'wx', mode: 0o600 })
    return true
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stack = requireStack()
  const values = supabaseStatus(stack)
  ensureLocalEnv({
    apiUrl: values.API_URL ?? values.SUPA_API_URL,
    publishableKey: values.PUBLISHABLE_KEY ?? values.ANON_KEY ?? values.SUPA_ANON_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY ?? values.SUPA_SERVICE_ROLE_KEY,
  })
}
