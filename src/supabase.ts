import { createClient } from '@supabase/supabase-js'
import { env } from './env'
import type { Database } from './types/database'

// This route alone consumes callback grants explicitly after immediately
// scrubbing their URL. Match router case/encoding/trailing-slash handling.
const explicitCallback = (() => {
  if (typeof window === 'undefined') return false
  try { return decodeURIComponent(window.location.pathname).replace(/\/+$/, '').toLowerCase() === '/auth/callback' }
  catch { return false }
})()
export const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
  ? createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, explicitCallback ? { auth: { detectSessionInUrl: false } } : undefined)
  : null
