// Extra helpers for the icon-pack builders added after packs.mjs: a polite cached downloader
// and an SVG gate that rejects files the app can't use as recolourable vector icons.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { optimize } from 'svgo'
import { CACHE, fetchRetry, optimizeSvg } from './packs.mjs'

export const UA = 'Pucklet icon pack builder (https://github.com/BrentKey/Pucklet)'
export const HEADERS = { 'User-Agent': UA }
export const MAX_BYTES = 400_000

/** GETs a URL (with retries and our User-Agent), caching the body under .cache/<rel>. */
export async function cachedGet(url, rel, init = {}) {
  const path = join(CACHE, rel)
  if (existsSync(path)) return readFileSync(path)
  const res = await fetchRetry(url, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } })
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, buf)
  return buf
}

export const getJson = async (url, rel, init) => JSON.parse((await cachedGet(url, rel, init)).toString('utf8'))

/**
 * Validates and optimizes one SVG. Returns { svg } or { skip: reason }.
 * Rejects: > 400 KB, unparseable, embedded/linked raster <image>, no drawable shapes
 * (e.g. text-only), and files whose viewBox can't be determined.
 */
export function cleanSvg(raw, maxBytes = MAX_BYTES) {
  if (Buffer.byteLength(raw) > maxBytes) return { skip: 'too large' }
  if (!/<svg[\s>]/i.test(raw)) return { skip: 'not svg' }
  try {
    optimize(raw, { plugins: [] })
  } catch {
    return { skip: 'parse error' }
  }
  if (/<image[\s>/]/i.test(raw)) return { skip: 'embedded raster' }
  let svg = optimizeSvg(raw)
  if (/<image[\s>/]/i.test(svg)) return { skip: 'embedded raster' }
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line|use)[\s>/]/i.test(svg)) return { skip: 'no shapes' }
  const root = svg.match(/<svg\b[^>]*>/i)?.[0]
  if (!root) return { skip: 'not svg' }
  if (!/\sviewBox=/.test(root)) {
    const num = (a) => parseFloat(root.match(new RegExp(`\\s${a}="([\\d.]+)(px)?"`))?.[1] ?? 'NaN')
    const w = num('width')
    const h = num('height')
    if (!(w > 0 && h > 0)) return { skip: 'no viewBox' }
    svg = svg.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`)
  }
  return { svg }
}

/** Tallies skip reasons for the summary line. */
export class Skips {
  counts = {}
  add(reason) {
    this.counts[reason] = (this.counts[reason] ?? 0) + 1
  }
  toString() {
    const e = Object.entries(this.counts)
    return e.length ? 'skipped ' + e.map(([k, v]) => `${v} ${k}`).join(', ') : 'none skipped'
  }
}
