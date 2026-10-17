import { processSvg, rasterAsset, SvgError } from '../assets/svg'
import { makeIcon } from '../model/defaults'
import type { Pt } from '../model/geometry'
import type { Asset, AssetSource } from '../model/types'
import { useEditor } from '../state/editor'
import { parseFile } from '../model/data'

export const LIBRARY_DRAG_TYPE = 'application/x-pucklet-icon'

export interface IconEntry {
  id: string
  name: string
  category: string
  file: string
  author?: string
  license: string
  url?: string
}

export interface IconPack {
  id: string
  name: string
  description?: string
  homepage?: string
  icons: IconEntry[]
}

/** What gets dragged from the library onto the canvas. */
export interface LibraryItem {
  pack: { id: string; name: string }
  icon: IconEntry
  href: string
}

export function viewportCenter(): Pt {
  const s = useEditor.getState()
  return { x: (s.viewport.w / 2 - s.view.panX) / s.view.zoom, y: (s.viewport.h / 2 - s.view.panY) / s.view.zoom }
}

/** Adds an asset to the document and places it, selected, centered on `at`. */
export function placeAsset(asset: Asset, at: Pt = viewportCenter()): string {
  const s = useEditor.getState()
  const parent = s.context
  const obj = makeIcon(s.doc.snapshot().topZ(parent), asset, at.x, at.y)
  if (parent) obj.parentId = parent
  s.doc.transact((tx) => {
    tx.putAsset(asset)
    tx.add(obj)
  })
  s.set({ selection: [obj.id], tool: 'select' })
  return obj.id
}

const svgCache = new Map<string, Promise<string>>()

export async function placeLibraryIcon(item: LibraryItem, at?: Pt): Promise<void> {
  try {
    if (!svgCache.has(item.href)) {
      svgCache.set(
        item.href,
        fetch(item.href).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.text()
        })
      )
    }
    const markup = await svgCache.get(item.href)!
    const source: AssetSource = { library: item.pack.name, author: item.icon.author, license: item.icon.license, url: item.icon.url }
    placeAsset(processSvg(markup, item.icon.name, source), at)
  } catch (e) {
    svgCache.delete(item.href)
    useEditor.getState().showToast(`Couldn't add “${item.icon.name}”: ${(e as Error).message}`)
  }
}

const RASTER: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

export async function assetFromBytes(name: string, data: Uint8Array): Promise<Asset> {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const base = name.replace(/\.[^.]+$/, '')
  if (ext === 'svg') return processSvg(new TextDecoder().decode(data), base)
  if (RASTER[ext]) return rasterAsset(data, base, RASTER[ext])
  throw new SvgError(`${name}: only SVG, PNG, JPG, GIF and WebP images can be imported`)
}

export async function importFiles(files: { name: string; data: Uint8Array }[], at?: Pt): Promise<void> {
  const origin = at ?? viewportCenter()
  const placed: string[] = []
  for (const [i, f] of files.entries()) {
    try {
      const asset = await assetFromBytes(f.name, f.data)
      placed.push(placeAsset(asset, { x: origin.x + i * 24, y: origin.y + i * 24 }))
    } catch (e) {
      useEditor.getState().showToast((e as Error).message)
    }
  }
  if (placed.length) useEditor.getState().select(placed)
}

const DATA_EXT = /\.(csv|tsv|txt|xlsx|xlsm)$/i

export async function importDroppedFiles(files: File[], at: Pt): Promise<void> {
  const data = files.find((f) => DATA_EXT.test(f.name))
  if (data) {
    try {
      const sheets = await parseFile(data.name, new Uint8Array(await data.arrayBuffer()))
      if (sheets.length) useEditor.getState().set({ dataDialog: { mode: 'import', sheets, at } })
      else useEditor.getState().showToast(`${data.name} has no data.`)
    } catch (e) {
      useEditor.getState().showToast((e as Error).message)
    }
    files = files.filter((f) => f !== data)
    if (!files.length) return
  }
  await importFiles(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))), at)
}
