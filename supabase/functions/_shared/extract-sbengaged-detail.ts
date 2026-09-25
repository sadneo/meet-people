function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function validUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

export function extractSbEngagedDetailImage(html: string) {
  const jsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(jsonLd)) {
    try {
      const parsed = JSON.parse(match[1]) as { image?: unknown }
      const image = Array.isArray(parsed.image) ? parsed.image[0] : parsed.image
      const valid = validUrl(image)
      if (valid) return valid
    } catch {
      // Try the next JSON-LD block or Open Graph fallback.
    }
  }

  const openGraph = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html)
  return openGraph ? validUrl(decodeHtml(openGraph[1])) : null
}
