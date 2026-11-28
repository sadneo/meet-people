import { beforeEach, expect, it, vi } from 'vitest'
import { Geolocation } from '@capacitor/geolocation'
import { isNative } from '../../src/platform/native'
import { requestDeviceLocation } from '../../src/platform/location'

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { requestPermissions: vi.fn(), getCurrentPosition: vi.fn() },
}))
vi.mock('../../src/platform/native', () => ({ isNative: vi.fn(() => true) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isNative).mockReturnValue(true)
})

it.each([
  { location: 'granted' as const, coarseLocation: 'granted' as const },
  { location: 'denied' as const, coarseLocation: 'granted' as const },
])('enables search after native permission and before reading coordinates', async permission => {
  vi.mocked(Geolocation.requestPermissions).mockResolvedValue(permission)
  const enable = vi.fn(async () => {
    expect(Geolocation.requestPermissions).toHaveBeenCalledWith({ permissions: ['location'] })
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })
  await requestDeviceLocation(enable)
  expect(enable).toHaveBeenCalledOnce()
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledOnce()
})

it('keeps search disabled when permission is denied', async () => {
  vi.mocked(Geolocation.requestPermissions).mockResolvedValue({ location: 'denied', coarseLocation: 'denied' })
  const enable = vi.fn()
  await expect(requestDeviceLocation(enable)).rejects.toThrow('Allow location')
  expect(enable).not.toHaveBeenCalled()
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})

it('does not read coordinates if the search setting could not be saved', async () => {
  vi.mocked(Geolocation.requestPermissions).mockResolvedValue({ location: 'granted', coarseLocation: 'granted' })
  await expect(requestDeviceLocation(async () => { throw new Error('Save failed') })).rejects.toThrow('Save failed')
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})
