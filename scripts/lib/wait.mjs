import { setTimeout as sleep } from 'node:timers/promises'

async function reportedRun(url, signal) {
  try {
    const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(2000), ...(signal ? [signal] : [])]) })
    const body = (await response.text()).trim()
    let parsed
    try { parsed = JSON.parse(body) } catch { /* Not JSON: fall back to the plain body. */ }
    if (parsed && typeof parsed === 'object') return typeof parsed.run === 'string' ? parsed.run : ''
    return response.ok ? body : ''
  } catch {
    return ''
  }
}

export async function waitForRun(url, runId, { timeoutMs = 60000, signal } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    const run = await reportedRun(url, signal)
    if (run === runId) return
    if (run) throw new Error(`Another server is answering on ${url}`)
    await sleep(250, undefined, { signal })
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for run ${runId} on ${url}`)
}
