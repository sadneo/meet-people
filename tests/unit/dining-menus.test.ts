// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import locationsFixture from '../fixtures/dining/nutrislice-locations.json'
import weekFixture from '../fixtures/dining/nutrislice-week.json'
import { addMenuDays, fetchMenuText, localMenuDate, parseDiningInput } from '../../supabase/functions/_shared/dining-menus.ts'
import { normalizeNutrisliceWeek, parseNutrisliceLocations, scrapeNutrisliceMenus } from '../../supabase/functions/_shared/nutrislice-menus.ts'
import { discoverHospitalMenus, parseHospitalMenu, scrapeHospitalMenus } from '../../supabase/functions/_shared/hospital-menus.ts'

const now = new Date('2026-11-03T15:00:00Z')
const hospitalText = readFileSync(new URL('../fixtures/dining/hospital-menu.txt', import.meta.url), 'utf8')
const input = (value = {}) => parseDiningInput(value, now)!
const location = parseNutrisliceLocations(locationsFixture)[0]
const hospitalPage = '<h3>Weekly Menu</h3><ul><li><a href="https://docs.google.com/document/d/current-menu/edit?tab=t.0">November 2 - November 6</a></li></ul><h2>Starbucks</h2>'

describe('dining dates and input', () => {
  it('defaults to a read-only smoke run using New York dates, including DST', () => {
    expect(input()).toEqual({ mode: 'smoke', dryRun: true, startDate: '2026-11-03', locations: [] })
    expect(localMenuDate(new Date('2026-11-03T03:00:00Z'))).toBe('2026-11-02')
    expect(localMenuDate(new Date('2026-07-03T03:00:00Z'))).toBe('2026-07-02')
    expect(addMenuDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it.each([null, [], 7, { mode: 'all' }, { dryRun: 'false' }, { startDate: '2026-02-30' },
    { startDate: '../2026' }, { locations: ['../../elsewhere'] }, { locations: 'east-side-dining' }])('rejects malformed input %j', value => {
    expect(parseDiningInput(value, now)).toBeNull()
  })
})

describe('Nutrislice menus', () => {
  it('normalizes real response fields, preserving stations, zero nutrients, serving sizes, and labels', () => {
    const rows = normalizeNutrisliceWeek(weekFixture, location, location.menus[0], now)
    expect(rows).toHaveLength(7)
    expect(rows[2]).toMatchObject({ source: 'nutrislice_sbu', menu_date: '2026-11-03', location_name: 'East Side Dine-In',
      external_id: 'east-side-dining:todays-dine-in-specials-esd:2026-11-03', items: [{
        name: 'Scrambled Eggs with Cream and Butter', station: 'Hot Breakfast Buffet',
        nutrition: { calories: 170, g_sugar: 0 }, serving_size: { amount: '0.5', unit: 'cups' }, labels: ['Milk', 'Egg', 'Vegetarian'],
      }, { name: 'Scrambled Egg Whites' }] })
    const refreshed = normalizeNutrisliceWeek(weekFixture, location, location.menus[0], new Date('2026-11-04T15:00Z'))
    expect(refreshed[2].external_id).toBe(rows[2].external_id)
    expect(refreshed[2].last_synced_at).not.toBe(rows[2].last_synced_at)
  })
  it('preserves explicitly empty days and rejects malformed or unpublished days', () => {
    const week = { days: [{ date: '2026-11-03', menu_items: [] }] }
    expect(normalizeNutrisliceWeek(week, location, location.menus[0], now)[0].items).toEqual([])
    expect(() => normalizeNutrisliceWeek({}, location, location.menus[0], now)).toThrow('nutrislice_invalid_week')
    expect(() => normalizeNutrisliceWeek({ days: [{ ...week.days[0], has_unpublished_menus: true }] }, location, location.menus[0], now)).toThrow('nutrislice_unpublished_menu')
    expect(() => parseNutrisliceLocations([{ ...locationsFixture[0], slug: '../../attack' }])).toThrow()
  })
  it('keeps text-only notices and changes stations without treating headings as dishes', () => {
    const food = weekFixture.days[0].menu_items[1]
    const rows = normalizeNutrisliceWeek({ days: [{ date: '2026-11-03', menu_items: [
      { is_section_title: true, text: 'Lunch' }, food, { text: 'Menu subject to change' },
      { is_section_title: true, text: 'Dinner' }, food,
    ] }] }, location, location.menus[0], now)
    expect(rows[0].items.map(item => item.station)).toEqual(['Lunch', 'Dinner'])
    expect(rows[0].notices).toEqual(['Menu subject to change'])
  })
  it('fetches each menu once per calendar week and filters to the requested dates', async () => {
    const network = vi.fn(async (url: string | URL | Request) => Response.json(String(url).includes('/schools/') ? locationsFixture : weekFixture))
    const result = await scrapeNutrisliceMenus(input(), now, network as typeof fetch)
    expect(result.requestCount).toBe(2)
    expect(result.rows).toHaveLength(1)
    expect(result.rows.every(row => row.menu_date === '2026-11-03')).toBe(true)
    expect(result.issues).toEqual([])
    expect(network.mock.calls[1][0]).toContain('/2026/11/1/')
  })
  it('reports missing days and unknown locations; upstream failures do not become empty snapshots', async () => {
    const network = vi.fn(async (url: string | URL | Request) => Response.json(String(url).includes('/schools/') ? locationsFixture : { days: [] }))
    const missing = await scrapeNutrisliceMenus(input(), now, network as typeof fetch)
    expect(missing.rows).toEqual([])
    expect(missing.issues).toHaveLength(1)
    expect(missing.issues[0].code).toBe('nutrislice_missing_day')
    const unknown = await scrapeNutrisliceMenus(input({ locations: ['missing'] }), now, network as typeof fetch)
    expect(unknown.requestCount).toBe(1)
    expect(unknown.issues).toEqual([{ code: 'unknown_location', resource: 'missing' }])
    const failed = await scrapeNutrisliceMenus(input(), now, vi.fn().mockResolvedValue(new Response('', { status: 429 })))
    expect(failed.rows).toEqual([])
    expect(failed.issues[0].code).toBe('upstream_http_429')
  })
  it('fetches two weeks when a seven-day window crosses Sunday', async () => {
    const network = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/schools/')) return Response.json(locationsFixture)
      const week = structuredClone(weekFixture)
      if (String(url).includes('/2026/11/8/')) week.days.forEach(day => { day.date = addMenuDays(day.date, 7) })
      return Response.json(week)
    })
    const result = await scrapeNutrisliceMenus(input({ mode: 'full' }), now, network as typeof fetch)
    expect(result.requestCount).toBe(7)
    expect(result.rows).toHaveLength(21)
    expect(result.issues).toEqual([])
    expect(result.rows.every(row => row.menu_date >= '2026-11-03' && row.menu_date < '2026-11-10')).toBe(true)
  })
})

describe('hospital menus', () => {
  it('discovers changing Google Docs links only within the weekly menu section', () => {
    const page = hospitalPage.replace('</ul>', `<li><a href="https://docs.google.com.evil.test/document/d/attack/edit">Fake</a></li>
      <a href="https://docs.google.com/document/d/current-menu/edit">Duplicate</a>
      <a href="https://user@docs.google.com/document/d/attack/edit">Credentials</a></ul>`)
      + '<a href="https://docs.google.com/document/d/unrelated/edit">Unrelated footer</a>'
    expect(discoverHospitalMenus(page)).toEqual(['current-menu'])
    expect(() => discoverHospitalMenus('<h3>Weekly Menu</h3><a href="menu.pdf">PDF</a>')).toThrow('hospital_menu_documents_missing_or_unsupported')
  })
  it('parses all five days of a real menu without inventing nutrition or station names', () => {
    const rows = parseHospitalMenu(hospitalText, 'current-menu', now)
    expect(rows).toHaveLength(5)
    expect(rows.map(row => row.items.length)).toEqual([15, 15, 15, 15, 15])
    expect(rows[0]).toMatchObject({ menu_date: '2026-11-02', external_id: 'market-place-cafe:daily:2026-11-02' })
    expect(rows[0].items.slice(0, 2)).toMatchObject([
      { name: 'Chicken Milanese', nutrition: null, station: null }, { name: 'Crusted Cod (Heart Healthy)', labels: ['Heart Healthy'] },
    ])
    expect(rows[0].notices).toHaveLength(2)
    expect(parseHospitalMenu(hospitalText, 'replacement-document', now)[0].external_id).toBe(rows[0].external_id)
  })
  it('validates inferred years, weekday agreement, stale dates, layout changes, and year rollover', () => {
    expect(() => parseHospitalMenu(hospitalText, 'menu', new Date('2027-11-03T15:00Z'))).toThrow('hospital_ambiguous_menu_date')
    expect(() => parseHospitalMenu(hospitalText, 'menu', new Date('2026-05-03T15:00Z'))).toThrow('hospital_ambiguous_menu_date')
    expect(() => parseHospitalMenu(hospitalText.replace('* Chicken Milanese', 'unrecognized layout'), 'menu', now)).toThrow('hospital_unrecognized_menu_line')
    const rollover = 'Marketplace Café Menu\nWeek of December 28 - January 1\nThursday, December 31\n* Soup\nFriday, January 1\n* Pasta'
    expect(parseHospitalMenu(rollover, 'menu', new Date('2027-01-01T15:00Z')).map(row => row.menu_date)).toEqual(['2026-12-31', '2027-01-01'])
  })
  it('exports the current linked document as text, and returns only dates in the requested window', async () => {
    const network = vi.fn(async (url: string | URL | Request) => new Response(String(url).includes('export?') ? hospitalText : hospitalPage))
    const result = await scrapeHospitalMenus(input(), now, network as typeof fetch)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].menu_date).toBe('2026-11-03')
    expect(result.issues).toEqual([])
    expect(network.mock.calls[1][0]).toBe('https://docs.google.com/document/d/current-menu/export?format=txt')
  })
  it('keeps successful documents and reports failures independently', async () => {
    const page = hospitalPage.replace('</ul>', '<a href="https://docs.google.com/document/d/broken/edit">Other week</a></ul>')
    const network = vi.fn(async (url: string | URL | Request) => String(url).includes('/broken/')
      ? new Response('', { status: 403 }) : new Response(String(url).includes('export?') ? hospitalText : page))
    const result = await scrapeHospitalMenus(input(), now, network as typeof fetch)
    expect(result.rows).toHaveLength(1)
    expect(result.issues[0].code).toBe('upstream_http_403')
  })
  it('refuses conflicting menus for the same day', async () => {
    const page = hospitalPage.replace('</ul>', '<a href="https://docs.google.com/document/d/other/edit">Other</a></ul>')
    const network = vi.fn(async (url: string | URL | Request) => new Response(String(url).includes('/other/')
      ? hospitalText.replace('Coconut Honey Mustard Chicken', 'Changed dish') : String(url).includes('export?') ? hospitalText : page))
    const result = await scrapeHospitalMenus(input(), now, network as typeof fetch)
    expect(result.rows).toEqual([])
    expect(result.issues[0].code).toBe('hospital_conflicting_menu_documents')
  })
})

it('rejects oversized streamed responses without Content-Length', async () => {
  const network = vi.fn().mockResolvedValue(new Response('123456'))
  await expect(fetchMenuText('https://example.test', network, new AbortController().signal, 5)).rejects.toThrow('upstream_response_too_large')
})
