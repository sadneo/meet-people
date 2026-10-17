import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { supabase } from '../supabase'
import { APP_SCHEME, isNative } from './native'

// Only these in-app routes may be opened from an email link.
const authPaths = new Set(['/login', '/register', '/auth/callback', '/reset-password'])
const handled = new Set<string>()

// Renders nothing. Mount once inside the router, outside AccountBoundary.
export default function NativeBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isNative()) return

    async function openAuthLink(url: string) {
      if (handled.has(url)) return
      handled.add(url)
      let parsed: URL
      try { parsed = new URL(url) } catch { return }
      const pathname = parsed.pathname.replace(/\/$/, '')
      if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== 'app' || !authPaths.has(pathname)) return

      const hash = new URLSearchParams(parsed.hash.slice(1))
      const search = new URLSearchParams(parsed.search)
      const code = search.get('code')
      search.delete('code')
      const target = { pathname, search: search.size ? `?${search}` : '' }

      // Let AuthScreen display Supabase's error; it reads error_description from the hash.
      if (hash.get('error_description') || search.get('error_description')) { navigate({ ...target, hash: parsed.hash }); return }

      try {
        const access = hash.get('access_token')
        const refresh = hash.get('refresh_token')
        if (supabase && access && refresh) await supabase.auth.setSession({ access_token: access, refresh_token: refresh })
        else if (supabase && code) await supabase.auth.exchangeCodeForSession(code)
      } catch { /* The auth screen falls back to its signed-out state. */ }
      navigate(target)
    }

    const listener = App.addListener('appUrlOpen', ({ url }) => { void openAuthLink(url) })
    // Cold start from a link: the event may fire before this listener exists.
    void App.getLaunchUrl().then(launch => { if (launch?.url) void openAuthLink(launch.url) })

    // target="_blank" links (e.g. "View original listing") go to the system browser.
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null
      if (!anchor || !/^https?:\/\//i.test(anchor.href)) return
      event.preventDefault()
      void Browser.open({ url: anchor.href })
    }
    document.addEventListener('click', onClick)

    return () => {
      document.removeEventListener('click', onClick)
      void listener.then(handle => handle.remove())
    }
  }, [navigate])

  return null
}
