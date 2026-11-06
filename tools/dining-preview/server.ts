import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { localMenuDate, parseDiningInput, type ScrapeResult } from '../../supabase/functions/_shared/dining-menus.ts'
import { scrapeHospitalMenus } from '../../supabase/functions/_shared/hospital-menus.ts'
import { scrapeNutrisliceMenus } from '../../supabase/functions/_shared/nutrislice-menus.ts'

const { values } = parseArgs({ options: { port: { type: 'string', default: '5175' } } })
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port')
const cacheDirectory = new URL('./.cache/', import.meta.url)
type Dataset = ScrapeResult & { status: string; capturedAt: string | null }
const datasets: Record<string, Dataset> = {}
for (const source of ['nutrislice', 'hospital']) {
  try {
    const saved = JSON.parse(await readFile(new URL(`${source}.json`, cacheDirectory), 'utf8')) as Dataset
    if (Array.isArray(saved.rows) && Array.isArray(saved.issues)) datasets[source] = saved
  } catch { /* First launch starts with no cached data. */ }
}

let refreshing: Promise<void> | null = null
function refreshMenus() {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const now = new Date(), input = parseDiningInput({ mode: 'full' }, now)!
    await mkdir(cacheDirectory, { recursive: true })
    await Promise.all([
      ['nutrislice', scrapeNutrisliceMenus] as const,
      ['hospital', scrapeHospitalMenus] as const,
    ].map(async ([source, scrape]) => {
      try {
        const result = await scrape(input, now)
        // Keep the last good snapshot available when a new fetch fails entirely.
        if (!result.rows.length && result.issues.length && datasets[source]?.rows.length) {
          datasets[source] = { ...datasets[source], status: 'failed', issues: result.issues }
        } else {
          datasets[source] = { ...result, status: result.issues.length ? (result.rows.length ? 'partial' : 'failed') : 'ok', capturedAt: now.toISOString() }
        }
        await writeFile(new URL(`${source}.json`, cacheDirectory), JSON.stringify(datasets[source]))
      } catch {
        datasets[source] = { ...(datasets[source] ?? { rows: [], requestCount: 0, fetchedCount: 0, skippedCount: 0, capturedAt: null }),
          status: 'failed', issues: [{ code: 'preview_refresh_failed' }] }
      }
    }))
  })().finally(() => { refreshing = null })
  return refreshing
}

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
])
const payload = () => JSON.stringify({ today: localMenuDate(new Date()), refreshing: refreshing !== null, datasets })
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; frame-ancestors 'none'")
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  try {
    if (pathname === '/api/menus' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(payload())
    } else if (pathname === '/api/refresh' && request.method === 'POST') {
      const origin = request.headers.origin
      if (origin && origin !== `http://${request.headers.host}`) {
        response.writeHead(403).end('Origin not allowed')
        return
      }
      await refreshMenus()
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(payload())
    } else if (request.method === 'GET' && assets.has(pathname)) {
      const [file, contentType] = assets.get(pathname)!
      response.writeHead(200, { 'Content-Type': contentType }).end(await readFile(new URL(file, import.meta.url)))
    } else response.writeHead(404).end('Not found')
  } catch {
    response.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Could not load menus. Try again.' }))
  }
})
server.requestTimeout = 120_000
server.listen(port, '127.0.0.1', () => console.log(`Dining menu test viewer: http://127.0.0.1:${port}/`))
server.on('error', error => { console.error(error.message); process.exitCode = 1 })
