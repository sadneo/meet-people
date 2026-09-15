import { z } from 'zod'

export const BrowserEnvSchema = z
  .object({
    VITE_SUPABASE_URL: z.string().url().optional(),
    VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  })
  .refine(
    (env) => Boolean(env.VITE_SUPABASE_URL) === Boolean(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set together.',
  )

export function parseBrowserEnv(input: unknown) {
  const result = BrowserEnvSchema.safeParse(input)

  if (!result.success) {
    throw new Error(`Invalid browser environment: ${z.prettifyError(result.error)}`)
  }

  return result.data
}

export const env = parseBrowserEnv(import.meta.env)
