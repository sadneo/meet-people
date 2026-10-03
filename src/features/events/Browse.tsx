import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { supabase } from '../../supabase'
import { useSession } from '../../auth/useSession'
import { EventSchema, EventsResponseSchema, type LiveEvent } from '../../../shared/events'
import { eventDate, eventRequest, safeImage, sourceLink } from './client'
import { Button, Chips, Header, Icon } from './ui'
import { Company } from './Company'
import { EventsFeature } from './Feature'
import { eventDetailPath, eventsPath } from './routes'

function EventPhoto({ event, detail = false }: { event: LiveEvent; detail?: boolean }) {
  const [failed, setFailed] = useState(false)
  return <img className={detail ? 'ev-detail-hero' : undefined} src={failed ? '/prototype/music.jpg' : safeImage(event.image_url)} alt={failed || safeImage(event.image_url).startsWith('/prototype/') ? 'Illustrative concert photography' : `${event.title} event image`} onError={() => { if (!failed) setFailed(true) }} />
}
export function EventsScreen() {
  return <EventsFeature><EventsFeed /></EventsFeature>
}

function EventsFeed() {
  const [search, setSearch] = useSearchParams()
  const category = search.get('category') ?? 'All'
  const page = Math.max(1, Number(search.get('page')) || 1)
  const selected = search.get('selected')
  const [loaded, setLoaded] = useState<{ query: string; data: ReturnType<typeof EventsResponseSchema.parse> } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null)
  const [geoError, setGeoError] = useState('')
  const query = new URLSearchParams({ page: String(page), ...(category !== 'All' ? { category } : {}), ...(origin ? { latitude: String(origin.latitude), longitude: String(origin.longitude) } : {}) }).toString()
  const result = loaded?.query === query ? loaded.data : null
  useEffect(() => {
    const controller = new AbortController()
    void eventRequest(`?${query}`, EventsResponseSchema, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setLoaded({ query, data }); setError('') }
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load events.') })
    return () => controller.abort()
  }, [query, retry])
  // Keep responses tied to the requested filter rather than displaying stale cards.
  const visible = result?.page === page ? result.events : []
  const previewId = visible.find(event => event.id === selected)?.id ?? visible[0]?.id
  function changeCategory(value: string) {
    setLoaded(null); setError(''); setSearch(value === 'All' ? {} : { category: value })
  }
  function goPage(next: number) {
    setLoaded(null); setError(''); setSearch({ ...(category !== 'All' ? { category } : {}), page: String(next) })
  }
  return <div className="ev-events-workspace"><section className="ev-events-feed">
    <Header title="Events around campus" sub="Find something worth showing up for." />
    <Chips label="Event category" options={[...new Set(['All', 'Music', 'Food', 'Outdoors', ...(result?.categories ?? []), category])]} values={[category]} onChange={([value]) => changeCategory(value)} />
    <p className="ev-results-note"><Icon name="pin" size={16} />Upcoming events · dates in your local time zone</p>
    <Button secondary onClick={() => {
      if (!navigator.geolocation) { setGeoError('Location is unavailable in this browser.'); return }
      navigator.geolocation.getCurrentPosition(position => { setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setGeoError('') }, () => setGeoError('Could not access your location. Allow location access and try again.'), { timeout: 10000 })
    }}>Show distances from me</Button>
    {geoError && <p role="alert">{geoError}</p>}
    {error ? <div className="ev-empty" role="alert"><h2>Could not load events</h2><p>{error}</p><Button onClick={() => setRetry(value => value + 1)}>Retry</Button></div> : !result ? <p role="status">Loading events…</p> : !visible.length ? <div className="ev-empty"><h2>A quiet calendar</h2><p>No upcoming events in this category. Try another category.</p><Button onClick={() => changeCategory('All')}>Show all events</Button></div> : <div className="ev-event-grid">{visible.map(event => {
      const open = (click: React.MouseEvent<HTMLAnchorElement>) => {
        if (click.button === 0 && !click.ctrlKey && !click.metaKey && !click.shiftKey && !click.altKey && window.matchMedia('(min-width: 1800px)').matches) {
          click.preventDefault(); const next = new URLSearchParams(search); next.set('selected', event.id); setSearch(next, { replace: true })
        }
      }
      return <article className={`ev-event-card ${event.id === previewId ? 'is-current' : ''}`} key={event.id}>
        <Link className="ev-event-image" aria-label={`View ${event.title}`} to={eventDetailPath(event.id)} onClick={open}><EventPhoto event={event} /></Link>
        <div className="ev-event-copy"><span className="ev-eyebrow">{event.category ?? 'Other'}{event.distance_miles !== null ? ` · ${event.distance_miles} mi` : ''}</span>
          <Link className="ev-name-link" to={eventDetailPath(event.id)} onClick={open}><h2>{event.title}</h2></Link>
          <p className="ev-event-date">{eventDate(event.starts_at, event.ends_at)}</p><p><Icon name="pin" size={16} />{event.location_name ?? event.city ?? 'Location to be announced'}</p>
          <div className="ev-social-context"><Icon name="profile" /><span>{event.interested_count} people looking for company</span></div>
          <Link className="ev-button ev-secondary ev-wide" to={eventDetailPath(event.id)} onClick={open}>See event & people<Icon name="arrow" size={18} /></Link>
        </div>
      </article>
    })}</div>}
    {result && <div className="ev-event-pagination"><Button secondary disabled={page === 1} onClick={() => goPage(page - 1)}>Previous</Button><span>Page {page}</span><Button secondary disabled={!result.hasMore} onClick={() => goPage(page + 1)}>Next</Button></div>}
  </section><aside className="ev-event-preview">{previewId && <EventDetail key={previewId} id={previewId} preview />}</aside></div>
}

export function EventDetail({ id, preview = false }: { id?: string; preview?: boolean }) {
  const params = useParams()
  const eventId = id ?? params.id ?? ''
  // Remount data and company when navigating directly between event URLs.
  const content = <EventDetailContent key={eventId} id={eventId} preview={preview} />
  return preview ? content : <EventsFeature>{content}</EventsFeature>
}

function EventDetailContent({ id, preview }: { id: string; preview: boolean }) {
  const [event, setEvent] = useState<LiveEvent | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const { session, ready } = useSession()
  useEffect(() => {
    const controller = new AbortController()
    void eventRequest(`/${id}`, EventSchema, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setEvent(data); setError('') } }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load this event.')
    })
    return () => controller.abort()
  }, [id, retry])
  const url = sourceLink(event?.source_url ?? null)
  return <>
    {!preview && <Link className="ev-text-button" to={eventsPath}><Icon name="back" />Back to events</Link>}
    <Header title={preview ? 'Selected event' : 'Event details'} />
    {error ? <div role="alert"><p>{error}</p><Button onClick={() => setRetry(value => value + 1)}>Retry</Button></div> : !event ? <p role="status">Loading event…</p> : <article className="ev-event-detail">
      <EventPhoto event={event} detail />
      <div className="ev-detail-body"><div><span className="ev-eyebrow">{event.category ?? 'Other'}</span><h1>{event.title}</h1>
        <p className="ev-detail-fact"><Icon name="events" />{eventDate(event.starts_at, event.ends_at)}</p><p className="ev-detail-fact"><Icon name="pin" />{event.location_name ?? event.city ?? 'Location to be announced'}</p>
        {event.address && <p>{event.address}</p>}<p className="ev-description">{event.description ?? 'No description provided.'}</p>
        <span className="ev-hint">Source: {event.source}{!event.image_url ? ' · Illustrative photography' : ''}</span>
        {url && <p><a className="ev-text-button" href={url} target="_blank" rel="noopener noreferrer">View original listing</a></p>}
        {session && <Button secondary onClick={() => void supabase?.auth.signOut()}>Sign out</Button>}
      </div><Company key={`${id}-${session?.user.id ?? 'guest'}`} id={id} title={event.title} session={session} authReady={ready} /></div>
    </article>}
  </>
}
