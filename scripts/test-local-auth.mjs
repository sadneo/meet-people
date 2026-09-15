import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const status = execFileSync('sh', ['scripts/supabase.sh', 'status', '--output', 'env'], { encoding: 'utf8' })
const values = Object.fromEntries(status.trim().split('\n').map((line) => {
  const [key, value] = line.split(/=(.*)/s, 2)
  return [key, value.replace(/^"|"$/g, '')]
}))
const supabase = createClient(values.API_URL ?? values.SUPA_API_URL, values.PUBLISHABLE_KEY ?? values.SUPA_ANON_KEY)
const email = `smoke-${randomUUID()}@example.test`
const { data, error } = await supabase.auth.signUp({ email, password: 'local-smoke-test-password' })

if (error || !data.user || !data.session) {
  throw error ?? new Error('Local sign-up did not create an active session.')
}

await supabase.auth.signOut()
