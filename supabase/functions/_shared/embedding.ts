type Configuration = { apiKey?: string; sharedSecret?: string; fetch?: typeof fetch }

export async function embedInterest(request: Request, config: Configuration): Promise<Response> {
  const json = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  if (!config.sharedSecret || !config.apiKey) return json(503, { error: 'embedding_not_configured' })
  if (request.headers.get('x-embed-secret') !== config.sharedSecret) return json(401, { error: 'unauthorized' })
  const raw = await request.text()
  if (raw.length > 16384) return json(413, { error: 'input_too_large' })
  let body: { text?: unknown; interestText?: unknown }
  try { body = JSON.parse(raw) } catch { return json(400, { error: 'invalid_input' }) }
  const text = body?.text ?? body?.interestText
  if (typeof text !== 'string' || !text.trim() || text.length > 10000) return json(400, { error: 'invalid_input' })
  try {
    const response = await (config.fetch ?? fetch)('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text }] }, outputDimensionality: 3072 }),
      signal: AbortSignal.timeout(1800),
    })
    if (!response.ok) return json(502, { error: 'embedding_unavailable' })
    const result = await response.json()
    const embedding: unknown = result?.embedding?.values
    if (!Array.isArray(embedding) || embedding.length !== 3072 || !embedding.every(value => typeof value === 'number' && Number.isFinite(value))) {
      return json(502, { error: 'invalid_embedding' })
    }
    return json(200, { embedding })
  } catch {
    return json(502, { error: 'embedding_unavailable' })
  }
}
