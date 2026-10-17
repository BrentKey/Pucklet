import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { DocData } from './doc'
import { DEFAULT_META } from './doc'
import type { Asset, FigObject } from './types'

// A .pucklet file is a zip so it stays readable by other tools:
//   document.json     pages, each with canvas settings + every object (see model/types.ts)
//   assets.json       asset records (name, size, palette, source/licence), without the bytes
//   assets/<id>.svg   SVG assets, as-is
//   assets/<id>.png…  raster assets
//   attributions.json credits for every third-party asset used, ready to cite

export const FORMAT = 'pucklet'
export const SCHEMA_VERSION = 2

const KNOWN_TYPES = new Set(['rect', 'ellipse', 'text', 'icon', 'line', 'brush', 'group'])
const MIME_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

export class FileFormatError extends Error {}

function dataUrlToBytes(url: string): { bytes: Uint8Array; mime: string } {
  const m = url.match(/^data:([^;]+);base64,(.*)$/)
  if (!m) throw new FileFormatError('Unsupported image data')
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime: m[1] }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${mime};base64,${btoa(bin)}`
}

export function attributionsFor(assets: Asset[]): { name: string; library: string; author?: string; license: string; url?: string }[] {
  return assets
    .filter((a) => a.source)
    .map((a) => ({ name: a.name, library: a.source!.library, author: a.source!.author, license: a.source!.license, url: a.source!.url }))
}

export interface PageData {
  id: string
  name: string
  data: DocData
}

const assetIdsOf = (objects: FigObject[]) =>
  objects.flatMap((o) => (o.type === 'icon' || (o.type === 'brush' && o.assetId) ? [o.assetId!] : []))

/** Writes a multi-page figure. Assets are stored once and shared by all pages. */
export function serializePages(pages: PageData[], thumbnailPng?: Uint8Array): Uint8Array {
  const used = new Set(pages.flatMap((p) => assetIdsOf(p.data.objects)))
  const byId = new Map<string, Asset>()
  for (const p of pages) for (const a of p.data.assets) if (used.has(a.id)) byId.set(a.id, a)
  const assets = [...byId.values()]
  const files: Record<string, Uint8Array> = {}
  const records = assets.map((a) => {
    const { data: content, ...rest } = a
    if (a.kind === 'svg') {
      const file = `assets/${a.id}.svg`
      files[file] = strToU8(content)
      return { ...rest, file }
    }
    const { bytes, mime } = dataUrlToBytes(content)
    const file = `assets/${a.id}.${MIME_EXT[mime] ?? 'bin'}`
    files[file] = bytes
    return { ...rest, file, mime }
  })
  const doc = {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    pages: pages.map((p) => ({ id: p.id, name: p.name, meta: p.data.meta, objects: p.data.objects }))
  }
  files['document.json'] = strToU8(JSON.stringify(doc, null, 1))
  files['assets.json'] = strToU8(JSON.stringify(records, null, 1))
  files['attributions.json'] = strToU8(JSON.stringify(attributionsFor(assets), null, 1))
  if (thumbnailPng) files['thumbnail.png'] = thumbnailPng
  return zipSync(files, { level: 6 })
}

/** Single-page convenience wrapper. */
export function serialize(data: DocData, thumbnailPng?: Uint8Array): Uint8Array {
  return serializePages([{ id: 'page-1', name: 'Page 1', data }], thumbnailPng)
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function validObject(o: unknown): o is FigObject {
  if (!o || typeof o !== 'object') return false
  const r = o as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.z !== 'string' || !KNOWN_TYPES.has(r.type as string)) return false
  if (r.type === 'line') {
    const ok = (e: unknown) => !!e && finite((e as { x: unknown }).x) && finite((e as { y: unknown }).y)
    return ok(r.start) && ok(r.end)
  }
  if (r.type === 'group') return true
  if (r.type === 'brush') {
    return Array.isArray(r.points) && (r.points as unknown[]).every((p) => !!p && finite((p as { x: unknown }).x) && finite((p as { y: unknown }).y))
  }
  return finite(r.x) && finite(r.y) && finite(r.w) && finite(r.h)
}

/** Parses a .pucklet file. Asset contents still need re-sanitizing by the caller. */
export function deserializePages(bytes: Uint8Array): PageData[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new FileFormatError('This file is not a Pucklet figure (not a zip archive).')
  }
  const docFile = files['document.json']
  if (!docFile) throw new FileFormatError('This file is missing document.json.')
  const doc = JSON.parse(strFromU8(docFile))
  if (doc.format !== FORMAT) throw new FileFormatError('This file is not a Pucklet figure.')
  if (doc.schemaVersion > SCHEMA_VERSION) {
    throw new FileFormatError('This figure was saved by a newer version of Pucklet. Please update the app.')
  }
  const records: (Omit<Asset, 'data'> & { file: string; mime?: string })[] = files['assets.json']
    ? JSON.parse(strFromU8(files['assets.json']))
    : []
  const assets: Asset[] = []
  for (const r of records) {
    const content = files[r.file]
    if (!content) continue
    const { file: _file, mime, ...rest } = r
    void _file
    assets.push({ ...rest, data: r.kind === 'svg' ? strFromU8(content) : bytesToDataUrl(content, mime ?? 'image/png') })
  }
  // Version 1 files have a single page stored at the top level.
  const rawPages: { id?: string; name?: string; meta?: object; objects?: unknown[] }[] = Array.isArray(doc.pages)
    ? doc.pages
    : [{ meta: doc.meta, objects: doc.objects }]
  if (!rawPages.length) rawPages.push({})
  return rawPages.map((p, i) => {
    const objects = (Array.isArray(p.objects) ? p.objects : []).filter(validObject)
    const used = new Set(assetIdsOf(objects))
    return {
      id: typeof p.id === 'string' ? p.id : `page-${i + 1}`,
      name: typeof p.name === 'string' && p.name ? p.name : `Page ${i + 1}`,
      data: { meta: { ...DEFAULT_META, ...p.meta }, objects, assets: assets.filter((a) => used.has(a.id)) }
    }
  })
}

/** First page only (convenience for single-page callers and tests). */
export function deserialize(bytes: Uint8Array): DocData {
  return deserializePages(bytes)[0].data
}
