import DOMPurify from 'dompurify'
import type { Asset, AssetSource, Color } from '../model/types'

// Turns arbitrary SVG (icon packs, user uploads, pasted markup, files from disk) into a
// sanitized, normalized asset that can be inlined into the canvas and recolored:
// - scripts, event handlers, foreignObject and external references are removed;
// - <style> rules and style="" declarations become presentation attributes;
// - every color is written as lowercase #rrggbb, so recoloring is a plain string replace;
// - the root keeps only a viewBox, so it can be placed at any size.

const PRESENTATION = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'stop-color',
  'stop-opacity', 'clip-rule', 'display', 'visibility', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-anchor', 'letter-spacing', 'flood-color', 'flood-opacity', 'mix-blend-mode'
])
const COLOR_ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color']
const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line,text,tspan,use'

let hooked = false
function sanitize(markup: string): string {
  if (!hooked) {
    hooked = true
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
      if (data.attrName === 'href' || data.attrName === 'xlink:href') {
        const v = data.attrValue.trim()
        const internal = v.startsWith('#')
        const embedded = node.nodeName.toLowerCase() === 'image' && /^data:image\/(png|jpe?g|gif|webp);/i.test(v)
        if (!internal && !embedded) data.keepAttr = false
      }
      // Drop url() references to anything but in-document ids.
      if (/url\(/i.test(data.attrValue) && !/url\(\s*['"]?#/i.test(data.attrValue)) data.keepAttr = false
    })
  }
  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    NAMESPACE: 'http://www.w3.org/2000/svg'
  }) as string
}

let colorCtx: CanvasRenderingContext2D | null = null
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (!v || v === 'none' || v === 'transparent' || v.startsWith('url(') || v === 'inherit' || v === 'currentcolor') return null
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
  colorCtx ??= document.createElement('canvas').getContext('2d')
  if (!colorCtx) return null
  colorCtx.fillStyle = '#010203'
  colorCtx.fillStyle = v
  const out = String(colorCtx.fillStyle)
  if (out === '#010203' && v !== '#010203') return null
  if (out.startsWith('#')) return out
  const m = out.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  return m ? '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('') : null
}

function parseDecls(css: string): [string, string][] {
  return css
    .split(';')
    .map((d) => d.split(':'))
    .filter((p) => p.length >= 2)
    .map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').trim().replace(/\s*!important$/, '')])
}

/** Small, fast, non-cryptographic hash used for content-addressed asset ids. */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

const num = (v: string | null): number | null => {
  if (!v) return null
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export class SvgError extends Error {}

export function processSvg(markup: string, name: string, source?: AssetSource): Asset {
  const clean = sanitize(markup)
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new SvgError(`${name} is not a valid SVG file`)
  }

  // 1. Stylesheets -> attributes (rule order respected; inline styles win afterwards).
  for (const style of Array.from(root.querySelectorAll('style'))) {
    const css = (style.textContent ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = m[1].trim()
      if (selector.startsWith('@')) continue
      let targets: Element[] = []
      try {
        targets = Array.from(root.querySelectorAll(selector))
      } catch {
        continue
      }
      for (const [k, v] of parseDecls(m[2])) {
        if (PRESENTATION.has(k)) for (const t of targets) t.setAttribute(k, v)
      }
    }
    style.remove()
  }
  for (const el of Array.from(root.querySelectorAll('[style]')).concat(root.hasAttribute('style') ? [root] : [])) {
    const rest: string[] = []
    for (const [k, v] of parseDecls(el.getAttribute('style') ?? '')) {
      if (PRESENTATION.has(k)) el.setAttribute(k, v)
      else rest.push(`${k}:${v}`)
    }
    if (rest.length) el.setAttribute('style', rest.join(';'))
    else el.removeAttribute('style')
  }
  for (const el of Array.from(root.querySelectorAll('[class]'))) el.removeAttribute('class')
  root.querySelectorAll('metadata,title,desc').forEach((e) => e.remove())

  // 2. Colors.
  const palette = new Set<string>()
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const a of COLOR_ATTRS) {
      const v = el.getAttribute(a)
      if (v == null) continue
      const c = normalizeColor(v)
      if (c) {
        el.setAttribute(a, c)
        if (!el.closest('mask,clipPath')) palette.add(c)
      } else if (v.trim().toLowerCase() === 'currentcolor') {
        el.setAttribute(a, '#000000')
        palette.add('#000000')
      }
    }
  }
  // Shapes that inherit the default black fill.
  const implicitBlack = Array.from(root.querySelectorAll(SHAPES)).some((el) => {
    if (el.closest('defs,mask,clipPath')) return false
    for (let n: Element | null = el; n; n = n.parentElement) if (n.hasAttribute('fill')) return false
    return true
  })
  if (implicitBlack) {
    root.setAttribute('fill', '#000000')
    palette.add('#000000')
  }

  // 3. Geometry: keep a viewBox, drop fixed size.
  let vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = num(root.getAttribute('width')) ?? 100
    const h = num(root.getAttribute('height')) ?? 100
    vb = [0, 0, w, h]
  }
  root.setAttribute('viewBox', vb.join(' '))
  for (const a of ['width', 'height', 'x', 'y', 'preserveAspectRatio', 'id']) root.removeAttribute(a)

  const data = new XMLSerializer().serializeToString(root)
  return {
    id: 'svg-' + hashString(data),
    kind: 'svg',
    name,
    data,
    width: vb[2],
    height: vb[3],
    palette: [...palette],
    source
  }
}

/** Re-sanitize an asset that came from a file on disk (files are untrusted input). */
export function resanitizeAsset(a: Asset): Asset {
  if (a.kind === 'svg') return { ...a, data: sanitize(a.data) }
  if (!/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(a.data)) {
    throw new SvgError(`Asset ${a.name} has an unsupported image encoding`)
  }
  return a
}

export async function rasterAsset(bytes: Uint8Array, name: string, mime: string, source?: AssetSource): Promise<Asset> {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const data = `data:${mime};base64,${btoa(bin)}`
  const img = new Image()
  img.src = data
  await img.decode()
  return { id: 'img-' + hashString(data), kind: 'raster', name, data, width: img.naturalWidth, height: img.naturalHeight, source }
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Markup for one placed instance of an SVG asset: positioned/sized via x/y/width/height on the
 * root, colors swapped per `recolor`, and ids prefixed so several instances never collide.
 */
export function instanceMarkup(
  asset: Asset,
  box: { x: number; y: number; w: number; h: number },
  recolor: Record<string, Color>,
  prefix: string
): string {
  let s = asset.data
  const swaps = Object.entries(recolor).filter(([from, to]) => from !== to)
  if (swaps.length) {
    // One pass, so swapping A->B and B->A at the same time works.
    const map = new Map(swaps.map(([from, to]) => [from.toLowerCase(), to]))
    s = s.replace(new RegExp(swaps.map(([from]) => escRe(from)).join('|'), 'gi'), (m) => map.get(m.toLowerCase()) ?? m)
  }
  if (/\bid="/.test(s)) {
    s = s
      .replace(/\bid="([^"]+)"/g, `id="${prefix}-$1"`)
      .replace(/url\(\s*(['"]?)#([^'")]+)\1\s*\)/g, `url(#${prefix}-$2)`)
      .replace(/(\bhref|xlink:href)="#([^"]+)"/g, `$1="#${prefix}-$2"`)
  }
  return s.replace(
    /^<svg\b/,
    `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="none" overflow="visible"`
  )
}
