import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Snapshot } from '../model/doc'
import type { Asset } from '../model/types'
import { SceneContent } from '../render/Figure'

export interface Credit {
  library: string
  license: string
  author?: string
  names: string[]
  url?: string
}

/** Third-party assets used in the figure, grouped by library, author and licence. */
export function creditsFor(snap: Snapshot): Credit[] {
  const used = new Set<string>()
  for (const o of snap.objects.values()) {
    if (o.type === 'icon') used.add(o.assetId)
    if (o.type === 'brush' && o.assetId) used.add(o.assetId)
  }
  const groups = new Map<string, Credit>()
  for (const id of used) {
    const a: Asset | undefined = snap.assets.get(id)
    if (!a?.source) continue
    const key = `${a.source.library}|${a.source.author ?? ''}|${a.source.license}`
    const g = groups.get(key) ?? { library: a.source.library, license: a.source.license, author: a.source.author, names: [], url: a.source.url }
    if (!g.names.includes(a.name)) g.names.push(a.name)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => a.library.localeCompare(b.library))
}

const PUBLIC_DOMAIN = /^(cc-?0|cc0|public domain|pd|pdm)/i

/** A ready-to-paste credit line for a figure legend. */
export function creditText(credits: Credit[]): string {
  const needed = credits.filter((c) => !PUBLIC_DOMAIN.test(c.license))
  if (!credits.length) return ''
  const parts = (needed.length ? needed : credits).map((c) => {
    const who = c.author ? ` by ${c.author}` : ''
    return `${c.names.join(', ')}${who} (${c.library}, ${licenseLabel(c.license)})`
  })
  const lead = needed.length ? 'Icons adapted from: ' : 'Icons (public domain / CC0, no attribution required): '
  const sa = credits.some((c) => /-sa\b|by-sa/i.test(c.license))
    ? ' This figure includes share-alike (CC BY-SA) material and must be shared under CC BY-SA.'
    : ''
  return lead + parts.join('; ') + '.' + sa
}

export function licenseLabel(l: string): string {
  const m: Record<string, string> = {
    'cc-0': 'CC0', cc0: 'CC0', 'cc-by-3.0': 'CC BY 3.0', 'cc-by-4.0': 'CC BY 4.0', 'cc-by-sa-3.0': 'CC BY-SA 3.0',
    'cc-by-sa-4.0': 'CC BY-SA 4.0', mit: 'MIT', bsd: 'BSD'
  }
  return m[l.toLowerCase()] ?? l
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface SvgOptions {
  transparent?: boolean
}

export function figureSvg(snap: Snapshot, opts: SvgOptions = {}): string {
  const { width: W, height: H, background } = snap.meta
  const bg = !opts.transparent && background !== 'none' ? createElement('rect', { width: W, height: H, fill: background }) : null
  const body = renderToStaticMarkup(createElement(Fragment, null, bg, createElement(SceneContent, { snap, mode: 'export' })))
  const credits = creditText(creditsFor(snap))
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<desc>Created with Pucklet (open source).${credits ? ' ' + escXml(credits) : ''}</desc>` +
    body +
    `</svg>\n`
  )
}

// ---------------------------------------------------------------------------------------
// PNG

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Writes a pHYs chunk so the PNG reports its real DPI (journals and Word read this). */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const v = new DataView(chunk.buffer)
  v.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  v.setUint32(8, ppm)
  v.setUint32(12, ppm)
  chunk[16] = 1 // unit: metre
  v.setUint32(17, crc32(chunk.subarray(4, 17)))
  // Signature (8) + IHDR chunk (4 + 4 + 13 + 4 = 25): insert right after IHDR.
  const at = 33
  const out = new Uint8Array(png.length + chunk.length)
  out.set(png.subarray(0, at), 0)
  out.set(chunk, at)
  out.set(png.subarray(at), at + chunk.length)
  return out
}

/** Chromium refuses canvases beyond roughly this many pixels. */
export const MAX_PIXELS = 16384 * 16384 * 0.9
export const MAX_SIDE = 16384

export async function svgToPng(svg: string, width: number, height: number, scale: number, dpi: number): Promise<Uint8Array> {
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) {
    throw new Error(`That would be ${w} × ${h} px, larger than this app can render. Lower the resolution.`)
  }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) throw new Error('PNG encoding failed')
    return setPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi)
  } finally {
    URL.revokeObjectURL(url)
  }
}
