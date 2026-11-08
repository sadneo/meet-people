import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { campusDate, MenuDateSchema, type DiningItem, type DiningMenu } from '../../shared/dining'
import { readDiningMenus } from '../features/dining/client'
import { useCachedLoad } from '../data/useCachedLoad'
import { ActionButton, Empty, Icon, Modal, ResourceState } from './common'
import { PageSkeleton } from './loading/PageSkeleton'
import { sourceLink } from '../features/events/client'
import './food.css'

const dayDate = (date: string) => new Date(`${date}T12:00:00Z`)
const addDays = (date: string, days: number) => new Date(dayDate(date).getTime() + days * 86_400_000).toISOString().slice(0, 10)
const formatDate = (date: string, options: Intl.DateTimeFormatOptions) => dayDate(date).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' })
const locationKey = (menu: DiningMenu) => `${menu.source}:${menu.location_slug}`
const sourceName = (menu: DiningMenu) => menu.source === 'sbu_hospital' ? 'SBU Hospital' : 'Campus dining'
const menuOrder = (menu: DiningMenu) => {
  const name = menu.menu_name.toLowerCase()
  return [/(today|daily|all day)/, /breakfast/, /brunch/, /lunch/, /dinner/, /late night/].findIndex(pattern => pattern.test(name))
}

function useCampusDate() {
  const [today, setToday] = useState(campusDate)
  useEffect(() => {
    // Date checks do not refresh menus unless the default campus day changes.
    const refresh = () => { if (document.visibilityState === 'visible') setToday(campusDate()) }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return today
}

function ItemDetails({ item, close }: { item: DiningItem; close: () => void }) {
  const nutrition = Object.entries(item.nutrition ?? {}).filter((entry): entry is [string, number] => entry[1] !== null)
  const serving = [item.serving_size?.amount, item.serving_size?.unit].filter(value => value !== null && value !== undefined && value !== '').join(' ')
  return <Modal title={item.name} close={close} className="food-item-modal">
    {item.description && <p>{item.description}</p>}
    {!!item.labels.length && <><div className="food-labels">{item.labels.map(label => <span key={label}>{label}</span>)}</div><p className="mini muted">Dietary and allergen labels are supplied by the dining provider.</p></>}
    {item.ingredients && <section><h3>Ingredients</h3><p>{item.ingredients}</p></section>}
    {!!nutrition.length && <section><h3>Nutrition</h3>{serving && <p className="muted">Serving size: {serving}</p>}<dl className="food-nutrition">{nutrition.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl></section>}
    {!item.ingredients && !nutrition.length && <p className="muted">Ingredient and nutrition details haven’t been provided for this dish. Ask dining staff for more information.</p>}
  </Modal>
}

function MenuContent({ menu, search }: { menu: DiningMenu; search: string }) {
  const [selected, setSelected] = useState<DiningItem | null>(null)
  const needle = search.trim().toLocaleLowerCase()
  const items = menu.items.filter(item => !needle || [item.name, item.station, item.description, ...item.labels].some(value => value?.toLocaleLowerCase().includes(needle)))
  const stations = new Map<string, DiningItem[]>()
  for (const item of items) {
    const station = item.station || 'On the menu'
    stations.set(station, [...(stations.get(station) ?? []), item])
  }
  const source = sourceLink(menu.source_url)
  return <>
    <article className="food-menu-sheet" aria-labelledby="food-menu-title">
      <header className="food-menu-heading">
        <div><span className="food-menu-location">{menu.location_name}</span><h2 id="food-menu-title">{menu.menu_name}</h2><p>{formatDate(menu.menu_date, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
        <span className="food-menu-mark" aria-hidden="true"><Icon name="Food" /></span>
      </header>
      {!!menu.notices.length && <div className="food-notices">{menu.notices.map((notice, index) => <p key={index}>{notice}</p>)}</div>}
      {!menu.items.length ? <div className="food-empty"><Icon name="Food" /><h3>No dishes listed for this menu.</h3><p>Try another meal or check the dining provider’s menu.</p></div>
        : !items.length ? <div className="food-empty"><h3>No dishes match “{search}”.</h3><p>Try a dish name, station or published label.</p></div>
        : [...stations].map(([station, dishes], stationIndex) => <section className="food-station" key={station} aria-labelledby={`food-station-${stationIndex}`}>
          <h3 id={`food-station-${stationIndex}`}>{station}</h3>
          <ul>{dishes.map((item, index) => <li key={`${item.external_id ?? item.name}:${index}`}>
            <button type="button" className="food-dish" onClick={() => setSelected(item)} aria-label={`Details for ${item.name}`}>
              <span className="food-dish-copy"><span className="food-dish-name">{item.name}</span>{item.description && <span className="food-dish-description">{item.description}</span>}{!!item.labels.length && <span className="food-labels">{item.labels.map(label => <span key={label}>{label}</span>)}</span>}</span>
              <span className="food-dish-end">{item.price !== null && item.price !== '' && <span>{typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : item.price}</span>}<Icon name="ChevronRight" /></span>
            </button>
          </li>)}</ul>
        </section>)}
      <footer className="food-menu-footer"><div><span>{sourceName(menu)}</span><span>Last updated <time dateTime={menu.last_synced_at}>{new Date(menu.last_synced_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' })}</time></span></div>{source && <a href={source} target="_blank" rel="noreferrer">Provider menu <Icon name="External" /></a>}</footer>
    </article>
    {selected && <ItemDetails item={selected} close={() => setSelected(null)} />}
  </>
}

export function Food() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const today = useCampusDate()
  const rawDate = params.get('date')
  const date = rawDate && MenuDateSchema.safeParse(rawDate).success ? rawDate : today
  const weekOffset = Math.floor((dayDate(date).getTime() - dayDate(today).getTime()) / (7 * 86_400_000)) * 7
  const weekStart = addDays(today, weekOffset)
  // Keep all seven date controls inside the supported four-digit year range.
  const firstDay = weekStart < '0001-01-01' ? '0001-01-01' : weekStart > '9999-12-25' ? '9999-12-25' : weekStart
  const days = Array.from({ length: 7 }, (_, index) => addDays(firstDay, index))
  const resource = useCachedLoad(signal => readDiningMenus(date, signal), ['dining', date], 60_000, { retainDataOnError: true })
  const menus = resource.value?.menus ?? []
  const locations = [...new Map(menus.map(menu => [locationKey(menu), menu])).values()]
  const chosenLocation = params.get('location')
  const activeLocation = locations.find(menu => locationKey(menu) === chosenLocation) ?? locations[0]
  const meals = activeLocation ? menus.filter(menu => locationKey(menu) === locationKey(activeLocation)).sort((a, b) => (menuOrder(a) < 0 ? 99 : menuOrder(a)) - (menuOrder(b) < 0 ? 99 : menuOrder(b)) || a.menu_name.localeCompare(b.menu_name)) : []
  const activeMenu = meals.find(menu => menu.menu_slug === params.get('meal')) ?? meals[0]
  const search = params.get('q') ?? ''
  const backSearch = typeof location.state?.discoverSearch === 'string' ? location.state.discoverSearch : ''

  function update(name: string, value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      if (value) next.set(name, value); else next.delete(name)
      if (name === 'location') next.delete('meal')
      if (name !== 'q') next.delete('q')
      return next
    }, { replace: true, state: location.state })
  }

  return <section className="food-page" aria-labelledby="food-title">
    <Link className="food-back" to={`/matchmaking${backSearch ? `?${backSearch}` : ''}`}><Icon name="Back" />Discover</Link>
    <header className="food-page-heading"><div><h1 id="food-title">Food menus</h1><p>Stony Brook dining.</p></div><ActionButton secondary disabled={resource.refreshing} onClick={resource.reload}>{resource.refreshing && resource.value ? 'Refreshing…' : 'Refresh'}</ActionButton></header>
    <div className="food-date-heading"><h2>{date === today ? 'Today' : formatDate(date, { weekday: 'long' })}<span>{formatDate(date, { month: 'long', day: 'numeric' })}</span></h2><label className="food-calendar"><span>Choose a date</span><input type="date" aria-label="Menu date" min="0001-01-01" max="9999-12-31" value={date} onChange={event => { if (MenuDateSchema.safeParse(event.target.value).success) update('date', event.target.value) }} /></label></div>
    <div className="food-days" role="group" aria-label="Menu days">{days.map(day => <button type="button" key={day} aria-label={formatDate(day, { weekday: 'long', month: 'long', day: 'numeric' })} aria-pressed={date === day} onClick={() => update('date', day)}><span>{day === today ? 'Today' : formatDate(day, { weekday: 'short' })}</span><strong>{formatDate(day, { day: 'numeric' })}</strong></button>)}</div>
    <ResourceState loading={resource.loading} error={resource.error} reload={resource.reload} skeleton={<PageSkeleton view="dining" label="Loading food menus" />} />
    {!resource.loading && !resource.error && !menus.length && <Empty title="No menus published for this day."><p>Choose another date or check the dining providers for their latest menus.</p><div className="row wrap"><a className="btn light" href="https://stonybrook.nutrislice.com/menu/" target="_blank" rel="noreferrer">Campus dining <Icon name="External" /></a><a className="btn light" href="https://www.stonybrookmedicine.edu/diningservices/locations" target="_blank" rel="noreferrer">Hospital dining <Icon name="External" /></a></div></Empty>}
    {!!menus.length && <>
      <div className="food-filters"><label className="food-location"><span>Dining location</span><select value={activeLocation ? locationKey(activeLocation) : ''} onChange={event => update('location', event.target.value)}>{locations.map(menu => <option value={locationKey(menu)} key={locationKey(menu)}>{menu.location_name}{menu.source === 'sbu_hospital' ? ' · Hospital' : ''}</option>)}</select></label><label className="food-search"><span>Find a dish</span><input type="search" placeholder="Dish, station or label" value={search} onChange={event => update('q', event.target.value)} /></label></div>
      {meals.length > 5 ? <label className="food-menu-picker"><span>Menu</span><select value={activeMenu?.menu_slug ?? ''} onChange={event => update('meal', event.target.value)}>{meals.map(menu => <option key={menu.id} value={menu.menu_slug}>{menu.menu_name}</option>)}</select></label>
        : <div className="food-meals" role="group" aria-label="Meal">{meals.map(menu => <button type="button" key={menu.id} aria-pressed={menu.id === activeMenu?.id} onClick={() => update('meal', menu.menu_slug)}>{menu.menu_name}</button>)}</div>}
      {search && <button type="button" className="food-clear" onClick={() => update('q', '')}>Clear search</button>}
      {activeMenu && <MenuContent key={activeMenu.id} menu={activeMenu} search={search} />}
    </>}
  </section>
}
