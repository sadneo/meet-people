import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { connections } from '../features/connections/client'
import { useAction, useLoad } from './hooks'
import { ActionButton, ErrorMessage, Icon, PersonPhoto, ResourceState } from './common'
import { matchingClient } from './matching-client'
import { useCurrent } from './current'
import { SafetyActions } from './Safety'

export function Requests() {
  const current = useCurrent(), navigate = useNavigate(), action = useAction()
  const people = useLoad(useCallback(signal => connections.list(signal), []))
  const [uncertain, setUncertain] = useState(false)
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  async function respond(id: string, accept: boolean, mode?: 'friends' | 'dating' | null) {
    if (uncertain) return
    await action.run(async () => {
      setUncertain(true)
      const result = accept
        ? mode === 'dating'
          ? await matchingClient(current.session.access_token).connect('Dating', id)
          : await matchingClient(current.session.access_token).acceptFriend(id)
        : await connections.remove(id)
      if (accept ? result.status !== 'connected' : result.status !== 'none') throw new Error('The request response could not be confirmed.')
      window.dispatchEvent(new Event('pebble:activity-changed'))
      window.dispatchEvent(new Event('pebble:matching-changed'))
      if (!live.current) return
      setUncertain(false)
      people.reload()
      if (accept && result.status === 'connected' && result.conversationId) {
        navigate(`/messages/chat?conversation=${encodeURIComponent(result.conversationId)}`)
      }
    })
  }
  async function reconcile() {
    await action.run(async () => {
      // Confirm the current state with a read before allowing another mutation.
      await connections.list()
      if (!live.current) return
      setUncertain(false)
      people.reload()
      window.dispatchEvent(new Event('pebble:activity-changed'))
    })
  }
  const sections = [
    { mode: 'friends', title: 'Friends', icon: 'Friends', people: people.value?.incoming.filter(person => person.mode === 'friends') ?? [] },
    { mode: 'dating', title: 'Dating', icon: 'Dating', people: people.value?.incoming.filter(person => person.mode === 'dating') ?? [] },
    { mode: 'earlier', title: 'Earlier requests', icon: 'Activity', people: people.value?.incoming.filter(person => !person.mode) ?? [] },
  ]
  return <main className="requests-page">
    <header className="requests-header">
      <h1>Requests</h1>
      <Link className="round requests-close" to="/messages" aria-label="Close requests"><Icon name="Skip" /></Link>
    </header>
    <ErrorMessage>{action.error}</ErrorMessage>
    <ResourceState loading={people.loading} error={people.error} reload={people.reload} />
    {uncertain && !action.busy && <div className="requests-reconcile"><p role="status">The response could not be confirmed. Reload requests before trying again.</p><ActionButton secondary onClick={() => void reconcile()}>Reload requests</ActionButton></div>}
    {people.value && people.value.incoming.length === 0 && <p className="muted">No pending requests.</p>}
    {people.value && people.value.incoming.length > 0 && sections.filter(section => section.mode !== 'earlier' || section.people.length > 0).map(section => <details className={`requests-group ${section.mode}`} key={section.mode} open>
      <summary><Icon name={section.icon} /><span>{section.title}</span><span className="request-count">{section.people.length}</span><span className="requests-chevron" aria-hidden="true">⌄</span></summary>
      {section.people.length === 0 && <p className="muted requests-group-empty">No pending {section.title.toLowerCase()} {section.mode === 'dating' ? 'likes' : 'requests'}.</p>}
      {section.mode === 'earlier' && <p className="muted requests-group-empty">The original mode wasn’t recorded for these older requests.</p>}
      {section.people.map(person => <section className="request-entry" aria-label={`Request from ${person.display_name}`} key={person.id}>
      <div className="request-profile">
        <PersonPhoto id={person.id} name={person.display_name} fallback={person.avatar_url} />
        <div className="request-copy"><h2>{person.display_name}</h2><p>{person.mode === 'friends' ? 'Friends request' : person.mode === 'dating' ? 'Dating interest' : 'Request'}</p></div>
        <SafetyActions id={person.id} name={person.display_name} iconOnly />
      </div>
      <div className="request-actions">
        {/* eslint-disable-next-line react-hooks/refs -- respond reads the mounted ref only after a click/network response, never during render. */}
        <ActionButton disabled={action.busy || uncertain} onClick={() => void respond(person.id, true, person.mode)}>{person.mode === 'dating' ? 'Like back' : 'Accept'}</ActionButton>
        <ActionButton secondary disabled={action.busy || uncertain} onClick={() => void respond(person.id, false)}>Decline</ActionButton>
      </div>
    </section>)}
    </details>)}
  </main>
}
