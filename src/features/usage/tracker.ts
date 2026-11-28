import { useEffect } from 'react'
import { z } from 'zod'
import { authorizedRequest } from '../../auth/authorizedRequest'

const BEAT_MS = 30_000
const nothing = z.null()

// Automated browsers (Playwright, Selenium) are not people using Pebble. Skip them so
// test runs neither pollute the usage numbers nor send background requests that tests
// asserting "opening a screen sends no writes" would have to account for.
const automated = () => typeof navigator !== 'undefined' && navigator.webdriver === true

// Records time in the app. A beat is only sent while the page is visible and
// the user is signed in; the server credits at most 65 seconds per beat.
export function useUsageHeartbeat(accessToken: string | undefined) {
  useEffect(() => {
    if (!accessToken || automated()) return
    let timer: ReturnType<typeof setInterval> | undefined
    const beat = () => {
      if (document.visibilityState !== 'visible') return
      void authorizedRequest('/api/usage/heartbeat', nothing, { method: 'POST' }).catch(() => undefined)
    }
    const sync = () => {
      clearInterval(timer)
      timer = undefined
      if (document.visibilityState === 'visible') { beat(); timer = setInterval(beat, BEAT_MS) }
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync) }
  }, [accessToken])
}

// Counts one profile opened by the signed-in user. Fire-and-forget.
export function trackProfileOpen() {
  if (automated()) return
  void authorizedRequest('/api/usage/profile-open', nothing, { method: 'POST' }).catch(() => undefined)
}
