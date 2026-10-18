// Only internal, relative destinations. Decode defensively to reject slash/backslash
// obfuscation and control characters before passing anything to router/navigation.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null
  let decoded = value
  const unsafe = (path: string) => !path.startsWith('/') || path.startsWith('//') || path.includes('\\') || [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  try {
    for (let i = 0; i < 4; i++) {
      if (unsafe(decoded)) return null
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
    if (unsafe(decoded)) return null
    const decodedUrl = new URL(decoded, 'https://pebble.invalid')
    if (decodedUrl.origin !== 'https://pebble.invalid' || ['/login', '/register', '/onboarding', '/auth/callback', '/forgot-password', '/reset-password'].includes(decodedUrl.pathname.replace(/\/$/, ''))) return null
    const url = new URL(value, 'https://pebble.invalid')
    if (url.origin !== 'https://pebble.invalid' || ['/login', '/register', '/onboarding', '/auth/callback', '/forgot-password', '/reset-password'].includes(url.pathname.replace(/\/$/, ''))) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}
export function centralSignInPath(returnTo: string) {
  const path = safeReturnTo(returnTo)
  return path ? `/login?${new URLSearchParams({ returnTo: path })}` : '/login'
}
