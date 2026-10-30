import { z } from 'zod'

export function isPublicSupabaseKey(key: string) {
  if (key.startsWith('sb_publishable_')) return key.length > 'sb_publishable_'.length
  try {
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return false
    const payload: unknown = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString())
    return z.object({ role: z.literal('anon') }).safeParse(payload).success
  } catch { return false }
}

export const ApiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_PUBLISHABLE_KEY: z.string().refine(isPublicSupabaseKey, 'Must be a public publishable or anon key.').optional(),
    GOOGLE_MAPS_SERVER_API_KEY: z.string().min(1).optional(),
    SEARCH_LOCATION_SIGNING_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    GOOGLE_MAPS_STORAGE_APPROVED: z.enum(['true', 'false']).default('false'),
    GOOGLE_MAPS_REQUESTS_PER_DAY: z.coerce.number().int().min(1).max(100000).default(2000),
  })
  .refine(
     (env) => Boolean(env.SUPABASE_URL) === Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY),
    'SUPABASE_URL requires a server or public Supabase key, and keys require a URL.',
  )

export function parseApiEnv(input: unknown) {
  const result = ApiEnvSchema.safeParse(input)

  if (!result.success) {
    throw new Error(`Invalid API environment: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }

  return result.data
}

export const env = parseApiEnv(process.env)
