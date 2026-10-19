import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate } from 'react-router'
import { conversationPath, ensureEventConversation } from '../messaging/client'
import { EventCompanySchema, type EventCompany } from '../../../shared/events'
import { eventRequest } from './client'
import { Button, Icon } from './ui'
import { EventSignIn } from './Auth'

function Initials({ name }: { name: string }) {
  return <span className="ev-event-initials" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</span>
}

export function Company({ id, title, session, authReady }: { id: string; title: string; session: Session | null; authReady: boolean }) {
  const navigate = useNavigate()
  const openingChat = useRef(false)
  const [chatBusy, setChatBusy] = useState(false)
  const [company, setCompany] = useState<EventCompany | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const generation = useRef(0)
  const mutating = useRef(false)
  const [name, setName] = useState(() => typeof session?.user.user_metadata?.display_name === 'string' ? session.user.user_metadata.display_name.slice(0, 80) : '')
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    const refresh = () => {
      if (mutating.current) return
      const current = ++generation.current
      void eventRequest(`/${id}/company`, EventCompanySchema, { signal: controller.signal }).then(data => {
        if (!controller.signal.aborted && current === generation.current) { setCompany(data); setError('') }
      }).catch((failure: unknown) => { if (!controller.signal.aborted && current === generation.current) setError(failure instanceof Error ? failure.message : 'Could not load company.') })
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    return () => { controller.abort(); window.clearInterval(timer) }
  }, [id, session, reload])

  async function act(action: 'interest' | 'uninterest' | 'join' | 'leave') {
    mutating.current = true
    ++generation.current
    setBusy(true); setError('')
    try { setCompany(await eventRequest(`/${id}/company`, EventCompanySchema, { body: { action, ...(name.trim() ? { name: name.trim() } : {}) } })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Try again.') }
    finally { ++generation.current; mutating.current = false; setBusy(false) }
  }
  if (!authReady) return <section><h2>Find your company</h2><p role="status">Checking sign-in…</p></section>
  if (!session) return <section><h2>Find your company</h2><EventSignIn /></section>
  const group = company?.group
  async function openChat() {
    if (!group || openingChat.current) return
    openingChat.current = true; setChatBusy(true); setError('')
    try { const result = await ensureEventConversation(group.id); navigate(conversationPath(result.conversationId)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not open conversation.') }
    finally { openingChat.current = false; setChatBusy(false) }
  }
  return <section className={group ? 'ev-event-match-result' : undefined} aria-busy={busy}>
    {group ? <>
      <span className="ev-event-match-badge"><Icon name={group.members.length > 1 ? 'check' : 'time'} size={16} />{group.members.length > 1 ? 'Group formed' : 'Waiting for company'}</span>
      <h2>{group.members.length > 1 ? 'Your event group is ready' : 'You’re looking for company'}</h2>
      <p>{group.members.length > 1 ? `You’re going to ${title} with people who chose the same event.` : 'Someone who joins this event can join your group. You can leave at any time.'}</p>
      <div className="ev-event-group">{group.members.map(person => <div className="ev-event-group-person" key={person.id}><Initials name={person.name} /><span><strong>{person.id === session.user.id ? `${person.name} (you)` : person.name}</strong><small>Going to this event</small></span></div>)}</div>
      <div className="ev-event-match-reasons"><span>Same event</span><span>Small group · up to 4</span></div>
      {group.members.length > 1 && <Button secondary className="ev-wide" disabled={busy || chatBusy} onClick={() => void openChat()}>{chatBusy ? 'Opening conversation…' : 'Message group'}</Button>}
      <Button secondary className="ev-wide" disabled={busy} onClick={() => void act('leave')}>Leave group</Button>
    </> : <>
      <h2>Find your company</h2>
      {!company && !error && <p role="status">Loading interested people…</p>}
      {company && <>
        <p className="ev-hint">{company.interestedCount} people looking for company</p>
        {company.interested.map(person => <div className="ev-interested-person" key={person.id}><Initials name={person.name} /><span><strong>{person.name}{person.id === session.user.id ? ' (you)' : ''}</strong><small>Looking for someone to go with</small></span></div>)}
        {!company.interestedCount && <p>Be the first to look for company.</p>}
        <label>Your name<input maxLength={80} autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} placeholder="Name shown to other students" /></label>
        <p className="ev-hint">Your name is visible to signed-in people viewing this event when you express interest.</p>
        <Button secondary className="ev-wide" disabled={busy || (!company.isInterested && !name.trim())} onClick={() => void act(company.isInterested ? 'uninterest' : 'interest')}>{company.isInterested ? 'Remove my interest' : 'I’m interested'}</Button>
        <Button className="ev-wide" disabled={busy || !name.trim()} onClick={() => void act('join')}>Find someone to go with</Button>
      </>}
    </>}
    {error && <div role="alert"><p>{error}</p><Button secondary disabled={busy} onClick={() => setReload(value => value + 1)}>Retry</Button></div>}
    {group && <Button secondary className="ev-wide" disabled={busy} onClick={() => void act('uninterest')}>Remove interest & leave group</Button>}
  </section>
}
