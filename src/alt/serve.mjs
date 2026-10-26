// Zero-dependency static server for the alternate (Pebble starter) frontend.
// Usage: node src/alt/serve.mjs [--port 5174] [--host 0.0.0.0] [--open]
// Env:   PORT, HOST
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const ROOT = fileURLToPath(new URL('./app/', import.meta.url))
const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const port = Number(arg('port') ?? process.env.PORT ?? 5174)
const host = arg('host') ?? process.env.HOST ?? 'localhost'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '')
    if (rel === '' || rel.endsWith(sep)) rel = join(rel, 'index.html')
    const file = join(ROOT, rel)
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden')
      return
    }
    if (!(await stat(file)).isFile()) throw new Error('not a file')
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', // always fresh while developing
    })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
}).listen(port, host, () => {
  const url = `http://${host}:${port}/`
  console.log(`\n  Pebble alt frontend → ${url}\n  Serving ${ROOT}\n`)
  if (args.includes('--open')) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'
    exec(`${cmd} ${url}`)
  }
}).on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is in use. Try: pnpm dev:alt --port ${port + 1}` : err)
  process.exit(1)
})
