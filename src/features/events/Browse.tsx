import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { EventSchema, EventsResponseSchema, type LiveEvent } from '../../../shared/events'
import { eventDate, eventImagePlaceholder, eventRequest, safeImage, sourceLink } from './client'
import { Button, Chips, Header, Icon } from './ui'
import { EventGroupQueue } from './EventGroupQueue'
import { EventsFeature } from './Feature'
import { eventDetailPath, eventsPath } from './routes'
import { publicAuthPath, publicEventPath, publicEventsPath } from '../public/links'
import { PixelPebble } from '../pebble-art/PixelArt'

function EventPhoto({ event, detail = false, onImageFailure }: { event: LiveEvent; detail?: boolean; onImageFailure?: (source: string) => void }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const source = safeImage(event.image_url)
  const placeholder = source === eventImagePlaceholder || failedSource === source
  return <img className={detail ? 'ev-detail-hero' : undefined} src={placeholder ? eventImagePlaceholder : source} alt={placeholder ? 'Pebble placeholder illustration (not an event photo)' : `${event.title} event image`} onError={() => {
    if (!placeholder) { setFailedSource(source); onImageFailure?.(source) }
  }} />
}
// Guest cards lead with the date, since "when" is what people scan an events list for.
function DateStub({ value }: { value: string | null }) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return <time className="ev-guest-date" dateTime={date.toISOString()} aria-hidden="true"><span>{date.toLocaleString(undefined, { month: 'short' })}</span><strong>{date.getDate()}</strong></time>
}
export function EventsScreen({ guest = false }: { guest?: boolean }) {
  return <EventsFeature><EventsFeed guest={guest} /></EventsFeature>
}

function EventsFeed({ guest }: { guest: boolean }) {
  const detailPath = guest ? publicEventPath : eventDetailPath
  const [search, setSearch] = useSearchParams()
  const category = search.get('category') ?? 'All'
  const page = Math.max(1, Number(search.get('page')) || 1)
  const selected = search.get('selected')
  const [loaded, setLoaded] = useState<{ query: string; data: ReturnType<typeof EventsResponseSchema.parse> } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null)
  const [geoError, setGeoError] = useState('')

  const query = useMemo(() => {
    return new URLSearchParams({
      page: String(page),
      ...(category !== 'All' ? { category } : {}),
      ...(origin ? { latitude: String(origin.latitude), longitude: String(origin.longitude) } : {})
    }).toString()
  }, [page, category, origin])

  const result = loaded?.query === query ? loaded.data : null

  useEffect(() => {
    const controller = new AbortController()
    void eventRequest(`?${query}`, EventsResponseSchema, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setLoaded({ query, data }); setError('') }
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load events.') })
    return () => controller.abort()
  }, [query, retry, search.toString()]) // Added search.toString() to force updates on URL changes

  // Keep responses tied to the requested filter rather than displaying stale cards.
  const visible = result?.page === page ? result.events : []
  const previewId = visible.find(event => event.id === selected)?.id ?? visible[0]?.id

  function changeCategory(value: string) {
    setError('')
    setSearch(value === 'All' ? {} : { category: value })
  }

  function goPage(next: number) {
    setError('')
    setSearch({ ...(category !== 'All' ? { category } : {}), page: String(next) })
  }

  return <div className={`ev-events-workspace ${!visible.length ? 'is-empty' : ''} ${guest ? 'ev-guest' : ''}`}><section className="ev-events-feed">
    {guest ? <section className="ev-guest-hero"><div><h1 tabIndex={-1}>Find your kind of thing.</h1><p>Events happening around campus, open to everyone. Browse without an account.</p></div><PixelPebble className="ev-guest-pebble" /></section> : <Header title="Events" />}
    <div className={guest ? 'ev-guest-filters' : undefined}>
    <Chips label="Event category" options={[...new Set(['All', 'Music', 'Food', 'Outdoors', ...(result?.categories ?? []), category])]} values={[category]} onChange={([value]) => changeCategory(value)} />
    <button className="ev-icon-button ev-location-control" aria-label="Show distances from me" title="Show distances from me" onClick={() => {
      if (!navigator.geolocation) { setGeoError('Location is unavailable in this browser.'); return }
      navigator.geolocation.getCurrentPosition(position => { setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setGeoError('') }, () => setGeoError('Could not access your location. Allow location access and try again.'), { timeout: 10000 })
    }}>{guest ? <><Icon name="pin" size={20} /><span>Near me</span></> : <Icon name="pin" size={24} />}</button>
    </div>
    {geoError && <p role="alert">{geoError}</p>}
    {error ? <div className="ev-empty ev-calm-empty" role="alert"><Icon name="events" size={72} /><h2>Events unavailable</h2><Button secondary onClick={() => setRetry(value => value + 1)}>Retry</Button></div> : !result ? <p role="status">Loading events…</p> : !visible.length ? <div className="ev-empty ev-calm-empty"><Icon name="events" size={72} /><h2>A quiet calendar</h2><Button onClick={() => { changeCategory('All'); setRetry(r => r + 1); }}>Show all events</Button></div> : <div className="ev-event-grid">{visible.map(event => {
      const open = (click: React.MouseEvent<HTMLAnchorElement>) => {
        if (click.button === 0 && !click.ctrlKey && !click.metaKey && !click.shiftKey && !click.altKey && window.matchMedia('(min-width: 1800px)').matches) {
          click.preventDefault(); const next = new URLSearchParams(search); next.set('selected', event.id); setSearch(next, { replace: true })
        }
      }
      return <article className={`ev-event-card ${event.id === previewId ? 'is-current' : ''}`} key={event.id}>
        <Link className="ev-event-image" aria-label={`View ${event.title}`} to={detailPath(event.id)} onClick={open}><EventPhoto event={event} />{guest && <DateStub value={event.starts_at} />}</Link>
        <div className="ev-event-copy"><span className="ev-eyebrow">{event.category ?? 'Other'}{event.distance_miles !== null ? ` · ${event.distance_miles} mi` : ''}</span>
          <Link className="ev-name-link" to={detailPath(event.id)} onClick={open}><h2>{event.title}</h2></Link>
          <p className="ev-event-date">{eventDate(event.starts_at, event.ends_at)}</p><p><Icon name="pin" size={16} />{event.location_name ?? event.city ?? 'Location to be announced'}</p>
          <div className="ev-social-context"><Icon name="profile" /><span>{event.interested_count} people looking for company</span></div>
          <Link className="ev-button ev-secondary ev-wide" to={detailPath(event.id)} onClick={open}>See event & people<Icon name="arrow" size={18} /></Link>
        </div>
      </article>
    })}</div>}
    {result && <div className="ev-event-pagination"><Button secondary disabled={page === 1} onClick={() => goPage(page - 1)}>Previous</Button><span>Page {page}</span><Button secondary disabled={!result.hasMore} onClick={() => goPage(page + 1)}>Next</Button></div>}
    {guest && result && visible.length > 0 && <section className="ev-guest-cta" aria-labelledby="ev-guest-cta-title"><div><h2 id="ev-guest-cta-title">Going to one of these?</h2><p>Create an account and Pebble helps you find people who share your interests and free time.</p></div><Link className="pt-button pt-discovery-action" to={publicAuthPath('register')}>Get started</Link></section>}
  </section><aside className="ev-event-preview">{previewId && <EventDetail key={previewId} id={previewId} preview guest={guest} />}</aside></div>
}

export function EventDetail({ id, preview = false, guest = false }: { id?: string; preview?: boolean; guest?: boolean }) {
  const params = useParams()
  const eventId = id ?? params.id ?? ''
  // Remount event data and queue when navigating directly between event URLs.
  const content = <EventDetailContent key={eventId} id={eventId} preview={preview} guest={guest} />
  return preview ? content : <EventsFeature>{content}</EventsFeature>
}

function EventDetailContent({ id, preview, guest }: { id: string; preview: boolean; guest: boolean }) {
  const [event, setEvent] = useState<LiveEvent | null>(null)
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void eventRequest(`/${id}`, EventSchema, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setEvent(data); setError('') }
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not load this event.')
    })
    return () => controller.abort()
  }, [id, retry])

  const url = sourceLink(event?.source_url ?? null)
  const body = <>
    {!preview && <Link className="ev-text-button" to={guest ? publicEventsPath : eventsPath}><Icon name="back" />Back to events</Link>}
    <Header title={preview ? 'Selected event' : 'Event details'} />
    {error ? <div role="alert"><p>{error}</p><Button onClick={() => setRetry(value => value + 1)}>Retry</Button></div> : !event ? <p role="status">Loading event…</p> : <article className="ev-event-detail">
      <EventPhoto event={event} detail onImageFailure={setFailedImage} />
      <div className="ev-detail-body"><div><span className="ev-eyebrow">{event.category ?? 'Other'}</span><h1>{event.title}</h1>
        <p className="ev-detail-fact"><Icon name="events" />{eventDate(event.starts_at, event.ends_at)}</p><p className="ev-detail-fact"><Icon name="pin" />{event.location_name ?? event.city ?? 'Location to be announced'}</p>
        {event.address && <p>{event.address}</p>}<p className="ev-description">{event.description ?? 'No description provided.'}</p>
        <span className="ev-hint">Source: {event.source}{safeImage(event.image_url) === eventImagePlaceholder || failedImage === safeImage(event.image_url) ? ' · Pebble placeholder illustration (not an event photo)' : ''}</span>
        {url && <p><a className="ev-text-button" href={url} target="_blank" rel="noopener noreferrer">View original listing</a></p>}
      </div>{!guest && <EventGroupQueue listingId={id} />}</div>
    </article>}
  </>
  return guest && !preview ? <div className="ev-guest-detail">{body}</div> : body
}
