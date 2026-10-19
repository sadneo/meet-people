import { useEffect, useRef, useState } from 'react'
import { AccountDialog } from './AccountDialog'

export type BlockedPerson = { id: string; name: string; blockedAt: string }
// Future authenticated adapter; the UI does not invent an endpoint or local blocklist.
export type BlocklistAdapter = { read: (signal: AbortSignal) => Promise<BlockedPerson[]>; unblock: (id: string, signal: AbortSignal) => Promise<void> }
export function BlocklistPanel({ adapter }: { adapter?: BlocklistAdapter }) {
  const [resource, setResource] = useState({ adapter, generation: 0 })
  if (resource.adapter !== adapter) setResource({ adapter, generation: resource.generation + 1 })
  return <BlocklistResource key={resource.generation} adapter={adapter} />
}
function BlocklistResource({ adapter }: { adapter?: BlocklistAdapter }) {
  const [people, setPeople] = useState<BlockedPerson[] | null>(null), [busy, setBusy] = useState(!!adapter), [error, setError] = useState(adapter ? '' : 'Blocked users are not connected yet. No real block status can be shown.'), [selected, setSelected] = useState<BlockedPerson | null>(null)
  const active = useRef(true), lock = useRef(false), controller = useRef<AbortController | null>(null)
  async function read() {
    if (!active.current || lock.current) return
    if (!adapter) { setError('Blocked users are not connected yet. No real block status can be shown.'); return }
    lock.current = true; setBusy(true); setError(''); const operation = new AbortController(); controller.current = operation
    try { const next = await adapter.read(operation.signal); if (active.current && !operation.signal.aborted) setPeople(next) }
    catch { if (active.current && !operation.signal.aborted) setError('Blocked users could not be loaded. Your last confirmed list is shown. Try again.') }
    finally { if (controller.current === operation) { lock.current = false; if (active.current) setBusy(false) } }
  }
  useEffect(() => {
    active.current = true
    const operation = new AbortController(); controller.current = operation
    if (adapter) {
      lock.current = true
      void adapter.read(operation.signal).then(next => {
        if (active.current && !operation.signal.aborted) setPeople(next)
      }).catch(() => {
        if (active.current && !operation.signal.aborted) setError('Blocked users could not be loaded. Try again.')
      }).finally(() => {
        if (controller.current === operation) { lock.current = false; if (active.current) setBusy(false) }
      })
    }
    return () => { active.current = false; operation.abort(); controller.current?.abort() }
  }, [adapter])
  async function unblock() {
    if (!active.current || !adapter || !selected || lock.current) return
    lock.current = true; setBusy(true); setError(''); const operation = new AbortController(); controller.current = operation
    try {
      await adapter.unblock(selected.id, operation.signal)
      if (!active.current || operation.signal.aborted) return
      const next = await adapter.read(operation.signal)
      if (!active.current || operation.signal.aborted) return
      setPeople(next)
      if (next.some(person => person.id === selected.id)) { setError('Unblocking could not be confirmed. Your last confirmed list is shown.'); return }
      setSelected(null)
    } catch { if (active.current && !operation.signal.aborted) setError('The change could not be confirmed. Reload blocked users before trying again.') }
    finally { if (controller.current === operation) { lock.current = false; if (active.current) setBusy(false) } }
  }
  return <div className="account-feature-form"><p>Blocks must apply across discovery, matching and contact. No sample profiles are substituted here.</p>{busy && <p role="status">Checking blocked users…</p>}{error && <p role="alert">{error}</p>}{people === null ? !busy && <p>Blocklist unavailable.</p> : people.length === 0 ? <p>No blocked users in the confirmed list.</p> : <ul className="account-blocked-list">{people.map(person => <li key={person.id}><span><strong>{person.name}</strong><small>Blocked <time dateTime={person.blockedAt}>{new Date(person.blockedAt).toLocaleDateString()}</time></small></span><button type="button" className="account-secondary" disabled={busy} onClick={() => setSelected(person)}>Unblock {person.name}</button></li>)}</ul>}<button type="button" className="account-secondary" disabled={busy} onClick={() => void read()}>Reload blocked users</button>
    {selected && <AccountDialog title={`Unblock ${selected.name}?`} busy={busy} close={() => setSelected(null)}><p>They may be able to find and contact you again once the service confirms this change.</p>{error && <p role="alert">{error}</p>}<div className="account-feature-actions"><button type="button" className="account-secondary" disabled={busy} onClick={() => setSelected(null)}>Keep blocked</button><button type="button" className="account-green-action" disabled={busy} onClick={() => void unblock()}>{busy ? 'Checking…' : 'Confirm unblock'}</button></div></AccountDialog>}
  </div>
}
export function SafetyActions({ name }: { name: string }) {
  const [action, setAction] = useState<'block' | 'report' | null>(null), [reason, setReason] = useState('')
  return <><div className="account-feature-actions"><button type="button" className="account-secondary" onClick={() => setAction('block')}>Block or hide {name}</button><button type="button" className="account-secondary" onClick={() => setAction('report')}>Report {name}</button></div>{action && <AccountDialog title={action === 'block' ? `Block ${name}?` : `Report ${name}`} close={() => { setAction(null); setReason('') }}><div className="account-feature-form"><p role="status">Safety actions are not connected yet. No block or report will be sent.</p>{action === 'block' ? <p>A confirmed block must exclude this person from matching and contact. Closing this dialog does not block them.</p> : <><label className="account-feature-field">Reason<select aria-label="Reason" value={reason} onChange={event => setReason(event.target.value)}><option value="">Choose a reason</option>{['Harassment', 'Inappropriate content', 'Impersonation', 'Safety concern', 'Other'].map(value => <option key={value}>{value}</option>)}</select></label><label className="account-feature-field">Additional context (optional)<textarea maxLength={1000} placeholder="Do not enter sensitive details in this preview." /></label></>}<button type="button" className="account-green-action" disabled>{action === 'block' ? 'Blocking unavailable' : 'Reporting unavailable'}</button></div></AccountDialog>}</>
}
