import { expect, it } from 'vitest'
import { safeReturnTo, centralSignInPath } from '../../src/auth/returnTo'
it('preserves only relative same-origin internal return paths', () => {
  expect(safeReturnTo('/events/e0000000-0000-4000-8000-000000000001?review=1')).toBe('/events/e0000000-0000-4000-8000-000000000001?review=1')
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/%2f%2fevil.test', '/%255cevil.test', 'javascript:alert(1)', '/login?returnTo=/events', '/%6cogin', '/events/../login', '/events\n/other', null]) expect(safeReturnTo(value)).toBeNull()
  expect(centralSignInPath('/events?category=Music')).toBe('/login?returnTo=%2Fevents%3Fcategory%3DMusic')
})
