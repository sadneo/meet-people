const otpTypes = ['email', 'email_change', 'recovery', 'signup', 'magiclink'] as const
type OtpType = typeof otpTypes[number]
type Grant = { kind: 'code'; code: string } | { kind: 'otp'; token: string; type: OtpType } | { kind: 'session'; access: string; refresh: string }
type ParsedCallback = { kind: 'information' } | { kind: 'grant'; grant: Grant; recovery: boolean }

// Presence, not truthiness, determines the grant shape so empty/partial grants
// cannot be mistaken for a harmless informational callback or an old session.
export function parseCallbackGrant(incoming: URL): ParsedCallback {
  const query = incoming.searchParams, hash = new URLSearchParams(incoming.hash.slice(1))
  const reject = () => { throw new Error('Invalid callback grant') }
  for (const key of new Set([...query.keys(), ...hash.keys()])) {
    if (query.getAll(key).length + hash.getAll(key).length !== 1) reject()
  }
  if (['error', 'error_code', 'error_description', 'token'].some(key => query.has(key) || hash.has(key))) reject()
  if (['code', 'token_hash'].some(key => hash.has(key)) || ['access_token', 'refresh_token'].some(key => query.has(key))) reject()
  const code = query.has('code'), otp = query.has('token_hash')
  const session = hash.has('access_token') || hash.has('refresh_token')
  const kinds = Number(code) + Number(otp) + Number(session)
  if (kinds > 1 || (kinds > 0 && (query.has('message') || hash.has('message')))) reject()
  const value = (params: URLSearchParams, key: string) => {
    const raw = params.get(key) ?? ''
    if (!raw || raw.length > 16384 || /\s/.test(raw) || [...raw].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) reject()
    return raw
  }
  const type = session ? hash.get('type') : query.get('type')
  if (type !== null && !otpTypes.includes(type as OtpType)) reject()
  if ((session && query.has('type')) || (!session && hash.has('type'))) reject()
  if (kinds === 0) {
    if (query.get('message')?.trim() && !hash.has('message') && (!type || type === 'email_change')) return { kind: 'information' }
    return reject()
  }
  const recovery = query.get('flow') === 'recovery' || type === 'recovery'
  if (code) return { kind: 'grant', recovery, grant: { kind: 'code', code: value(query, 'code') } }
  if (otp) {
    if (!type) reject()
    return { kind: 'grant', recovery, grant: { kind: 'otp', token: value(query, 'token_hash'), type: type as OtpType } }
  }
  return { kind: 'grant', recovery, grant: { kind: 'session', access: value(hash, 'access_token'), refresh: value(hash, 'refresh_token') } }
}
