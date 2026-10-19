import { useEffect, useRef } from 'react'

// Auth SDK operations may finish after a route unmount; their server outcome
// cannot be undone here. Only the current mounted request may update this UI.
export function useAuthRequest() {
  const state = useRef({ live: false, version: 0, pending: false, url: '' })
  useEffect(() => {
    const request = state.current
    request.live = true
    return () => { request.live = false; request.version++; request.pending = false }
  }, [])
  // Browser history changes before React necessarily commits the route unmount.
  const current = (id: number) => state.current.live && state.current.version === id && state.current.url === window.location.href
  return {
    begin() {
      if (!state.current.live || state.current.pending) return null
      state.current.pending = true
      state.current.url = window.location.href
      return ++state.current.version
    },
    current,
    finish(id: number) {
      if (!current(id)) return false
      state.current.pending = false
      return true
    },
  }
}
