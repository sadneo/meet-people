import { z } from 'zod'

export const ApiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  })
  .refine(
    (env) => Boolean(env.SUPABASE_URL) === Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set together.',
  )

export function parseApiEnv(input: unknown) {
  const result = ApiEnvSchema.safeParse(input)

  if (!result.success) {
    throw new Error(`Invalid API environment: ${z.prettifyError(result.error)}`)
  }

  return result.data
}

export const env = parseApiEnv(process.env)
