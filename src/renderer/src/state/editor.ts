import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { FigureDoc, newId, Snapshot } from '../model/doc'
import type { ParsedSheet } from '../model/data'
import type { BrushKind, Cap, FigObject, Id, Route } from '../model/types'

export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'text' | 'line' | 'arrow' | 'brush'
export type ViewFilter = 'none' | 'grayscale' | 'protanopia' | 'deuteranopia' | 'tritanopia'
export type LeftPanel = 'library' | 'templates' | 'uploads' | 'layers'

export interface Prefs {
  showGrid: boolean
  snapToGrid: boolean
  gridSize: number
  showRulers: boolean
  /** Show icons under share-alike licences (CC BY-SA), which bind the whole figure to the same licence. */
  shareAlike: boolean
}

export const DEFAULT_PREFS: Prefs = { showGrid: false, snapToGrid: false, gridSize: 20, showRulers: true, shareAlike: false }

export interface View {
  zoom: number
  panX: number
  panY: number
}

export interface Guides {
  x: number[]
  y: number[]
}

export interface Page {
  id: string
  name: string
  doc: FigureDoc
}

interface EditorState {
  /** Every page of the open file; each page is its own document with its own undo history. */
  pages: Page[]
  pageIndex: number
  /** The current page's document. */
  doc: FigureDoc
  fileName: string
  filePath?: string
  /** Bumped when pages are added, removed, renamed or reordered. */
  pagesVersion: number
  /** Content signature at the last save (see contentSignature). */
  savedSig: string

  tool: Tool
  selection: Id[]
  /** Group whose children are currently selectable (double-click to enter), or '' for top level. */
  context: Id | ''
  editingText: Id | null
  /** Icon/image currently in crop mode: its handles crop instead of scaling. */
  cropping: Id | null
  /** Transient object versions shown while dragging; committed to the doc on release. */
  drafts: Map<Id, FigObject>
  guides: Guides
  bindTarget: Id | null
  marquee: { x: number; y: number; w: number; h: number } | null

  view: View
  viewport: { w: number; h: number }
  filter: ViewFilter
  leftPanel: LeftPanel
  exportOpen: boolean
  lineStyle: { route: Route; startCap: Cap; endCap: Cap }
  brushKind: BrushKind
  /** Points of the freehand path being drawn with the brush tool (screen feedback). */
  sketch: { x: number; y: number }[] | null
  toast: string | null
  /** View preferences, remembered between sessions. */
  prefs: Prefs
  shortcutsOpen: boolean
  /** Data import dialog (with already-parsed sheets when a file was dropped or pasted), or the data editor for an object. */
  dataDialog: { mode: 'import'; sheets?: ParsedSheet[]; at?: { x: number; y: number } } | { mode: 'edit'; id: Id } | null

  set: (patch: Partial<EditorState>) => void
  select: (ids: Id[]) => void
  loadPages: (pages: Page[], fileName: string, filePath?: string) => void
  gotoPage: (index: number) => void
  addPage: () => void
  duplicatePage: (index: number) => void
  deletePage: (index: number) => void
  renamePage: (index: number, name: string) => void
  movePage: (from: number, to: number) => void
  markSaved: (fileName: string, filePath?: string) => void
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

const firstPage = (): Page => ({ id: newId(), name: 'Page 1', doc: new FigureDoc() })
const initialPage = firstPage()

/** Changes whenever any page's content or the page list changes; compared to detect unsaved edits. */
export function contentSignature(st: { pages: Page[]; pagesVersion: number }): string {
  return st.pagesVersion + '|' + st.pages.map((p) => `${p.id}:${p.doc.version}`).join(',')
}

/** Selection-related state that doesn't carry over to another page. */
const PAGE_RESET = { selection: [] as Id[], context: '' as const, editingText: null, cropping: null, drafts: new Map<Id, FigObject>() }

export const useEditor = create<EditorState>((set, get) => ({
  pages: [initialPage],
  pageIndex: 0,
  doc: initialPage.doc,
  fileName: 'Untitled.pucklet',
  filePath: undefined,
  pagesVersion: 0,
  savedSig: contentSignature({ pages: [initialPage], pagesVersion: 0 }),

  tool: 'select',
  selection: [],
  context: '',
  editingText: null,
  cropping: null,
  drafts: new Map(),
  guides: { x: [], y: [] },
  bindTarget: null,
  marquee: null,

  view: { zoom: 1, panX: 0, panY: 0 },
  viewport: { w: 800, h: 600 },
  filter: 'none',
  leftPanel: 'library',
  exportOpen: false,
  lineStyle: { route: 'straight', startCap: 'none', endCap: 'arrow' },
  brushKind: 'bilayer',
  sketch: null,
  toast: null,
  prefs: DEFAULT_PREFS,
  shortcutsOpen: false,
  dataDialog: null,

  set: (patch) => set(patch),
  select: (ids) => set((st) => ({ selection: ids, cropping: st.cropping && ids.length === 1 && ids[0] === st.cropping ? st.cropping : null })),
  loadPages: (pages, fileName, filePath) => {
    const list = pages.length ? pages : [firstPage()]
    set({ ...PAGE_RESET, pages: list, pageIndex: 0, doc: list[0].doc, fileName, filePath, pagesVersion: 0, savedSig: contentSignature({ pages: list, pagesVersion: 0 }) })
  },
  gotoPage: (index) => {
    const { pages } = get()
    const i = Math.max(0, Math.min(pages.length - 1, index))
    set({ ...PAGE_RESET, pageIndex: i, doc: pages[i].doc })
  },
  addPage: () => {
    const { pages, pageIndex, doc, pagesVersion } = get()
    // New pages start with the same canvas size and background as the current one.
    const page: Page = { id: newId(), name: nextPageName(pages), doc: new FigureDoc({ meta: doc.snapshot().meta, objects: [], assets: [] }) }
    const list = [...pages.slice(0, pageIndex + 1), page, ...pages.slice(pageIndex + 1)]
    set({ ...PAGE_RESET, pages: list, pageIndex: pageIndex + 1, doc: page.doc, pagesVersion: pagesVersion + 1 })
  },
  duplicatePage: (index) => {
    const { pages, pagesVersion } = get()
    const src = pages[index]
    if (!src) return
    const page: Page = { id: newId(), name: `${src.name} copy`, doc: new FigureDoc(src.doc.toData()) }
    const list = [...pages.slice(0, index + 1), page, ...pages.slice(index + 1)]
    set({ ...PAGE_RESET, pages: list, pageIndex: index + 1, doc: page.doc, pagesVersion: pagesVersion + 1 })
  },
  deletePage: (index) => {
    const { pages, pageIndex, pagesVersion } = get()
    if (pages.length < 2) return
    const list = pages.filter((_, i) => i !== index)
    const next = Math.min(index < pageIndex ? pageIndex - 1 : pageIndex, list.length - 1)
    set({ ...PAGE_RESET, pages: list, pageIndex: next, doc: list[next].doc, pagesVersion: pagesVersion + 1 })
  },
  renamePage: (index, name) => {
    const { pages, pagesVersion } = get()
    if (!pages[index] || !name.trim()) return
    set({ pages: pages.map((p, i) => (i === index ? { ...p, name: name.trim() } : p)), pagesVersion: pagesVersion + 1 })
  },
  movePage: (from, to) => {
    const { pages, pageIndex, pagesVersion } = get()
    if (from === to || !pages[from] || to < 0 || to >= pages.length) return
    const list = pages.slice()
    const [p] = list.splice(from, 1)
    list.splice(to, 0, p)
    const current = pages[pageIndex]
    set({ pages: list, pageIndex: list.indexOf(current), pagesVersion: pagesVersion + 1 })
  },
  markSaved: (fileName, filePath) => set({ fileName, filePath, savedSig: contentSignature(get()) }),
  showToast: (msg) => {
    clearTimeout(toastTimer)
    set({ toast: msg })
    toastTimer = setTimeout(() => set({ toast: null }), 3500)
  }
}))

/** Current committed document snapshot; re-renders on every document change. */
export function useSnapshot(): Snapshot {
  const doc = useEditor((s) => s.doc)
  return useSyncExternalStore(doc.subscribe, doc.snapshot)
}

/** Snapshot with in-progress drag previews applied. */
export function useLiveSnapshot(): Snapshot {
  const snap = useSnapshot()
  const drafts = useEditor((s) => s.drafts)
  return snap.withOverrides(drafts)
}

function nextPageName(pages: Page[]): string {
  let n = pages.length + 1
  while (pages.some((p) => p.name === `Page ${n}`)) n++
  return `Page ${n}`
}

export function useDirty(): boolean {
  const doc = useEditor((s) => s.doc)
  const saved = useEditor((s) => s.savedSig)
  // Only the current page can change while it's open; the page list lives in the store.
  useSyncExternalStore(doc.subscribe, () => doc.version)
  useEditor((s) => s.pages)
  useEditor((s) => s.pagesVersion)
  return contentSignature(useEditor.getState()) !== saved
}
