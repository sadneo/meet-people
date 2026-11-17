/* global document, Option, fetch, URL */
const $ = id => document.getElementById(id)
let data = { datasets: {} }
let refreshing = false
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const dataset = () => data.datasets[$('source').value]
const rows = () => dataset()?.rows ?? []
const dateLabel = value => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
const timestamp = value => value ? new Date(value).toLocaleString() : 'unknown'

function selectOptions(element, options, preferred) {
  const previous = preferred ?? element.value
  element.replaceChildren(...options.map(([value, label]) => new Option(label, value)))
  if (options.some(([value]) => value === previous)) element.value = previous
}

function populate(resetLocation = false) {
  const locations = [...new Map(rows().map(row => [row.location_slug, row.location_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  selectOptions($('location'), locations, resetLocation ? (locations.some(([slug]) => slug === 'east-side-dining') ? 'east-side-dining' : locations[0]?.[0]) : undefined)
  const locationRows = rows().filter(row => row.location_slug === $('location').value)
  const dates = [...new Set(locationRows.map(row => row.menu_date))].sort()
  selectOptions($('date'), dates.map(date => [date, dateLabel(date)]), dates.includes($('date').value) ? $('date').value : (dates.find(date => date >= data.today) ?? dates[0]))
  const onDate = locationRows.filter(row => row.menu_date === $('date').value)
  const menus = [...new Map(onDate.map(row => [row.menu_slug, row.menu_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const preferred = resetLocation ? (menus.find(([slug]) => slug.startsWith('todays-dine-in-specials'))?.[0] ?? '') : undefined
  selectOptions($('menu'), [['', 'All menus'], ...menus], preferred)
  render()
}

function nutritionLabel(key) {
  const units = { g: 'g', mg: 'mg', mcg: 'µg', iu: 'IU', re: 'RE' }
  const parts = key.split('_'), unit = units[parts[0]]
  const label = (unit ? parts.slice(1) : parts).join(' ')
  return [label.charAt(0).toUpperCase() + label.slice(1), unit ?? '']
}

function dish(item) {
  const nutrients = Object.entries(item.nutrition ?? {}).filter(([, value]) => value !== null)
  const serving = item.serving_size ? [item.serving_size.amount, item.serving_size.unit].filter(value => value !== null).join(' ') : ''
  const calories = item.nutrition?.calories
  return `<details class="item"><summary><span class="item-name">${escape(item.name)}</span>${calories == null ? '' : `<span class="calories">${escape(calories)} cal</span>`}
    ${item.labels.length ? `<span class="labels">${item.labels.map(escape).join(', ')}</span>` : ''}</summary>
    <div class="item-body">
      ${item.description ? `<p>${escape(item.description)}</p>` : ''}
      ${item.ingredients ? `<p><strong>Ingredients:</strong> ${escape(item.ingredients)}</p>` : ''}
      ${item.price !== null ? `<p><strong>Published price:</strong> ${escape(item.price)}</p>` : ''}
      ${serving ? `<p><strong>Serving:</strong> ${escape(serving)}</p>` : ''}
      ${nutrients.length ? `<table class="nutrition" aria-label="Nutrition for ${escape(item.name)}"><tbody>${nutrients.map(([key, value]) => {
        const [label, unit] = nutritionLabel(key)
        return `<tr><td>${escape(label)}</td><td>${escape(value)} ${escape(unit)}</td></tr>`
      }).join('')}</tbody></table>` : '<p class="muted">Nutrition not supplied by this source.</p>'}
    </div></details>`
}

function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? escape(url.href) : '#' } catch { return '#' }
}

function render() {
  const selected = dataset()
  const query = $('search').value.trim().toLowerCase()
  const menus = rows().filter(row => row.location_slug === $('location').value && row.menu_date === $('date').value
    && (!$('menu').value || row.menu_slug === $('menu').value)).map(row => ({ ...row, items: row.items.filter(item =>
      !query || [item.name, item.ingredients, item.description, item.station, ...item.labels].filter(Boolean).join(' ').toLowerCase().includes(query)) }))
    .filter(row => !query || row.items.length)
  const total = menus.reduce((count, row) => count + row.items.length, 0)
  $('count').textContent = `${total} dishes in ${menus.length} ${menus.length === 1 ? 'menu' : 'menus'}`
  const capturedAt = selected?.capturedAt ?? selected?.rows?.[0]?.last_synced_at
  const refreshNote = refreshing ? 'Fetching fresh menus… You can keep browsing. ' : ''
  $('status').textContent = `${refreshNote}${selected ? `Last fetched ${timestamp(capturedAt)}. ${selected.rows.length} dated menus loaded.${selected.status !== 'ok' ? ' Some data could not be refreshed; see source issues below.' : ''}` : 'No menus loaded. Use Fetch fresh menus to load the published week.'}`
  const issues = selected?.issues ?? []
  $('errors').hidden = issues.length === 0
  $('errors').innerHTML = issues.length ? `<details><summary>${issues.length} source ${issues.length === 1 ? 'issue' : 'issues'}</summary><ul>${issues.map(issue => `<li>${escape(issue.code)}${issue.resource ? `: ${escape(issue.resource)}` : ''}</li>`).join('')}</ul></details>` : ''
  $('menus').innerHTML = menus.length ? menus.map(row => {
    const groups = new Map()
    for (const item of row.items) {
      const station = item.station ?? ''
      if (!groups.has(station)) groups.set(station, [])
      groups.get(station).push(item)
    }
    return `<article class="menu"><div class="menu-heading"><div><h2>${escape(row.menu_name)}</h2><p class="menu-meta">${escape(row.location_name)} · ${escape(dateLabel(row.menu_date))}</p></div><a href="${safeUrl(row.source_url)}" target="_blank" rel="noreferrer">Original menu</a></div>
      ${row.notices.length ? `<p class="notices">${row.notices.map(escape).join(' ')}</p>` : ''}
      ${row.items.length ? [...groups].map(([station, items]) => `${station ? `<h3>${escape(station)}</h3>` : ''}${items.map(dish).join('')}`).join('') : '<p class="muted">No dishes published for this menu and date.</p>'}</article>`
  }).join('') : `<p class="empty">${query ? 'No dishes match your search. Try another word or clear the search.' : 'No menus available for this selection. Try another source or fetch fresh menus.'}</p>`
  $('menus').setAttribute('aria-busy', 'false')
}

async function load(refresh = false) {
  refreshing = refresh
  $('refresh').disabled = true
  $('refresh').textContent = refresh ? 'Fetching menus…' : 'Loading…'
  render()
  try {
    const response = await fetch(refresh ? '/api/refresh' : '/api/menus', { method: refresh ? 'POST' : 'GET' })
    if (!response.ok) throw new Error('Could not load menus. Check the local server and try again.')
    data = await response.json()
    refreshing = false
    populate(!$('location').value)
  } catch (error) {
    refreshing = false
    render()
    $('status').textContent = error.message
  } finally {
    $('refresh').disabled = false
    $('refresh').textContent = 'Fetch fresh menus'
  }
}

$('filters').addEventListener('submit', event => event.preventDefault())
$('source').addEventListener('change', () => populate(true))
for (const name of ['location', 'date']) $(name).addEventListener('change', () => populate())
for (const name of ['menu', 'search']) $(name).addEventListener('input', render)
$('refresh').addEventListener('click', () => load(true))
load()
