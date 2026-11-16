import { createServer } from 'node:net'

function bind(port) {
  return new Promise(resolve => {
    const server = createServer()
    server.once('error', () => resolve(null))
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

const close = server => new Promise(resolve => server.close(resolve))

export async function isFree(port) {
  const server = await bind(port)
  if (server) await close(server)
  return Boolean(server)
}

export async function freePorts(count, preferred = []) {
  const servers = []
  try {
    for (const port of new Set(preferred)) {
      if (servers.length === count) break
      const server = await bind(port)
      if (server) servers.push(server)
    }
    while (servers.length < count) {
      const server = await bind(0)
      if (!server) throw new Error('Could not allocate a free local port.')
      servers.push(server)
    }
    return servers.map(server => server.address().port)
  } finally {
    await Promise.all(servers.map(close))
  }
}
