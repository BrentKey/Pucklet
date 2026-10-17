import type { FigureDoc } from './doc'
import { generateNKeysBetween } from 'fractional-indexing'
import { makeRect, makeText } from './defaults'
import { withTextSize } from './transform'
import type { RectObj, TextObj } from './types'

// Multi-panel figures ("Figure 1A, 1B, …"): lay out panel frames on the artboard and keep the
// panel letters in reading order.

export interface PanelLayout {
  id: string
  name: string
  cols: number
  rows: number
  /** [col, row, colSpan, rowSpan] for each panel, in reading order. */
  cells: [number, number, number, number][]
}

const grid = (cols: number, rows: number): PanelLayout['cells'] =>
  Array.from({ length: cols * rows }, (_, i) => [i % cols, Math.floor(i / cols), 1, 1])

export const PANEL_LAYOUTS: PanelLayout[] = [
  { id: '2x1', name: '2 side by side', cols: 2, rows: 1, cells: grid(2, 1) },
  { id: '3x1', name: '3 in a row', cols: 3, rows: 1, cells: grid(3, 1) },
  { id: '1x2', name: '2 stacked', cols: 1, rows: 2, cells: grid(1, 2) },
  { id: '2x2', name: '2 × 2 grid', cols: 2, rows: 2, cells: grid(2, 2) },
  { id: '3x2', name: '3 × 2 grid', cols: 3, rows: 2, cells: grid(3, 2) },
  { id: 'L+2', name: 'Large left, 2 right', cols: 2, rows: 2, cells: [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]] },
  { id: 'T+2', name: 'Wide top, 2 below', cols: 2, rows: 2, cells: [[0, 0, 2, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
  { id: 'T+3', name: 'Wide top, 3 below', cols: 3, rows: 2, cells: [[0, 0, 3, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]] }
]

export type LabelStyle = 'A' | 'a' | '(a)' | 'A.' | 'a)'

export function panelLetter(i: number, style: LabelStyle): string {
  // A..Z, then AA, AB… for very large figures.
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  const lower = s.toLowerCase()
  switch (style) {
    case 'A':
      return s
    case 'a':
      return lower
    case '(a)':
      return `(${lower})`
    case 'A.':
      return `${s}.`
    case 'a)':
      return `${lower})`
  }
}

export interface PanelOptions {
  margin: number
  gap: number
  frames: boolean
  labelStyle: LabelStyle
  labelSize: number
}

export const DEFAULT_PANEL_OPTIONS: PanelOptions = { margin: 24, gap: 24, frames: true, labelStyle: 'A', labelSize: 28 }

function labelObject(z: string, x: number, y: number, text: string, size: number): TextObj {
  return withTextSize({
    ...makeText(z, x, y),
    lines: [[{ text, bold: true }]],
    fontSize: size,
    color: '#111111',
    role: 'panel-label',
    name: `Panel ${text.replace(/[^A-Za-z]/g, '')} label`
  })
}

/** Adds a panel layout (frames + letters) on top of the current figure. */
export function addPanelLayout(doc: FigureDoc, layout: PanelLayout, opts: PanelOptions): string[] {
  const snap = doc.snapshot()
  const { width: W, height: H } = snap.meta
  const cw = (W - opts.margin * 2 - opts.gap * (layout.cols - 1)) / layout.cols
  const ch = (H - opts.margin * 2 - opts.gap * (layout.rows - 1)) / layout.rows
  const existing = [...snap.objects.values()].filter((o) => o.role === 'panel-label').length
  const top = snap.children('')
  const keys = generateNKeysBetween(top.length ? top[top.length - 1].z : null, null, layout.cells.length * 2)
  const created: string[] = []
  doc.transact((tx) => {
    layout.cells.forEach(([c, r, cs, rs], i) => {
      const x = opts.margin + c * (cw + opts.gap)
      const y = opts.margin + r * (ch + opts.gap)
      const w = cw * cs + opts.gap * (cs - 1)
      const h = ch * rs + opts.gap * (rs - 1)
      const letter = panelLetter(existing + i, opts.labelStyle)
      if (opts.frames) {
        const frame: RectObj = {
          ...makeRect(keys[i * 2], x, y, w, h),
          fill: 'none',
          stroke: '#c8ccd2',
          strokeWidth: 1,
          dash: 'dashed',
          radius: 0,
          role: 'panel-frame',
          name: `Panel ${letter.replace(/[^A-Za-z]/g, '')} frame`
        }
        tx.add(frame)
        created.push(frame.id)
      }
      const label = labelObject(keys[i * 2 + 1], x + 4, y + 2, letter, opts.labelSize)
      tx.add(label)
      created.push(label.id)
    })
  })
  return created
}

/** Re-letters every panel label in reading order: rows top to bottom, then left to right. */
export function reletterPanels(doc: FigureDoc, style: LabelStyle): number {
  const snap = doc.snapshot()
  const labels = [...snap.objects.values()].filter((o): o is TextObj => o.role === 'panel-label' && o.type === 'text')
  if (!labels.length) return 0
  // Labels whose tops are within half a label height of each other count as one row.
  const sorted = [...labels].sort((a, b) => a.y - b.y)
  const rows: TextObj[][] = []
  for (const l of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - l.y) < Math.max(l.h, row[0].h) * 0.75) row.push(l)
    else rows.push([l])
  }
  const order = rows.flatMap((r) => r.sort((a, b) => a.x - b.x))
  doc.transact((tx) => {
    order.forEach((l, i) => {
      const text = panelLetter(i, style)
      const run = l.lines[0]?.[0] ?? { text: '' }
      const next = withTextSize({ ...l, lines: [[{ ...run, text }]], name: `Panel ${text.replace(/[^A-Za-z]/g, '')} label` })
      tx.put(next)
    })
  })
  return order.length
}

/** A single new panel label with the next free letter, at (x, y). */
export function addPanelLabel(doc: FigureDoc, x: number, y: number, style: LabelStyle, size: number): string {
  const snap = doc.snapshot()
  const count = [...snap.objects.values()].filter((o) => o.role === 'panel-label').length
  const label = labelObject(snap.topZ(''), x, y, panelLetter(count, style), size)
  doc.transact((tx) => tx.add(label))
  return label.id
}
