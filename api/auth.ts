import type { Request, Response } from 'express'
import type { SupabaseClient, User } from '@supabase/supabase-js'

// Verifies the Supabase bearer token; writes a 401 and returns null otherwise.
export async function authenticate(client: SupabaseClient, request: Request, response: Response, missingMessage = 'Sign in to continue.'): Promise<User | null> {
  const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) { response.status(401).json({ error: missingMessage }); return null }
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) { response.status(401).json({ error: 'Your session has expired. Sign in again.' }); return null }
  return data.user
}
