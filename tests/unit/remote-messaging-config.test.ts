import { expect, it } from 'vitest'
// @ts-expect-error The launcher is an executable Node module.
import { remoteMessagingEnvironment } from '../../scripts/run-remote-messaging.mjs'

const configuration = {
  SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public-key', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-key', VITE_API_BASE_URL: 'https://hosted.test', VITE_DEV_LOGIN_PASSWORD: 'private-password',
}
it('uses one remote project for browser and API despite inherited local settings', () => {
  const value = remoteMessagingEnvironment(configuration, { SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })
  expect(value.SUPABASE_URL).toBe(configuration.SUPABASE_URL)
  expect(value.VITE_SUPABASE_URL).toBe(configuration.SUPABASE_URL)
  expect(value.VITE_API_BASE_URL).toBe('')
  expect(value.PORT).toBe('3301')
  expect(Object.keys(value).filter(name => name.startsWith('VITE_'))).toEqual(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_API_BASE_URL', 'VITE_DEV_TOOLS'])
})
it('rejects split targets, split public keys and non-remote URLs', () => {
  expect(() => remoteMessagingEnvironment({ ...configuration, VITE_SUPABASE_URL: 'https://other.supabase.co' })).toThrow(/must match/)
  expect(() => remoteMessagingEnvironment({ ...configuration, VITE_SUPABASE_PUBLISHABLE_KEY: 'another-key' })).toThrow(/must match/)
  expect(() => remoteMessagingEnvironment({ ...configuration, SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow(/HTTPS/)
})
