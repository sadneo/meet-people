import { addMenuDays, emptyMenuItem, fetchMenuText, isMenuDate, issueCode, menuWindow, nutrisliceApi, record, textValue,
  type DiningInput, type DiningMenu, type MenuItem, type ScrapeResult } from './dining-menus.ts'

export type NutrisliceLocation = { id: number; slug: string; name: string; menus: { id: number; slug: string; name: string }[] }

export function parseNutrisliceLocations(payload: unknown): NutrisliceLocation[] {
  if (!Array.isArray(payload) || !payload.length) throw new Error('nutrislice_invalid_locations')
  return payload.map(value => {
    const location = record(value)
    if (!Number.isInteger(location.id) || !textValue(location.name) || !validSlug(location.slug)
      || !Array.isArray(location.active_menu_types)) throw new Error('nutrislice_invalid_location')
    const menus = location.active_menu_types.map(value => {
      const menu = record(value)
      if (!Number.isInteger(menu.id) || !validSlug(menu.slug) || !textValue(menu.name)) throw new Error('nutrislice_invalid_menu_type')
      return { id: menu.id as number, slug: menu.slug as string, name: menu.name as string }
    })
    return { id: location.id as number, slug: location.slug as string, name: location.name as string, menus }
  })
}

function validSlug(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
}

function scalar(value: unknown): string | number | null {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? value : null
}

function normalizeItem(item: Record<string, unknown>, station: string | null): MenuItem | null {
  const food = record(item.food)
  const name = textValue(food.name)
  if (!name) return null
  const rawNutrition = record(food.rounded_nutrition_info)
  const nutrition = Object.fromEntries(Object.entries(rawNutrition)
    .filter(([, v]) => v === null || (typeof v === 'number' && Number.isFinite(v)))) as Record<string, number | null>
  const icons = record(food.icons).food_icons
  const serving = record(food.serving_size_info)
  return {
    ...emptyMenuItem(name), external_id: String(item.id ?? food.id ?? name), station,
    description: textValue(food.description), ingredients: textValue(food.ingredients), image_url: textValue(food.image_url),
    price: scalar(item.price) ?? scalar(food.price),
    nutrition: Object.keys(nutrition).length ? nutrition : null,
    serving_size: Object.keys(serving).length ? { amount: scalar(serving.serving_size_amount), unit: textValue(serving.serving_size_unit) } : null,
    labels: Array.isArray(icons) ? [...new Set(icons.map(record).filter(icon => icon.enabled !== false)
      .map(icon => textValue(icon.name)).filter((name): name is string => name !== null))] : [],
  }
}

export function normalizeNutrisliceWeek(payload: unknown, location: NutrisliceLocation,
  menu: NutrisliceLocation['menus'][number], now: Date): DiningMenu[] {
  const week = record(payload)
  if (!Array.isArray(week.days)) throw new Error('nutrislice_invalid_week')
  const seen = new Set<string>()
  return week.days.map(value => {
    const day = record(value)
    if (!isMenuDate(day.date) || seen.has(day.date) || !Array.isArray(day.menu_items)) throw new Error('nutrislice_invalid_day')
    seen.add(day.date)
    if (day.has_unpublished_menus === true) throw new Error('nutrislice_unpublished_menu')
    const items: MenuItem[] = [], notices: string[] = []
    let station: string | null = null
    for (const value of day.menu_items) {
      const item = record(value)
      if (item.is_section_title || item.is_station_header) {
        station = textValue(item.text)
        continue
      }
      const food = normalizeItem(item, station)
      if (food) items.push(food)
      else if (textValue(item.text)) notices.push(textValue(item.text)!)
      else if (!item.blank_line) throw new Error('nutrislice_invalid_item')
    }
    return {
      source: 'nutrislice_sbu', external_id: `${location.slug}:${menu.slug}:${day.date}`,
      location_slug: location.slug, location_name: location.name, menu_slug: menu.slug, menu_name: menu.name,
      menu_date: day.date, source_url: `https://stonybrook.nutrislice.com/menu/${location.slug}/${menu.slug}/${day.date.replaceAll('-', '/')}`,
      items, notices, last_synced_at: now.toISOString(),
    }
  })
}

export async function scrapeNutrisliceMenus(input: DiningInput, now = new Date(), network: typeof fetch = fetch): Promise<ScrapeResult> {
  const result: ScrapeResult = { rows: [], requestCount: 1, fetchedCount: 0, skippedCount: 0, issues: [] }
  const signal = AbortSignal.timeout(90_000)
  let locations: NutrisliceLocation[]
  try {
    locations = parseNutrisliceLocations(JSON.parse(await fetchMenuText(`${nutrisliceApi}/menu/api/schools/?format=json`, network, signal)))
  } catch (error) {
    result.issues.push({ code: issueCode(error), resource: 'locations' })
    return result
  }
  if (input.locations.length) {
    for (const slug of input.locations) {
      if (!locations.some(location => location.slug === slug)) result.issues.push({ code: 'unknown_location', resource: slug })
    }
    locations = locations.filter(location => input.locations.includes(location.slug))
  }
  // Put the two dine-in halls in the smoke sample; discover every location in full mode.
  const priority = (slug: string) => ['east-side-dining', 'west-side-dining'].includes(slug) ? 0 : 1
  locations.sort((a, b) => priority(a.slug) - priority(b.slug))
  let menus = locations.flatMap(location => location.menus.map(menu => ({ location, menu })))
  if (input.mode === 'smoke') menus = locations.flatMap(location => location.menus.slice(0, 1).map(menu => ({ location, menu }))).slice(0, 3)
  const window = menuWindow(input)
  const firstSunday = addMenuDays(window.startsAt, -new Date(window.startsAt).getUTCDay())
  const weeks: string[] = []
  for (let date = firstSunday; date < window.endsAt; date = addMenuDays(date, 7)) weeks.push(date)
  const jobs = menus.flatMap(({ location, menu }) => weeks.map(date => ({ location, menu, date })))
  if (!menus.length && !result.issues.length) result.issues.push({ code: 'nutrislice_no_menu_types' })
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const { location, menu, date: weekDate } = jobs[next++]
      const resource = `${location.slug}:${menu.slug}:${weekDate}`
      if (signal.aborted) { result.issues.push({ code: 'menu_request_deferred', resource }); continue }
      result.requestCount++
      try {
        const [year, month, day] = weekDate.split('-').map(Number)
        const url = `${nutrisliceApi}/menu/api/weeks/school/${location.id}/menu-type/${menu.id}/${year}/${month}/${day}/?format=json`
        const payload: unknown = JSON.parse(await fetchMenuText(url, network, signal))
        const rows = normalizeNutrisliceWeek(payload, location, menu, now)
        const selected = rows.filter(row => row.menu_date >= window.startsAt && row.menu_date < window.endsAt)
        result.fetchedCount += rows.length
        result.skippedCount += rows.length - selected.length
        // Missing days mean unavailable data, never an empty menu that erases a prior snapshot.
        for (let date = window.startsAt; date < window.endsAt; date = addMenuDays(date, 1)) {
          if (date >= weekDate && date < addMenuDays(weekDate, 7)
            && !selected.some(row => row.menu_date === date)) result.issues.push({ code: 'nutrislice_missing_day', resource: `${resource}:${date}` })
        }
        result.rows.push(...selected)
      } catch (error) { result.issues.push({ code: issueCode(error), resource }) }
    }
  }))
  result.rows.sort((a, b) => a.external_id.localeCompare(b.external_id))
  return result
}
