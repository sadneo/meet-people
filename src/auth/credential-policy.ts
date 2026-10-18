import { safeReturnTo } from './returnTo'

export function authCallbackUrl(returnTo = '/settings', recovery = false) {
  const url = new URL('/auth/callback', window.location.origin)
  url.searchParams.set('returnTo', safeReturnTo(returnTo) ?? '/settings')
  if (recovery) url.searchParams.set('flow', 'recovery')
  return url.href
}
export const validPassword = (value: string) => value.length >= 8 && value.length <= 128
export function credentialError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
  if (code === 'weak_password') return 'Choose a stronger password with at least 8 characters.'
  if (code === 'same_password') return 'Choose a different password from your current password.'
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Too many requests. Wait before trying again.'
  if (code === 'reauthentication_not_valid') return 'The verification code is invalid or expired. Request a new code.'
  return 'The account request could not be completed. Check your connection and try again.'
}
