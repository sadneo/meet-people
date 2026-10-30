import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionRequestAllowance } from '../../shared/connections'
import { connections } from '../features/connections/client'
import { useQueryClient } from '@tanstack/react-query'

export function useRequestAllowance() {
  const cache = useQueryClient()
  const [value, setValue] = useState<ConnectionRequestAllowance | null>(() => cache.getQueryData(['request-allowance']) ?? null)
  const [error, setError] = useState(''), [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [limited, setLimited] = useState(value?.remaining === 0)
  const lock = useRef(false), live = useRef(true), generation = useRef(0)
  const read = useCallback(async () => {
    const version = ++generation.current
    try {
      const current = await connections.allowance(AbortSignal.timeout(15000))
      if (!live.current || version !== generation.current) return
      cache.setQueryData(['request-allowance'], current)
      setValue(current); setLimited(current.remaining === 0); setError('')
    } catch {
      if (live.current && version === generation.current) setError('Request availability could not be checked. Try again.')
    } finally {
      if (live.current && version === generation.current) setChecking(false)
    }
  }, [cache])
  const refresh = useCallback(() => { setChecking(true); return read() }, [read])
  useEffect(() => {
    live.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read only updates React state after the network promise settles.
    void read()
    const focus = () => { if (!lock.current) void refresh() }
    window.addEventListener('focus', focus)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generation invalidates async reads; it is not a DOM ref.
    return () => { live.current = false; generation.current++; window.removeEventListener('focus', focus) }
  }, [read, refresh])
  useEffect(() => {
    if (!value?.availableAt) return
    const timer = setTimeout(() => { if (!lock.current) void refresh() }, Math.max(1000, Math.min(2147483647, Date.parse(value.availableAt) - Date.now() + 1000)))
    return () => clearTimeout(timer)
  }, [value, refresh])
  async function send(action: () => Promise<boolean | void>) {
    if (lock.current || checking || error || limited || !value || value.remaining === 0) return
    lock.current = true; setBusy(true)
    try {
      const reached = await action()
      if (live.current && reached) setLimited(true)
    } finally {
      if (live.current) await refresh()
      lock.current = false
      if (live.current) setBusy(false)
    }
  }
  return { value, error, checking, busy, limited, refresh, send, blocked: checking || busy || !!error || limited || !value }
}
export type RequestAllowanceControl = ReturnType<typeof useRequestAllowance>
