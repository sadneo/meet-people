import { useState } from 'react'
import { connections } from '../features/connections/client'
import type { ConnectionRequest } from '../../shared/connections'
import { ActionButton, ErrorMessage, PersonPhoto } from './common'
import { toast } from './feedback'
import './sent-requests.css'

const requestKey = (person: ConnectionRequest) => `${person.id}/${person.requested_at}`

// Pending requests you sent. Cancelling hides the row at once and restores it if the server refuses.
export function SentRequests({ sent, disabled, changed }: { sent: ConnectionRequest[]; disabled?: boolean; changed: () => void }) {
  const [hidden, setHidden] = useState<string[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState('')
  const rows = sent.filter(person => !hidden.includes(requestKey(person)))
  async function cancel(person: ConnectionRequest) {
    setError('')
    setConfirming(null)
    setHidden(ids => [...ids, requestKey(person)])
    try {
      await connections.cancelSent(person.id, person.requested_at)
      toast('Request cancelled')
    } catch (failure) {
      setHidden(ids => ids.filter(key => key !== requestKey(person)))
      setError(`Couldn’t cancel your request to ${person.display_name}. ${failure instanceof Error ? failure.message : 'Try again.'}`)
    }
    changed()
  }
  if (rows.length === 0 && !error) return null
  return <section className="requests-sent" aria-label="Sent requests">
    <h2 className="requests-sent-title">Sent <span className="request-count">{rows.length}</span></h2>
    <ErrorMessage>{error}</ErrorMessage>
    {rows.map(person => <div className="request-entry" key={person.id} role="group" aria-label={`Request to ${person.display_name}`}>
      <div className="request-profile">
        <PersonPhoto id={person.id} name={person.display_name} fallback={person.avatar_url} />
        <div className="request-copy"><h3>{person.display_name}</h3><p>{person.mode === 'dating' ? 'Dating interest sent' : 'Request sent'}</p></div>
      </div>
      <div className="request-actions">
        {confirming === requestKey(person)
          ? <>
            <ActionButton disabled={disabled} onClick={() => void cancel(person)}>Cancel request</ActionButton>
            <ActionButton secondary onClick={() => setConfirming(null)}>Keep</ActionButton>
          </>
          : <ActionButton secondary disabled={disabled} onClick={() => setConfirming(requestKey(person))}>Cancel</ActionButton>}
      </div>
    </div>)}
  </section>
}
