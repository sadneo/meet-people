import { useState } from 'react'
import { usePrototype } from './context'
import { events, people } from './model'
import { Avatar, Avatars, Button, Chips, Empty, Header, Icon } from './ui'

export function EventsScreen() {
  const { empty, setEmpty, go, setEventId, eventId, state } = usePrototype()
  const [category, setCategory] = useState('All')
  const openEvent = (id: string) => { setEventId(id); if (!window.matchMedia('(min-width: 1800px)').matches) go('Event Detail') }
  const visible = events.filter(event => category === 'All' || event.category === category)
  return <div className="pt-events-workspace"><section className="pt-events-feed"><Header title="Events around campus" sub="Find something worth showing up for." /><Chips label="Event category" options={['All', 'Music', 'Food', 'Outdoors']} values={[category]} onChange={([value]) => { setCategory(value); if (value !== 'All') setEventId(events.find(event => event.category === value)!.id) }} /><p className="pt-results-note"><Icon name="pin" size={16} />Around campus · sample events, not live listings</p>{empty ? <Empty title="A quiet calendar" text="No events to show here yet. Try another category." action="Show sample events" onClick={() => setEmpty(false)} /> : <div className="pt-event-grid">{visible.map(event => <article className={`pt-event-card ${event.id === eventId ? 'is-current' : ''}`} key={event.id}><button className="pt-event-image" aria-label={`View ${event.title}`} onClick={() => { openEvent(event.id) }}><img src={`/prototype/${event.image}`} alt={event.category === 'Music' ? 'Live stage with warm concert lighting' : event.category === 'Food' ? 'Coffee being prepared in a café' : 'Sunlight through green woodland'} /><span className="pt-price">{event.price}</span></button><div className="pt-event-copy"><span className="pt-eyebrow">{event.category} · {event.distance}</span><button className="pt-name-link" onClick={() => { openEvent(event.id) }}><h2>{event.title}</h2></button><p className="pt-event-date">{event.when}</p><p><Icon name="pin" size={16} />{event.place}</p><div className="pt-social-context"><Avatars ids={event.people.filter(id => !state.blocked.includes(id))} /><span>{event.people.filter(id => !state.blocked.includes(id)).length} people looking for company</span></div><Button secondary className="pt-wide" onClick={() => { openEvent(event.id) }}>See event & people<Icon name="arrow" size={18} /></Button></div></article>)}</div>}</section><aside className="pt-event-preview"><EventDetail preview /></aside></div>
}
export function EventDetail({ preview = false }: { preview?: boolean }) {
  const { eventId, go, state, setPersonId } = usePrototype()
  const [matchedEventId, setMatchedEventId] = useState<string | null>(null)
  const event = events.find(e => e.id === eventId) ?? events[0]
  const interested = people.filter(person => event.people.includes(person.id) && !state.blocked.includes(person.id))
  const matched = matchedEventId === event.id

  return <>
    <Header title={preview ? 'Selected event' : 'Event details'} back={preview ? undefined : () => go('Events')} />
    <article className="pt-event-detail">
      <img className="pt-detail-hero" src={`/prototype/${event.image}`} alt={`${event.category} event atmosphere; illustrative photo`} />
      <div className="pt-detail-body">
        <div>
          <span className="pt-eyebrow">{event.category} · {event.price} · {event.distance}</span>
          <h1>{event.title}</h1>
          <p className="pt-detail-fact"><Icon name="events" />{event.when}</p>
          <p className="pt-detail-fact"><Icon name="pin" />{event.place}</p>
          <p className="pt-description">{event.description}</p>
          <span className="pt-hint">Fictional event · illustrative photography</span>
        </div>
        {matched ? <section aria-live="polite" className="pt-event-match-result">
          <span className="pt-event-match-badge"><Icon name="check" size={16} />Group formed</span>
          <h2>Your event group is ready</h2>
          <p>You’ve been matched with people who want to attend <strong>{event.title}</strong>.</p>
          <div className="pt-event-group" aria-label="Your event group">
            <div className="pt-event-group-person"><Avatar person={state.profile} size="small" /><span><strong>You</strong><small>Going to this event</small></span></div>
            {interested.map(person => <div className="pt-event-group-person" key={person.id}><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>Matched for {event.category.toLocaleLowerCase()}</small></span></div>)}
          </div>
          <div className="pt-event-match-reasons"><span>Same event</span><span>Nearby</span><span>Small group</span></div>
          <p className="pt-hint">Demo match only. No invitations or messages were sent.</p>
          <Button secondary className="pt-wide" onClick={() => setMatchedEventId(null)}>Leave group</Button>
        </section> : <section>
          <h2>Find your company</h2>
          {interested.map(person => <button className="pt-interested-person" key={person.id} onClick={() => { setPersonId(person.id); go('Other User Profile') }}><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>Looking for someone to go with</small></span><Icon name="arrow" size={16} /></button>)}
          <Button className="pt-wide" disabled={!interested.length} onClick={() => setMatchedEventId(event.id)}>Find someone to go with</Button>
        </section>}
      </div>
    </article>
  </>
}
