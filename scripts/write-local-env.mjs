import { writeFileSync } from 'node:fs'
import { requireStack, supabaseStatus } from './lib/stack.mjs'

const values = supabaseStatus(requireStack())

writeFileSync('.env.local', [
  `VITE_SUPABASE_URL=${values.API_URL ?? values.SUPA_API_URL}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${values.PUBLISHABLE_KEY ?? values.SUPA_ANON_KEY}`,
  `SUPABASE_URL=${values.API_URL ?? values.SUPA_API_URL}`,
  `SUPABASE_PUBLISHABLE_KEY=${values.PUBLISHABLE_KEY ?? values.ANON_KEY ?? values.SUPA_ANON_KEY}`,
  `SUPABASE_SERVICE_ROLE_KEY=${values.SERVICE_ROLE_KEY ?? values.SUPA_SERVICE_ROLE_KEY}`,
  '',
].join('\n'))
