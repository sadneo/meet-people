import { emptyMenuItem, fetchMenuText, hospitalLocationsUrl, isMenuDate, issueCode, localMenuDate, menuWindow,
  type DiningInput, type DiningMenu, type ScrapeResult } from './dining-menus.ts'

/** Follow only menu documents in the hospital's Weekly Menu section. */
export function discoverHospitalMenus(html: string): string[] {
  const section = html.match(/<h[1-6]\b[^>]*>\s*Weekly\s+Menu\s*<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/i)?.[1]
  if (!section) throw new Error('hospital_weekly_menu_section_missing')
  const documents = new Set<string>()
  for (const match of section.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    let url: URL
    try { url = new URL(match[1].replaceAll('&amp;', '&'), hospitalLocationsUrl) } catch { continue }
    const id = url.pathname.match(/^\/document\/d\/([a-zA-Z0-9_-]+)\//)?.[1]
    if (url.origin === 'https://docs.google.com' && !url.username && !url.password && id) documents.add(id)
  }
  if (!documents.size) throw new Error('hospital_menu_documents_missing_or_unsupported')
  if (documents.size > 8) throw new Error('hospital_too_many_menu_documents')
  return [...documents]
}

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const heading = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\s*$/i

function headingDate(match: RegExpMatchArray, now: Date): string {
  const month = months.indexOf(match[2].toLowerCase()) + 1
  const reference = Date.parse(localMenuDate(now))
  const year = Number(localMenuDate(now).slice(0, 4))
  const candidates = (match[4] ? [Number(match[4])] : [year - 1, year, year + 1])
    .map(year => `${year}-${String(month).padStart(2, '0')}-${match[3].padStart(2, '0')}`)
    .filter(isMenuDate).sort((a, b) => Math.abs(Date.parse(a) - reference) - Math.abs(Date.parse(b) - reference))
  const date = candidates[0]
  // Documents omit the year: infer only near the scrape date, then verify the weekday.
  if (!date || (!match[4] && Math.abs(Date.parse(date) - reference) > 45 * 86_400_000)
    || new Date(date).getUTCDay() !== weekdays.indexOf(match[1].toLowerCase())) throw new Error('hospital_ambiguous_menu_date')
  return date
}

export function parseHospitalMenu(text: string, documentId: string, now: Date): DiningMenu[] {
  if (!/Marketplace\s+Caf[eé]\s+Menu/i.test(text) || !/Week of\b/i.test(text)) throw new Error('hospital_invalid_menu_document')
  const rows: DiningMenu[] = [], dates = new Set<string>()
  const notices = ['Please let your server know about allergies before ordering.', 'Menu subject to change.']
    .filter(notice => text.includes(notice))
  let current: DiningMenu | null = null
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim()
    const match = line.match(heading)
    if (match) {
      const date = headingDate(match, now)
      if (dates.has(date)) throw new Error('hospital_duplicate_menu_date')
      dates.add(date)
      current = {
        source: 'sbu_hospital', external_id: `market-place-cafe:daily:${date}`,
        location_slug: 'market-place-cafe', location_name: 'The Market Place Café',
        menu_slug: 'daily', menu_name: 'Daily Menu', menu_date: date,
        source_url: `https://docs.google.com/document/d/${documentId}/edit`, items: [], notices,
        last_synced_at: now.toISOString(),
      }
      rows.push(current)
    } else if (current && line) {
      const name = line.match(/^[*•-]\s+(.+)$/)?.[1]?.trim()
      // An unfamiliar layout must not silently write a truncated menu.
      if (!name) throw new Error('hospital_unrecognized_menu_line')
      const labels = [...name.matchAll(/\(([^)]+)\)/g)].flatMap(match => match[1].split(',').map(label => label.trim()))
        .filter(label => /^(vegetarian|vegan|heart healthy|gluten-friendly|dairy free)$/i.test(label))
      current.items.push({ ...emptyMenuItem(name), labels })
    }
  }
  if (!rows.length || rows.some(row => !row.items.length)) throw new Error('hospital_empty_menu_document')
  const orderedDates = [...dates].sort()
  if (Date.parse(orderedDates.at(-1)!) - Date.parse(orderedDates[0]) > 6 * 86_400_000) throw new Error('hospital_invalid_menu_week')
  return rows
}

export async function scrapeHospitalMenus(input: DiningInput, now = new Date(), network: typeof fetch = fetch): Promise<ScrapeResult> {
  const result: ScrapeResult = { rows: [], requestCount: 0, fetchedCount: 0, skippedCount: 0, issues: [] }
  if (input.locations.some(slug => slug !== 'market-place-cafe')) {
    result.issues.push({ code: 'unknown_location' })
    return result
  }
  const signal = AbortSignal.timeout(60_000)
  let documents: string[]
  try {
    result.requestCount++
    documents = discoverHospitalMenus(await fetchMenuText(hospitalLocationsUrl, network, signal, 2 * 1024 * 1024))
  } catch (error) {
    result.issues.push({ code: issueCode(error), resource: 'locations' })
    return result
  }
  const window = menuWindow(input), rowsByDate = new Map<string, DiningMenu>(), conflicts = new Set<string>()
  for (const id of documents) {
    const resource = `https://docs.google.com/document/d/${id}/export?format=txt`
    try {
      result.requestCount++
      const rows = parseHospitalMenu(await fetchMenuText(resource, network, signal, 1024 * 1024), id, now)
      result.fetchedCount += rows.length
      for (const row of rows) {
        if (row.menu_date < window.startsAt || row.menu_date >= window.endsAt) { result.skippedCount++; continue }
        const prior = rowsByDate.get(row.menu_date)
        if (prior && JSON.stringify(prior.items) !== JSON.stringify(row.items)) {
          conflicts.add(row.menu_date)
          result.issues.push({ code: 'hospital_conflicting_menu_documents', resource: row.menu_date })
        } else rowsByDate.set(row.menu_date, row)
      }
    } catch (error) { result.issues.push({ code: issueCode(error), resource }) }
  }
  result.rows = [...rowsByDate.values()].filter(row => !conflicts.has(row.menu_date)).sort((a, b) => a.menu_date.localeCompare(b.menu_date))
  return result
}
