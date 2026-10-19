import { safeReturnTo } from '../../auth/returnTo'

export const publicEventsPath = '/explore'
export function publicEventPath(id: string) {
  return `${publicEventsPath}/${encodeURIComponent(id)}`
}

export function publicAuthPath(mode: 'register' | 'login', destination = '/') {
  return `/${mode}?${new URLSearchParams({ returnTo: safeReturnTo(destination) ?? '/' })}`
}