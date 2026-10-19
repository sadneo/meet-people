// In-page audit helpers for the MOBILE pass. Run with page.evaluate(auditPage).
export function auditPage() {
  const vw = window.innerWidth, vh = window.innerHeight
  const out = { vw, vh }
  const doc = document.documentElement
  out.scrollWidth = doc.scrollWidth
  out.overflow = doc.scrollWidth > vw
  const desc = el => {
    if (!el || !el.tagName) return String(el)
    let s = el.tagName.toLowerCase()
    if (el.id) s += '#' + el.id
    const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal
    if (cls) s += '.' + cls.trim().split(/\s+/).slice(0, 3).join('.')
    return s
  }
  const visible = el => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false
    }
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const clippedByAncestor = el => {
    for (let n = el.parentElement; n && n !== document.body && n !== doc; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.overflowX !== 'visible' || s.clipPath !== 'none' || s.contain.includes('paint')) return desc(n)
    }
    return null
  }
  const name = el => {
    const al = el.getAttribute('aria-label'); if (al) return al
    const lb = el.getAttribute('aria-labelledby'); if (lb) return lb.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() ?? '').join(' ')
    if (el.labels && el.labels.length) return [...el.labels].map(l => l.textContent.trim()).join(' ')
    const t = (el.innerText || el.textContent || '').trim(); if (t) return t.slice(0, 50)
    const img = el.querySelector?.('img[alt]'); if (img?.alt) return img.alt
    if (el.title) return '(title only) ' + el.title
    if (el.placeholder) return '(placeholder only) ' + el.placeholder
    return ''
  }
  // Horizontal overflow offenders (not clipped by a scrolling/clipping ancestor)
  out.overRight = []
  out.clippedOver = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !(r.right > vw + 1 || r.left < -1)) continue
    if (!visible(el)) continue
    const clip = clippedByAncestor(el)
    const item = { el: desc(el), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 40), clip }
    if (clip) out.clippedOver.push(item); else out.overRight.push(item)
  }
  out.overRight = out.overRight.slice(0, 15)
  out.clippedOver = out.clippedOver.slice(0, 15)
  // Interactive elements
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=radio], [role=gridcell][tabindex], [tabindex]:not([tabindex="-1"])'
  const inter = [...document.querySelectorAll(sel)].filter(visible)
  out.small = []
  out.unnamed = []
  for (const el of inter) {
    if (el.closest('.pt-dev-panel')) continue
    const det = el.closest('details:not([open])'); if (det && !el.closest('summary')) continue
    let r = el.getBoundingClientRect()
    // visually hidden inputs: measure the wrapping label instead
    if ((el.type === 'checkbox' || el.type === 'radio') && (r.width < 2 || r.height < 2)) { const lab = el.closest('label') || el.labels?.[0]; if (lab) r = lab.getBoundingClientRect() }
    const n = name(el)
    if (!n) out.unnamed.push({ el: desc(el), html: el.outerHTML.slice(0, 160) })
    const inlineText = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && /^(P|LI|SPAN|SMALL)$/.test(el.parentElement.tagName)
    if ((r.width < 44 || r.height < 44)) out.small.push({ el: desc(el), name: n.slice(0, 40), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top + window.scrollY), inlineText })
  }
  // Bottom nav overlap: scroll to bottom, find content covered by fixed elements
  const nav = document.querySelector('.pt-bottom-nav')
  out.nav = null
  if (nav && visible(nav)) {
    const nr = nav.getBoundingClientRect()
    out.nav = { top: Math.round(nr.top), height: Math.round(nr.height) }
  }
  return out
}

// Scroll window + all scroll containers to the bottom, then check whether interactive or text elements are covered.
export function coveredAtBottom() {
  window.scrollTo(0, document.documentElement.scrollHeight)
  for (const el of document.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2) el.scrollTop = el.scrollHeight
  }
  const vh = window.innerHeight, vw = window.innerWidth
  const desc = el => { let s = el.tagName.toLowerCase(); const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal; if (cls) s += '.' + cls.trim().split(/\s+/).slice(0, 2).join('.'); return s }
  const main = document.querySelector('main') || document.body
  const covered = []
  const unreachable = []
  const candidates = [...main.querySelectorAll('a[href], button, input, select, textarea, summary, h1, h2, h3, p, label, li, small, strong, time')]
  for (const el of candidates) {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (el.closest('[hidden]')) continue
    const det = el.closest('details:not([open])'); if (det && !el.closest('summary')) continue
    // only consider the last element row: those whose bottom is near or past the viewport bottom
    if (r.bottom > vh + 1) { unreachable.push({ el: desc(el), top: Math.round(r.top), bottom: Math.round(r.bottom), text: (el.textContent || '').trim().slice(0, 40) }); continue }
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + r.width / 2, r.bottom - 2]]
    for (const [x, y] of pts) {
      if (x < 0 || x >= vw || y < 0 || y >= vh) continue
      const top = document.elementFromPoint(x, y)
      if (top && top !== el && !el.contains(top) && !top.contains(el)) {
        const fixed = (() => { for (let n = top; n; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return desc(n) } return null })()
        if (fixed) { covered.push({ el: desc(el), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40), by: fixed, top: Math.round(r.top), bottom: Math.round(r.bottom) }); break }
      }
    }
  }
  return { covered: covered.slice(0, 12), unreachable: unreachable.slice(0, 12) }
}

// Text contrast against the nearest solid background (skips text over images/gradients).
export function contrastAudit() {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 } }
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
  const desc = el => { let s = el.tagName.toLowerCase(); const cls = typeof el.className === 'string' ? el.className : el.className?.baseVal; if (cls) s += '.' + cls.trim().split(/\s+/).slice(0, 2).join('.'); return s }
  const results = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const seen = new Set()
  while (walker.nextNode()) {
    const t = walker.currentNode
    if (!t.textContent.trim()) continue
    const el = t.parentElement
    if (!el || seen.has(el)) continue
    seen.add(el)
    if (el.closest('.pt-dev-panel, script, style, noscript, .pt-sr-only, [hidden]')) continue
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    // sr-only check
    if (s.position === 'absolute' && r.width <= 1) continue
    if (s.clip && s.clip !== 'auto' && s.clip.includes('0px, 0px, 0px, 0px')) continue
    let fg = parse(s.color); if (!fg) continue
    let opacity = 1
    let bg = null, unknown = null
    const layers = []
    for (let n = el; n; n = n.parentElement) {
      const ns = getComputedStyle(n)
      opacity *= Number(ns.opacity)
      if (ns.backgroundImage && ns.backgroundImage !== 'none') { unknown = 'bg-image on ' + desc(n); break }
      const c = parse(ns.backgroundColor)
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) { bg = c; break } }
    }
    if (unknown) continue
    if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 }
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i] !== bg) bg = blend(layers[i], bg)
    if (layers.length && layers[layers.length - 1] !== bg && layers[layers.length - 1].a >= 1) bg = layers[layers.length - 1]
    fg = { ...fg, a: fg.a * opacity }
    const fgc = blend(fg, bg)
    const L1 = lum(fgc), L2 = lum(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const size = parseFloat(s.fontSize), weight = Number(s.fontWeight) || 400
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const need = large ? 3 : 4.5
    if (ratio < need) {
      // skip disabled controls (exempt)
      const disabled = el.closest('button:disabled, [aria-disabled=true], input:disabled')
      results.push({ el: desc(el), text: t.textContent.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100, need, color: s.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, size, weight, disabled: !!disabled })
    }
  }
  return results.slice(0, 25)
}
