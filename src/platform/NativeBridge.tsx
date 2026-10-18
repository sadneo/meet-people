import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { APP_SCHEME, isNative } from './native'

// Only these in-app routes may be opened from an email link.
const authPaths = new Set(['/login', '/register', '/auth/callback', '/reset-password', '/forgot-password', '/auth/forgot-password'])
const handled = new Set<string>()

// Renders nothing. Mount once inside the router, outside AccountBoundary.
export default function NativeBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isNative()) return
    let live = true

    async function openAuthLink(url: string) {
      if (!live || handled.has(url)) return
      handled.add(url)
      let parsed: URL
      try { parsed = new URL(url) } catch { return }
      const pathname = parsed.pathname.replace(/\/$/, '')
      if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== 'app' || !authPaths.has(pathname)) return

      const search = new URLSearchParams(parsed.search)
      const grant = search.has('code') || search.has('token_hash') || parsed.hash || pathname === '/reset-password'
      // Central callback captures then scrubs the URL before exchanging/verifying.
      // The bridge must not perform an unverified parallel SDK exchange.
      if (pathname === '/reset-password') search.set('flow', 'recovery')
      navigate({ pathname: grant ? '/auth/callback' : pathname, search: search.size ? `?${search}` : '', hash: parsed.hash })
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
      live = false
      document.removeEventListener('click', onClick)
      void listener.then(handle => handle.remove())
    }
  }, [navigate])

  return null
}
