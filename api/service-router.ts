import type { NextFunction, Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'

// For routers that call service-role SQL on behalf of the verified caller. The
// user ID comes only from the token, never from the request body or query.
export function requireVerifiedUser(client: SupabaseClient | null, messages: { unconfigured: string; signIn: string }) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (!client) { response.status(503).json({ error: messages.unconfigured }); return }
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) { response.status(401).json({ error: messages.signIn }); return }
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) { response.status(401).json({ error: 'Your session has expired. Sign in again.' }); return }
    response.locals.userId = data.user.id
    next()
  }
}

// The SQL raises only the listed codes on purpose. Anything else is unexpected,
// including a database permission error: logged here, generic for the client.
export function expectedErrors(expected: Record<string, readonly [number, string]>, label: string, unavailable: string) {
  return (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    const known = typeof code === 'string' ? expected[code] : undefined
    if (known) { response.status(known[0]).json({ error: known[1] }); return }
    console.error(`${label} request failed:`, error)
    response.status(503).json({ error: unavailable })
  }
}
