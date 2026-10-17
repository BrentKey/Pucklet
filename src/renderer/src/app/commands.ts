import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { processSvg, resanitizeAsset } from '../assets/svg'
import { isTyping } from '../canvas/Canvas'
import { fitView, setZoom, zoomAt } from '../canvas/view'
import { makeText } from '../model/defaults'
import { FigureDoc, newId } from '../model/doc'
import { deserializePages, serializePages, validObject } from '../model/file'
import type { Clip } from '../model/ops'
import { boundsOf, copyObjects, deleteObjects, groupObjects, pasteClip, reorder, setLocked, ungroupObjects } from '../model/ops'
import { translate } from '../model/transform'
import { applyChanges } from '../model/ops'
import type { Id } from '../model/types'
import { platform } from '../platform'
import { Node } from '../render/Figure'
import { importFiles, placeAsset, viewportCenter } from '../library/place'
import type { Tool } from '../state/editor'
import { contentSignature, useEditor } from '../state/editor'
import { linesFromPlain } from '../text/layout'
import { setPrefs } from './prefs'
import { withTextSize } from '../model/transform'

const S = () => useEditor.getState()
const isDirty = () => contentSignature(S()) !== S().savedSig

function confirmDiscard(): boolean {
  return !isDirty() || window.confirm('You have unsaved changes. Discard them?')
}

// ---------------------------------------------------------------------------------------
// Files

export function newFigure(): void {
  if (!confirmDiscard()) return
  S().loadPages([{ id: newId(), name: 'Page 1', doc: new FigureDoc() }], 'Untitled.pucklet')
}

export async function openFigure(): Promise<void> {
  if (!confirmDiscard()) return
  const f = await platform.openFile()
  if (!f) return
  try {
    const pages = deserializePages(f.data).map((p) => {
      const assets = []
      for (const a of p.data.assets) {
        try {
          assets.push(resanitizeAsset(a))
        } catch {
          /* drop assets that fail validation; their icons render as placeholders */
        }
      }
      return { id: p.id, name: p.name, doc: new FigureDoc({ ...p.data, assets }) }
    })
    S().loadPages(pages, f.name, f.path)
  } catch (e) {
    window.alert(`Couldn't open ${f.name}: ${(e as Error).message}`)
  }
}

export async function saveFigure(saveAs = false): Promise<boolean> {
  const s = S()
  if (s.editingText) (document.activeElement as HTMLElement | null)?.blur()
  const bytes = serializePages(S().pages.map((p) => ({ id: p.id, name: p.name, data: p.doc.toData() })))
  const res = await platform.saveFile(bytes, s.fileName.endsWith('.pucklet') ? s.fileName : s.fileName + '.pucklet', saveAs ? undefined : s.filePath)
  if (!res) return false
  S().markSaved(res.name, res.path)
  S().showToast(`Saved ${res.name}`)
  return true
}

export async function importImages(): Promise<void> {
  await importFiles(await platform.importFiles())
}

// ---------------------------------------------------------------------------------------
// Edit

const editable = () => S().selection.filter((id) => !S().doc.snapshot().get(id)?.locked)

export function undo(): void {
  if (isTyping()) return void document.execCommand('undo')
  S().doc.undo()
  pruneSelection()
}
export function redo(): void {
  if (isTyping()) return void document.execCommand('redo')
  S().doc.redo()
  pruneSelection()
}

function pruneSelection(): void {
  const snap = S().doc.snapshot()
  const sel = S().selection.filter((id) => snap.get(id))
  const context = S().context && snap.get(S().context) ? S().context : ''
  S().set({ selection: sel, context })
}

export function deleteSelection(): void {
  deleteObjects(S().doc, editable())
  S().select([])
}

export function duplicate(): void {
  const s = S()
  if (!s.selection.length) return
  const ids = pasteClip(s.doc, copyObjects(s.doc.snapshot(), s.selection), s.context, 16, 16)
  s.select(ids)
}

export function selectAll(): void {
  if (isTyping()) return void document.execCommand('selectAll')
  const s = S()
  s.select(s.doc.snapshot().children(s.context).filter((o) => !o.locked && !o.hidden).map((o) => o.id))
}

export function nudge(dx: number, dy: number): void {
  const s = S()
  const ids = editable()
  if (!ids.length) return
  s.doc.transact((tx) => applyChanges(tx, translate(s.doc.snapshot(), ids, dx, dy)))
}

export function group(): void {
  const id = groupObjects(S().doc, editable())
  if (id) S().select([id])
}

export function ungroup(): void {
  const ids = ungroupObjects(S().doc, editable())
  if (ids.length) S().set({ selection: ids })
}

export function toggleLock(): void {
  const s = S()
  if (!s.selection.length) return
  const snap = s.doc.snapshot()
  const lock = !s.selection.every((id) => snap.get(id)?.locked)
  setLocked(s.doc, s.selection, lock)
}

export function setTool(tool: Tool): void {
  S().set({ tool, ...(tool !== 'select' ? { context: '' } : {}) })
}

export function escapeKey(): void {
  const s = S()
  if (s.cropping) return void s.set({ cropping: null })
  if (s.tool !== 'select') return setTool('select')
  if (s.context) {
    s.set({ selection: [s.context], context: '' })
    return
  }
  s.select([])
}

// ---------------------------------------------------------------------------------------
// Clipboard. The clipboard text is an SVG of the selection (so pasting into Inkscape,
// Illustrator or a text editor gives something useful) with our own objects embedded.

const CLIP_ID = 'pucklet-clip'

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function clipToSvg(clip: Clip, ids: Id[]): string {
  const doc = new FigureDoc({ meta: S().doc.snapshot().meta, objects: clip.objects, assets: clip.assets })
  const snap = doc.snapshot()
  const b = boundsOf(snap, ids.filter((id) => snap.get(id))) ?? { x: 0, y: 0, w: 1, h: 1 }
  const body = renderToStaticMarkup(
    createElement(Fragment, null, ...snap.children('').map((o) => createElement(Node, { key: o.id, o, snap, mode: 'export' })))
  )
  const payload = toBase64(new TextEncoder().encode(JSON.stringify(clip)))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${b.w}" height="${b.h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">` +
    `<metadata id="${CLIP_ID}">${payload}</metadata>${body}</svg>`
  )
}

function clipFromText(text: string): Clip | null {
  const m = text.match(new RegExp(`<metadata id="${CLIP_ID}">([A-Za-z0-9+/=]+)</metadata>`))
  if (!m) return null
  try {
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)))) as Clip
    const objects = (raw.objects ?? []).filter(validObject)
    const assets = (raw.assets ?? []).flatMap((a) => {
      try {
        return [resanitizeAsset(a)]
      } catch {
        return []
      }
    })
    return { objects, assets }
  } catch {
    return null
  }
}

export function installClipboard(): () => void {
  const onCopy = (e: ClipboardEvent, cut: boolean) => {
    const s = S()
    if (isTyping() || !s.selection.length || !e.clipboardData) return
    e.preventDefault()
    const clip = copyObjects(s.doc.snapshot(), s.selection)
    e.clipboardData.setData('text/plain', clipToSvg(clip, s.selection))
    if (cut) deleteSelection()
  }
  const copy = (e: ClipboardEvent) => onCopy(e, false)
  const cut = (e: ClipboardEvent) => onCopy(e, true)
  const paste = (e: ClipboardEvent) => {
    if (isTyping() || !e.clipboardData) return
    e.preventDefault()
    const s = S()
    const files = Array.from(e.clipboardData.files)
    if (files.length) {
      void Promise.all(files.map(async (f) => ({ name: f.name || 'Pasted image.png', data: new Uint8Array(await f.arrayBuffer()) }))).then((fs) =>
        importFiles(fs)
      )
      return
    }
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    const clip = clipFromText(text)
    if (clip) {
      s.select(pasteClip(s.doc, clip, s.context, 16, 16))
      return
    }
    if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) {
      try {
        placeAsset(processSvg(text, 'Pasted SVG'))
      } catch (err) {
        s.showToast((err as Error).message)
      }
      return
    }
    // Plain text becomes a text object.
    const c = viewportCenter()
    const t = withTextSize({ ...makeText(s.doc.snapshot().topZ(s.context), c.x, c.y), lines: linesFromPlain(text.slice(0, 5000)) })
    const obj = { ...t, x: c.x - t.w / 2, y: c.y - t.h / 2, ...(s.context ? { parentId: s.context } : {}) }
    s.doc.transact((tx) => tx.add(obj))
    s.select([obj.id])
  }
  document.addEventListener('copy', copy)
  document.addEventListener('cut', cut)
  document.addEventListener('paste', paste)
  return () => {
    document.removeEventListener('copy', copy)
    document.removeEventListener('cut', cut)
    document.removeEventListener('paste', paste)
  }
}

// ---------------------------------------------------------------------------------------
// Command registry (menu ids) and keyboard shortcuts.

export const commands: Record<string, () => void> = {
  'file.new': newFigure,
  'file.open': () => void openFigure(),
  'file.save': () => void saveFigure(false),
  'file.saveAs': () => void saveFigure(true),
  'file.import': () => void importImages(),
  'file.export': () => S().set({ exportOpen: true }),
  'edit.undo': undo,
  'edit.redo': redo,
  'edit.duplicate': () => !isTyping() && duplicate(),
  'edit.selectAll': selectAll,
  'edit.delete': deleteSelection,
  'arrange.group': group,
  'arrange.ungroup': ungroup,
  'arrange.front': () => reorder(S().doc, editable(), 'front'),
  'arrange.forward': () => reorder(S().doc, editable(), 'forward'),
  'arrange.backward': () => reorder(S().doc, editable(), 'backward'),
  'arrange.back': () => reorder(S().doc, editable(), 'back'),
  'arrange.lock': toggleLock,
  'view.zoomIn': () => zoomAt(1.25),
  'view.zoomOut': () => zoomAt(0.8),
  'view.fit': fitView,
  'view.actual': () => setZoom(1),
  'view.grayscale': () => S().set({ filter: S().filter === 'grayscale' ? 'none' : 'grayscale' }),
  'view.rulers': () => setPrefs({ showRulers: !S().prefs.showRulers }),
  'view.grid': () => setPrefs({ showGrid: !S().prefs.showGrid }),
  'view.snapGrid': () => setPrefs({ snapToGrid: !S().prefs.snapToGrid }),
  'help.shortcuts': () => S().set({ shortcutsOpen: true })
}

// In Electron these arrive from the native menu's accelerators; in a browser we bind them here.
const MOD_KEYS: Record<string, string> = {
  n: 'file.new', o: 'file.open', s: 'file.save', 'shift+s': 'file.saveAs', 'shift+i': 'file.import', e: 'file.export',
  z: 'edit.undo', 'shift+z': 'edit.redo', y: 'edit.redo', d: 'edit.duplicate', a: 'edit.selectAll',
  g: 'arrange.group', 'shift+g': 'arrange.ungroup', ']': 'arrange.forward', '[': 'arrange.backward',
  'shift+]': 'arrange.front', 'shift+[': 'arrange.back', l: 'arrange.lock',
  '=': 'view.zoomIn', '+': 'view.zoomIn', '-': 'view.zoomOut', '0': 'view.fit', '1': 'view.actual', "'": 'view.grid'
}

const TOOL_KEYS: Record<string, Tool> = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', e: 'ellipse', t: 'text', l: 'line', a: 'arrow', b: 'brush' }

export function installKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (mod) {
      if (platform.kind === 'electron') return
      // Map shifted symbols back to their base key ("}" -> "]", "{" -> "[").
      const base = ({ '}': ']', '{': '[' } as Record<string, string>)[key] ?? key
      const id = MOD_KEYS[(e.shiftKey ? 'shift+' : '') + base] ?? (e.shiftKey ? undefined : MOD_KEYS[base])
      if (!id) return
      if (isTyping() && !['file.save', 'file.saveAs', 'file.export'].includes(id)) return
      e.preventDefault()
      commands[id]()
      return
    }
    if (e.altKey && key === 'g' && platform.kind === 'web') {
      e.preventDefault()
      commands['view.grayscale']()
      return
    }
    if (isTyping()) return
    if (key === '?') return commands['help.shortcuts']()
    if (e.shiftKey && key === 'r') return commands['view.rulers']()
    if (key === 'Escape' || (key === 'Enter' && S().cropping)) return escapeKey()
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault()
      return deleteSelection()
    }
    const step = e.shiftKey ? 10 : 1
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (arrows[key]) {
      e.preventDefault()
      return nudge(...arrows[key])
    }
    if (!e.altKey && !e.shiftKey && TOOL_KEYS[key]) setTool(TOOL_KEYS[key])
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}

export function installAppEvents(): () => void {
  const offMenu = platform.onMenuCommand((id) => commands[id]?.())
  const offClose = platform.onRequestClose(() => {
    if (confirmDiscard()) platform.confirmClose()
  })
  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (platform.kind === 'web' && isDirty()) e.preventDefault()
  }
  window.addEventListener('beforeunload', beforeUnload)
  return () => {
    offMenu()
    offClose()
    window.removeEventListener('beforeunload', beforeUnload)
  }
}
