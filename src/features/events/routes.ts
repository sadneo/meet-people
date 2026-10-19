import { matchPath } from 'react-router'

export const eventsPath = '/events'
export const eventDetailRoute = '/events/:id'
export function eventDetailPath(id: string) {
  return `${eventsPath}/${encodeURIComponent(id)}`
}
export function isEventDetailPath(pathname: string) {
  return matchPath({ path: eventDetailRoute, end: true }, pathname) !== null
}
