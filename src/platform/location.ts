import { Geolocation } from '@capacitor/geolocation'
import { isNative } from './native'

export function deviceLocationAvailable() {
  return isNative() || !!navigator.geolocation
}

export async function requestDeviceLocation(onGranted: () => Promise<void>) {
  const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
  if (isNative()) {
    const permission = await Geolocation.requestPermissions({ permissions: ['location'] })
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
      throw new Error('Allow location in your device settings to use your current location. You can also search for an area.')
    }
    await onGranted()
    return Geolocation.getCurrentPosition(options)
  }
  const position = await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, options))
  await onGranted()
  return position
}
