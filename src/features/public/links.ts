import { safeReturnTo } from '../../auth/returnTo'

export function publicAuthPath(mode: 'register' | 'login', destination = '/') {
  return `/${mode}?${new URLSearchParams({ returnTo: safeReturnTo(destination) ?? '/' })}`
}
