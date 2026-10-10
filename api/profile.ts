import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { NextFunction, Request, Response } from 'express'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { z } from 'zod'
import { authenticate } from './auth.js'
import {
  AVATAR_TYPES, AvatarUploadRequestSchema, AvatarUploadSchema, BlockedUserSchema, DataExportSchema, DeleteAccountSchema,
  EmailChangeSchema, MeResponseSchema, OwnProfileSchema, PasswordChangeSchema, ProfileUpdateSchema, PublicProfileSchema,
  ReportSchema, SessionSchema, SettingsSchema, SettingsUpdateSchema, UsernameSchema,
} from '../shared/profile.js'

const AVATAR_BUCKET = 'avatars'
const EXPORT_BUCKET = 'exports'
const REPORTS_PER_DAY = 10
const EXPORTS_PER_DAY = 1
const settingsColumns = 'notifications,discoverable,share_availability,nearby_suggestions,dating_enabled,downtime_matching,locale,timezone'
const uuid = z.guid()
const avatarPath = (userId: string) => new RegExp(`^${userId}/[0-9a-f-]{36}\\.(jpg|png|webp)$`)

type DatabaseError = { code?: string; message?: string }
// Translates constraint failures into client errors; anything else is a 503.
function rejectInvalid(response: Response, error: DatabaseError | null) {
  if (!error) return false
  if (error.code === '23505') { response.status(409).json({ error: 'That username is taken.' }); return true }
  if (error.code === 'PU429') { response.status(429).json({ error: error.message }); return true }
  if (error.code === '22023' || error.code === '23514' || error.code === '22007' || error.code === '22008') {
    response.status(400).json({ error: error.code === '22023' && error.message ? error.message : 'Invalid profile details.' }); return true
  }
  throw error
}
function unavailable(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  void _next
  console.error('Profile request failed:', error)
  response.status(503).json({ error: 'Profiles are temporarily unavailable. Please try again.' })
}
function requireClient(client: SupabaseClient | null) {
  return (_request: Request, response: Response, next: NextFunction) => {
    if (!client) { response.status(503).json({ error: 'Profile service is not configured.' }); return }
    next()
  }
}

async function ownProfile(client: SupabaseClient, userId: string) {
  const { data, error } = await client.rpc('profile_snapshot', { p_user_id: userId, p_viewer_id: userId })
  if (error) throw error
  return data ? OwnProfileSchema.parse(data) : null
}
async function profileExists(client: SupabaseClient, response: Response, userId: string) {
  const { data, error } = await client.from('profiles').select('id').eq('id', userId).maybeSingle()
  if (error) throw error
  if (!data) response.status(404).json({ error: 'Create your profile first.' })
  return Boolean(data)
}
async function removeFiles(client: SupabaseClient, bucket: string, userId: string, keep?: string) {
  const { data, error } = await client.storage.from(bucket).list(userId, { limit: 100 })
  if (error) throw error
  const stale = (data ?? []).map(file => `${userId}/${file.name}`).filter(path => path !== keep)
  if (stale.length) {
    const removed = await client.storage.from(bucket).remove(stale)
    if (removed.error) throw removed.error
  }
}

// The token was already verified by authenticate(); this only reads its claims.
function tokenClaims(request: Request): { session_id?: string; aal?: string } {
  try {
    const token = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1] ?? ''
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
  } catch { return {} }
}
const mfaEnabled = (user: User) => (user.factors ?? []).some(factor => factor.status === 'verified')
// Users with two-factor enabled must have verified it in this session.
function requireStepUp(request: Request, response: Response, user: User) {
  if (!mfaEnabled(user) || tokenClaims(request).aal === 'aal2') return true
  response.status(403).json({ error: 'Verify your two-factor code to continue.', code: 'mfa_required' })
  return false
}

// Email and password changes must go through Supabase Auth as the user, so
// confirmation emails and password rules still apply.
export type AuthApi = { url: string; key: string; fetch?: typeof fetch }
async function updateAuthUser(auth: AuthApi, request: Request, response: Response, body: Record<string, string>) {
  const result = await (auth.fetch ?? fetch)(`${auth.url}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: auth.key, Authorization: request.headers.authorization!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (result.ok) return true
  const detail = await result.json().catch(() => ({})) as { code?: string; error_code?: string; msg?: string; message?: string }
  const code = detail.error_code ?? detail.code
  const message = detail.msg ?? detail.message
  if (code === 'email_exists') { response.status(409).json({ error: 'That email is already in use.' }); return false }
  if (code === 'same_password') { response.status(400).json({ error: 'Choose a password you have not used here before.' }); return false }
  if (code === 'weak_password' || code === 'validation_failed' || code === 'email_address_invalid') { response.status(400).json({ error: message ?? 'Invalid details.' }); return false }
  if (result.status === 429) { response.status(429).json({ error: 'Too many attempts. Please try again later.' }); return false }
  throw new Error(`Supabase Auth update failed (${result.status}): ${message ?? 'unknown error'}`)
}

// Signed-in user's own account, profile, settings, avatar, and blocks: /api/me
export function createMeRouter(client: SupabaseClient | null, auth: AuthApi | null = null) {
  const router = Router()
  router.use(requireClient(client))
  const db = () => client!
  const signedIn = (request: Request, response: Response) => authenticate(db(), request, response)
  const account = (user: User) => ({
    id: user.id, email: user.email ?? null, created_at: user.created_at ?? null,
    pending_email: user.new_email ?? null,
    providers: Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers as string[] : [],
    mfa_enabled: mfaEnabled(user),
  })

  router.get('/', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user) return
    const [profile, settings] = await Promise.all([
      ownProfile(db(), user.id),
      db().from('user_settings').select(settingsColumns).eq('profile_id', user.id).maybeSingle(),
    ])
    if (settings.error) throw settings.error
    if (profile) {
      const seen = await db().from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
      if (seen.error) throw seen.error
    }
    response.json(MeResponseSchema.parse({ account: account(user), profile, settings: settings.data }))
  })

  // Creates the profile on first save (username and display_name required),
  // otherwise applies a partial edit. Interests and availability replace the whole set.
  router.patch('/profile', async (request, response) => {
    const parsed = ProfileUpdateSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: z.prettifyError(parsed.error) }); return }
    const user = await signedIn(request, response)
    if (!user) return
    const { interests, availability, ...fields } = parsed.data
    const { error } = await db().rpc('save_profile', {
      p_user_id: user.id, p_profile: fields, p_interests: interests ?? null, p_availability: availability ?? null,
    })
    if (rejectInvalid(response, error)) return
    response.json(await ownProfile(db(), user.id))
  })

  router.get('/username', async (request, response) => {
    const parsed = UsernameSchema.safeParse(request.query.username)
    if (!parsed.success) { response.status(400).json({ error: parsed.error.issues[0].message }); return }
    const user = await signedIn(request, response)
    if (!user) return
    const { data, error } = await db().from('profiles').select('id').eq('username', parsed.data).maybeSingle()
    if (error) throw error
    response.json({ username: parsed.data, available: !data || data.id === user.id })
  })

  router.get('/settings', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user) return
    const { data, error } = await db().from('user_settings').select(settingsColumns).eq('profile_id', user.id).maybeSingle()
    if (error) throw error
    if (!data) { response.status(404).json({ error: 'Create your profile first.' }); return }
    response.json(SettingsSchema.parse(data))
  })

  router.patch('/settings', async (request, response) => {
    const parsed = SettingsUpdateSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid settings.' }); return }
    const user = await signedIn(request, response)
    if (!user) return
    const { data, error } = await db().from('user_settings').update(parsed.data).eq('profile_id', user.id).select(settingsColumns).maybeSingle()
    if (error) throw error
    if (!data) { response.status(404).json({ error: 'Create your profile first.' }); return }
    response.json(SettingsSchema.parse(data))
  })

  // Step 1: get a signed upload URL into the caller's own folder.
  router.post('/avatar', async (request, response) => {
    const parsed = AvatarUploadRequestSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Avatars must be JPEG, PNG, or WebP.' }); return }
    const user = await signedIn(request, response)
    if (!user || !await profileExists(db(), response, user.id)) return
    const path = `${user.id}/${randomUUID()}.${AVATAR_TYPES[parsed.data.content_type]}`
    const { data, error } = await db().storage.from(AVATAR_BUCKET).createSignedUploadUrl(path)
    if (error) throw error
    const publicUrl = db().storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
    response.status(201).json(AvatarUploadSchema.parse({ path, token: data.token, signed_url: data.signedUrl, public_url: publicUrl }))
  })

  // Step 2: after uploading, point the profile at the file and remove older ones.
  router.put('/avatar', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user) return
    const parsed = z.object({ path: z.string().regex(avatarPath(user.id)) }).strict().safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid avatar path.' }); return }
    const name = parsed.data.path.slice(user.id.length + 1)
    const files = await db().storage.from(AVATAR_BUCKET).list(user.id, { search: name, limit: 1 })
    if (files.error) throw files.error
    if (!files.data?.some(file => file.name === name)) { response.status(404).json({ error: 'Upload the avatar before saving it.' }); return }
    const avatarUrl = db().storage.from(AVATAR_BUCKET).getPublicUrl(parsed.data.path).data.publicUrl
    const { error } = await db().rpc('save_profile', { p_user_id: user.id, p_profile: { avatar_url: avatarUrl } })
    if (rejectInvalid(response, error)) return
    await removeFiles(db(), AVATAR_BUCKET, user.id, parsed.data.path)
    response.json(await ownProfile(db(), user.id))
  })

  router.delete('/avatar', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user || !await profileExists(db(), response, user.id)) return
    const { error } = await db().rpc('save_profile', { p_user_id: user.id, p_profile: { avatar_url: null } })
    if (error) throw error
    await removeFiles(db(), AVATAR_BUCKET, user.id)
    response.json(await ownProfile(db(), user.id))
  })

  router.get('/blocks', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user) return
    const { data, error } = await db().rpc('blocked_users', { p_user_id: user.id })
    if (error) throw error
    response.json({ blocked: z.array(BlockedUserSchema).parse(data ?? []) })
  })

  // Permanent. Deleting the auth user cascades to the profile and everything it owns.
  router.delete('/', async (request, response) => {
    const parsed = DeleteAccountSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Confirm by sending { "confirm": "DELETE" }.' }); return }
    const user = await signedIn(request, response)
    if (!user || !requireStepUp(request, response, user)) return
    await Promise.all([removeFiles(db(), AVATAR_BUCKET, user.id), removeFiles(db(), EXPORT_BUCKET, user.id)])
    const { error } = await db().auth.admin.deleteUser(user.id)
    if (error) throw error
    response.status(204).end()
  })

  // Supabase emails both addresses; the change applies once both are confirmed.
  router.post('/email', async (request, response) => {
    const parsed = EmailChangeSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Enter a valid email address.' }); return }
    if (!auth) { response.status(503).json({ error: 'Account changes are not configured.' }); return }
    const user = await signedIn(request, response)
    if (!user || !requireStepUp(request, response, user)) return
    if (parsed.data.email === user.email) { response.status(400).json({ error: 'That is already your email.' }); return }
    if (!await updateAuthUser(auth, request, response, { email: parsed.data.email })) return
    response.status(202).json({ pending_email: parsed.data.email })
  })

  // Sets or replaces the password (email-link users can add one this way).
  router.post('/password', async (request, response) => {
    const parsed = PasswordChangeSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Passwords must be 8–72 characters.' }); return }
    if (!auth) { response.status(503).json({ error: 'Account changes are not configured.' }); return }
    const user = await signedIn(request, response)
    if (!user || !requireStepUp(request, response, user)) return
    if (!await updateAuthUser(auth, request, response, { password: parsed.data.password })) return
    response.status(204).end()
  })

  router.get('/sessions', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user) return
    const { data, error } = await db().rpc('list_sessions', { p_user_id: user.id })
    if (error) throw error
    const current = tokenClaims(request).session_id
    response.json({ sessions: z.array(SessionSchema).parse((data ?? []).map((session: { id: string }) => ({ ...session, current: session.id === current }))) })
  })

  // Signs out every other device; the client signs itself out locally.
  router.delete('/sessions', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user || !requireStepUp(request, response, user)) return
    const { data, error } = await db().rpc('revoke_sessions', { p_user_id: user.id, p_session_id: null, p_keep: tokenClaims(request).session_id ?? null })
    if (error) throw error
    response.json({ revoked: data ?? 0 })
  })

  router.delete('/sessions/:id', async (request, response) => {
    const parsed = uuid.safeParse(request.params.id)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid session ID.' }); return }
    const user = await signedIn(request, response)
    if (!user || !requireStepUp(request, response, user)) return
    const { data, error } = await db().rpc('revoke_sessions', { p_user_id: user.id, p_session_id: parsed.data })
    if (error) throw error
    if (!data) { response.status(404).json({ error: 'That session has already ended.' }); return }
    response.status(204).end()
  })

  // Builds the export immediately and returns a short-lived download link.
  router.post('/exports', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user || !requireStepUp(request, response, user)) return
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recent = await db().from('data_export_requests').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', since)
    if (recent.error) throw recent.error
    if ((recent.count ?? 0) >= EXPORTS_PER_DAY) { response.status(429).json({ error: 'You can download your data once a day. Your latest export is still available.' }); return }
    const exported = await db().rpc('export_user_data', { p_user_id: user.id })
    if (exported.error) throw exported.error
    const id = randomUUID()
    const path = `${user.id}/${id}.json`
    const file = JSON.stringify({ exported_at: new Date().toISOString(), account: account(user), ...exported.data }, null, 2)
    const upload = await db().storage.from(EXPORT_BUCKET).upload(path, file, { contentType: 'application/json', upsert: false })
    if (upload.error) throw upload.error
    const { data, error } = await db().from('data_export_requests').insert({ id, user_id: user.id, path }).select('id,created_at,expires_at,path').single()
    if (error) throw error
    response.status(201).json(DataExportSchema.parse(await signExport(data)))
  })

  // Lists unexpired exports with fresh links, deleting expired ones as it goes.
  router.get('/exports', async (request, response) => {
    const user = await signedIn(request, response)
    if (!user) return
    const { data, error } = await db().from('data_export_requests').select('id,created_at,expires_at,path').eq('user_id', user.id).order('created_at', { ascending: false })
    if (error) throw error
    const now = Date.now()
    const expired = (data ?? []).filter(row => Date.parse(row.expires_at) <= now)
    if (expired.length) {
      const removed = await db().storage.from(EXPORT_BUCKET).remove(expired.map(row => row.path))
      if (removed.error) throw removed.error
      const deleted = await db().from('data_export_requests').delete().in('id', expired.map(row => row.id))
      if (deleted.error) throw deleted.error
    }
    const live = (data ?? []).filter(row => Date.parse(row.expires_at) > now)
    response.json({ exports: z.array(DataExportSchema).parse(await Promise.all(live.map(signExport))) })
  })

  async function signExport(row: { id: string; created_at: string; expires_at: string; path: string }) {
    const signed = await db().storage.from(EXPORT_BUCKET).createSignedUrl(row.path, 60 * 60, { download: `pebble-data-${row.created_at.slice(0, 10)}.json` })
    if (signed.error) throw signed.error
    return { id: row.id, created_at: row.created_at, expires_at: row.expires_at, download_url: signed.data.signedUrl }
  }

  router.use(unavailable)
  return router
}

// Other people's profiles and safety actions: /api/profiles/:id
export function createProfilesRouter(client: SupabaseClient | null) {
  const router = Router()
  router.use(requireClient(client))
  const db = () => client!

  async function target(request: Request, response: Response) {
    const parsed = uuid.safeParse(request.params.id)
    if (!parsed.success) { response.status(400).json({ error: 'Invalid profile ID.' }); return null }
    const user = await authenticate(db(), request, response, 'Sign in to view profiles.')
    if (!user) return null
    return { user, id: parsed.data }
  }

  router.get('/:id', async (request, response) => {
    const found = await target(request, response)
    if (!found) return
    const { data, error } = await db().rpc('profile_snapshot', { p_user_id: found.id, p_viewer_id: found.user.id })
    if (error) throw error
    if (!data) { response.status(404).json({ error: 'This profile is not available.' }); return }
    response.json(PublicProfileSchema.parse(data))
  })

  router.post('/:id/block', async (request, response) => {
    const found = await target(request, response)
    if (!found || !await profileExists(db(), response, found.user.id)) return
    const { data, error } = await db().rpc('block_user', { p_blocker_id: found.user.id, p_blocked_id: found.id })
    if (rejectInvalid(response, error)) return
    if (!data) { response.status(404).json({ error: 'This profile is not available.' }); return }
    response.status(204).end()
  })

  router.delete('/:id/block', async (request, response) => {
    const found = await target(request, response)
    if (!found) return
    const { error } = await db().from('blocks').delete().eq('blocker_id', found.user.id).eq('blocked_id', found.id)
    if (error) throw error
    response.status(204).end()
  })

  router.post('/:id/report', async (request, response) => {
    const parsed = ReportSchema.safeParse(request.body)
    if (!parsed.success) { response.status(400).json({ error: 'Choose a reason for the report.' }); return }
    const found = await target(request, response)
    if (!found) return
    if (found.id === found.user.id) { response.status(400).json({ error: 'You cannot report yourself.' }); return }
    if (!await profileExists(db(), response, found.user.id)) return
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recent = await db().from('user_reports').select('id', { count: 'exact', head: true }).eq('reporter_id', found.user.id).gte('created_at', since)
    if (recent.error) throw recent.error
    if ((recent.count ?? 0) >= REPORTS_PER_DAY) { response.status(429).json({ error: 'Too many reports today. Please try again tomorrow.' }); return }
    const { error } = await db().from('user_reports').insert({ reporter_id: found.user.id, reported_id: found.id, reason: parsed.data.reason, details: parsed.data.details || null })
    if (error?.code === '23503') { response.status(404).json({ error: 'This profile is not available.' }); return }
    if (error) throw error
    response.status(201).json({ status: 'received' })
  })

  router.use(unavailable)
  return router
}
