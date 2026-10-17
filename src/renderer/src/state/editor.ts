import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { FigureDoc, Snapshot } from '../model/doc'
import type { BrushKind, Cap, FigObject, Id, Route } from '../model/types'

export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'text' | 'line' | 'arrow' | 'brush'
export type ViewFilter = 'none' | 'grayscale' | 'protanopia' | 'deuteranopia' | 'tritanopia'
export type LeftPanel = 'library' | 'uploads' | 'layers'

export interface View {
  zoom: number
  panX: number
  panY: number
}

export interface Guides {
  x: number[]
  y: number[]
}

interface EditorState {
  doc: FigureDoc
  fileName: string
  filePath?: string
  savedVersion: number

  tool: Tool
  selection: Id[]
  /** Group whose children are currently selectable (double-click to enter), or '' for top level. */
  context: Id | ''
  editingText: Id | null
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

  set: (patch: Partial<EditorState>) => void
  select: (ids: Id[]) => void
  loadDoc: (doc: FigureDoc, fileName: string, filePath?: string) => void
  markSaved: (fileName: string, filePath?: string) => void
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useEditor = create<EditorState>((set, get) => ({
  doc: new FigureDoc(),
  fileName: 'Untitled.pucklet',
  filePath: undefined,
  savedVersion: 0,

  tool: 'select',
  selection: [],
  context: '',
  editingText: null,
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

  set: (patch) => set(patch),
  select: (ids) => set({ selection: ids }),
  loadDoc: (doc, fileName, filePath) =>
    set({
      doc,
      fileName,
      filePath,
      savedVersion: doc.version,
      selection: [],
      context: '',
      editingText: null,
      drafts: new Map()
    }),
  markSaved: (fileName, filePath) => set({ fileName, filePath, savedVersion: get().doc.version }),
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

export function useDirty(): boolean {
  const doc = useEditor((s) => s.doc)
  const saved = useEditor((s) => s.savedVersion)
  useSyncExternalStore(doc.subscribe, () => doc.version)
  return doc.version !== saved
}
