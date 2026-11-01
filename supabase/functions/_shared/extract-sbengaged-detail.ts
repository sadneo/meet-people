function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function validUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const text = decodeHtml(value.trim())
    const url = text.startsWith('/') ? new URL(text, 'https://sbengaged.stonybrook.edu') : new URL(text)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

function imageValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const image of value) { const valid = imageValue(image); if (valid) return valid }
    return null
  }
  if (value && typeof value === 'object') {
    const image = value as Record<string, unknown>
    return validUrl(image.url) ?? validUrl(image.contentUrl)
  }
  return validUrl(value)
}

function structuredImage(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const node of value) { const image = structuredImage(node); if (image) return image }
    return null
  }
  if (!value || typeof value !== 'object') return null
  const node = value as Record<string, unknown>, types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  const image = !node['@type'] || types.some(type => typeof type === 'string' && /Event$/.test(type)) ? imageValue(node.image) : null
  return image ?? structuredImage(node['@graph']) ?? structuredImage(node.mainEntity)
}

function attributes(tag: string) {
  const result: Record<string, string> = {}
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) result[match[1].toLowerCase()] = decodeHtml(match[3])
  return result
}

export function extractSbEngagedDetailImage(html: string) {
  const jsonLd = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(jsonLd)) {
    try {
      const valid = structuredImage(JSON.parse(match[1]))
      if (valid) return valid
    } catch {
      // Try the next JSON-LD block or Open Graph fallback.
    }
  }

  const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]))
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
    for (const tag of metadata) {
      if ((tag.property ?? tag.name)?.toLowerCase() === key) { const valid = validUrl(tag.content); if (valid) return valid }
    }
  }
  // CampusGroups identifies the actual event banner in its alternative text.
  // Never substitute the first image, navigation icon or campus logo.
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = attributes(match[0])
    if (/\bbanner for\b/i.test(tag.alt ?? '')) { const valid = validUrl(tag.src); if (valid) return valid }
  }
  return null
}
