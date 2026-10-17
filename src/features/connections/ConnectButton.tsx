import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { ConnectionState } from '../../../shared/connections'
import { useVisiblePolling } from '../matchmaking/useVisiblePolling'
import { conversationPath } from '../messaging/client'
import { connections } from './client'

const ANSWER_POLL_MS = 5000

type Classes = { primary: string; secondary: string }
const appClasses: Classes = { primary: 'pt-button', secondary: 'pt-button pt-secondary' }
function failureText(failure: unknown) { return failure instanceof Error ? failure.message : 'Could not update this connection. Try again.' }

// Connect, cancel, accept or decline, or open the chat once connected.
// Key it by user ID so switching people starts fresh.
export function ConnectButton({ userId, name, classes = appClasses }: { userId: string; name: string; classes?: Classes }) {
  const [state, setState] = useState<ConnectionState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const live = useRef(true)
  const pending = useRef(false)
  const changes = useRef(0)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    connections.state(userId, controller.signal)
      .then(next => { if (!controller.signal.aborted) setState(next) })
      .catch(failure => { if (!controller.signal.aborted) setError(failureText(failure)) })
    return () => controller.abort()
  }, [userId])
  async function act(change: (id: string) => Promise<ConnectionState>) {
    if (pending.current) return
    pending.current = true; changes.current++; setBusy(true); setError('')
    try { const next = await change(userId); if (live.current) setState(next) }
    catch (failure) { if (live.current) setError(failureText(failure)) }
    finally { pending.current = false; if (live.current) setBusy(false) }
  }
  // While my request waits, check for an answer so Message replaces Cancel request
  // once they accept. A check overtaken by my own action is dropped.
  const waiting = state?.status === 'sent'
  const check = useCallback(async () => {
    if (!waiting || pending.current) return
    const before = changes.current
    try { const next = await connections.state(userId); if (live.current && before === changes.current) setState(next) }
    catch { /* Keep the last known state; the next check tries again. */ }
  }, [userId, waiting])
  useVisiblePolling(check, ANSWER_POLL_MS, false)
  const status = state?.status
  return <div className="pt-connect" aria-busy={busy}>
    {status === 'sent' && <p role="status">Request sent</p>}
    {status === 'incoming' && <p role="status">{name} wants to connect</p>}
    <div className="pt-connect-actions">
      {(!state || status === 'none') && <button type="button" className={classes.primary} disabled={!state || busy} onClick={() => void act(connections.request)}>Connect</button>}
      {status === 'sent' && <button type="button" className={classes.secondary} disabled={busy} onClick={() => void act(connections.remove)}>Cancel request</button>}
      {status === 'incoming' && <>
        <button type="button" className={classes.primary} disabled={busy} onClick={() => void act(connections.accept)}>Accept</button>
        <button type="button" className={classes.secondary} disabled={busy} onClick={() => void act(connections.remove)}>Decline</button>
      </>}
      {status === 'connected' && state?.conversationId && <Link className={classes.primary} to={conversationPath(state.conversationId)}>Message</Link>}
    </div>
    {error && <p role="alert">{error}</p>}
  </div>
}
