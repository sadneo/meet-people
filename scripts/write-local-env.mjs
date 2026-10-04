import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const status = execFileSync('sh', ['scripts/supabase.sh', 'status', '--output', 'env'], { encoding: 'utf8' })
const values = Object.fromEntries(status.trim().split('\n').map((line) => {
  const [key, value] = line.split(/=(.*)/s, 2)
  return [key, value.replace(/^"|"$/g, '')]
}))

writeFileSync('.env.local', [
  `VITE_SUPABASE_URL=${values.API_URL ?? values.SUPA_API_URL}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${values.PUBLISHABLE_KEY ?? values.SUPA_ANON_KEY}`,
  `SUPABASE_URL=${values.API_URL ?? values.SUPA_API_URL}`,
  `SUPABASE_SERVICE_ROLE_KEY=${values.SERVICE_ROLE_KEY ?? values.SUPA_SERVICE_ROLE_KEY}`,
  '',
].join('\n'))
