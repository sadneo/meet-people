const sleep = ms => new Promise(done => setTimeout(done, ms))

async function reportedRun(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    const body = (await response.text()).trim()
    let parsed
    try { parsed = JSON.parse(body) } catch { /* Not JSON: fall back to the plain body. */ }
    if (parsed && typeof parsed === 'object') return typeof parsed.run === 'string' ? parsed.run : ''
    return response.ok ? body : ''
  } catch {
    return ''
  }
}

export async function waitForRun(url, runId, { timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const run = await reportedRun(url)
    if (run === runId) return
    if (run) throw new Error(`Another server is answering on ${url}`)
    await sleep(250)
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for run ${runId} on ${url}`)
}
