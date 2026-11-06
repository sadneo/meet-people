import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { APP_SCHEME, isNative } from './native'

// Only these in-app routes may be opened from an email link.
const authPaths = new Set(['/login', '/register', '/auth/callback', '/reset-password', '/forgot-password', '/auth/forgot-password'])
const handled = new Set<string>()
const roots = new Set(['/', '/home', '/community', '/login'])

function cancelDialog() {
  const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'))
  // Focus belongs to the top modal even when it was opened out of DOM order.
  const focused = document.activeElement?.closest('dialog')
  const dialog = dialogs.find(element => element === focused) ?? dialogs.at(-1)
  if (!dialog) return false
  // React owns nested-layer Back and busy guards. Synthetic cancel has no default
  // action, so only perform the browser's close action if nobody prevented it.
  if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close()
  return true
}

function fallback(pathname: string, search: string) {
  if (pathname.startsWith('/messages/')) return '/messages'
  if (pathname.startsWith('/events/')) return `/events${search}`
  if (pathname === '/profile' && new URLSearchParams(search).has('section')) return '/profile'
  if (authPaths.has(pathname)) return '/login'
  return '/'
}

// Renders nothing. Mount once inside the router, outside AccountBoundary.
export default function NativeBridge() {
  const navigate = useNavigate()
  const location = useLocation()
  const router = useRef({ navigate, location })
  useLayoutEffect(() => { router.current = { navigate, location } }, [navigate, location])

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
      await router.current.navigate({ pathname: grant ? '/auth/callback' : pathname, search: search.size ? `?${search}` : '', hash: parsed.hash })
    }

    const listener = App.addListener('appUrlOpen', ({ url }) => { void openAuthLink(url).catch(() => {}) })
    // Android's IME consumes Back before this callback. Do not synthesize Escape
    // or blur inputs here: that would bypass modal cancellation and keyboard order.
    const backListener = App.addListener('backButton', () => {
      if (!live || cancelDialog()) return
      // This disclosure is a transient menu, unlike persistent details/accordions.
      const options = document.querySelector<HTMLDetailsElement>('details.chat-options[open]')
      if (options) {
        options.open = false
        options.querySelector('summary')?.focus()
        return
      }
      const { navigate, location: { pathname, search } } = router.current
      if (roots.has(pathname)) {
        void App.minimizeApp().catch(() => {})
        return
      }
      // Router idx excludes the WebView's pre-app/auth bootstrap history.
      const idx: unknown = window.history.state?.idx
      void Promise.resolve(typeof idx === 'number' && idx > 0
        ? navigate(-1)
        : navigate(fallback(pathname, search), { replace: true })).catch(() => {})
    })
    // Catch registration failures immediately, including before async cleanup.
    void listener.catch(() => {})
    void backListener.catch(() => {})
    // Cold start from a link: the event may fire before this listener exists.
    void App.getLaunchUrl().then(launch => { if (launch?.url) return openAuthLink(launch.url) }).catch(() => {})

    // target="_blank" links (e.g. "View original listing") go to the system browser.
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null
      if (!anchor || !/^https?:\/\//i.test(anchor.href)) return
      event.preventDefault()
      void Browser.open({ url: anchor.href }).catch(() => {})
    }
    document.addEventListener('click', onClick)

    return () => {
      live = false
      document.removeEventListener('click', onClick)
      void listener.then(handle => handle.remove()).catch(() => {})
      void backListener.then(handle => handle.remove()).catch(() => {})
    }
  }, [])

  return null
}
