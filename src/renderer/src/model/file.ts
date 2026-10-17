import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { DocData } from './doc'
import { DEFAULT_META } from './doc'
import type { Asset, FigObject } from './types'

// A .pucklet file is a zip so it stays readable by other tools:
//   document.json     canvas settings + every object (see model/types.ts)
//   assets.json       asset records (name, size, palette, source/licence), without the bytes
//   assets/<id>.svg   SVG assets, as-is
//   assets/<id>.png…  raster assets
//   attributions.json credits for every third-party asset used, ready to cite

export const FORMAT = 'pucklet'
export const SCHEMA_VERSION = 1

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

export function serialize(data: DocData, thumbnailPng?: Uint8Array): Uint8Array {
  const usedAssets = new Set(data.objects.flatMap((o) => (o.type === 'icon' || (o.type === 'brush' && o.assetId) ? [o.assetId!] : [])))
  const assets = data.assets.filter((a) => usedAssets.has(a.id))
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
  files['document.json'] = strToU8(
    JSON.stringify({ format: FORMAT, schemaVersion: SCHEMA_VERSION, meta: data.meta, objects: data.objects }, null, 1)
  )
  files['assets.json'] = strToU8(JSON.stringify(records, null, 1))
  files['attributions.json'] = strToU8(JSON.stringify(attributionsFor(assets), null, 1))
  if (thumbnailPng) files['thumbnail.png'] = thumbnailPng
  return zipSync(files, { level: 6 })
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
export function deserialize(bytes: Uint8Array): DocData {
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
  const objects = (Array.isArray(doc.objects) ? doc.objects : []).filter(validObject)
  return { meta: { ...DEFAULT_META, ...doc.meta }, objects, assets }
}
