import Papa from 'papaparse'

// Tabular data for charts and tables, plus import from CSV / TSV / Excel / clipboard.

import type { Cell, DataTable } from './types'
export type { Cell, DataTable }

export interface ParsedSheet {
  name: string
  /** Raw grid as read from the file (header detection happens later). */
  grid: Cell[][]
}

const MAX_ROWS = 5000
const MAX_COLS = 200

/** "1,234.5", " 7 ", "1e-3", "12%" → numbers; anything else stays text. */
export function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  if (!s) return null
  const n = Number(s.replace(/,(?=\d{3}\b)/g, ''))
  return Number.isFinite(n) && /^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(s) ? n : s
}

export const isNum = (c: Cell): c is number => typeof c === 'number'

function trimGrid(grid: Cell[][]): Cell[][] {
  const rows = grid.slice(0, MAX_ROWS + 1).map((r) => r.slice(0, MAX_COLS))
  // Drop trailing empty rows and columns.
  while (rows.length && rows[rows.length - 1].every((c) => c === null)) rows.pop()
  const width = Math.max(0, ...rows.map((r) => {
    let w = r.length
    while (w && r[w - 1] === null) w--
    return w
  }))
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null))
}

export function parseDelimited(text: string): Cell[][] {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy', delimiter: '' })
  return trimGrid(res.data.map((r) => r.map(toCell)))
}

export async function parseFile(name: string, bytes: Uint8Array): Promise<ParsedSheet[]> {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'xlsx' || ext === 'xlsm') {
    const { default: readXlsxFile } = await import('read-excel-file/universal')
    const sheets = await readXlsxFile(bytes.slice().buffer as ArrayBuffer)
    return sheets.map((s) => ({ name: s.sheet, grid: trimGrid(s.data.map((r) => r.map(toCell))) })).filter((s) => s.grid.length)
  }
  if (ext === 'xls') throw new Error('Old .xls files are not supported. Save the sheet as .xlsx or CSV and try again.')
  return [{ name: name.replace(/\.[^.]+$/, ''), grid: parseDelimited(new TextDecoder().decode(bytes)) }]
}

/** Clipboard text from a spreadsheet: tab-separated, at least 2 × 2. */
export function looksTabular(text: string): boolean {
  const lines = text.trim().split(/\r?\n/)
  return lines.length >= 2 && lines.slice(0, 5).every((l) => l.includes('\t'))
}

/** A first row counts as a header when it has text where the rest of its column is numeric. */
export function guessHeader(grid: Cell[][]): boolean {
  if (grid.length < 2) return false
  const first = grid[0]
  if (first.every((c) => c === null || isNum(c))) return false
  return first.some((c, i) => typeof c === 'string' && grid.slice(1).some((r) => isNum(r[i]))) || first.every((c) => typeof c === 'string')
}

export function toTable(grid: Cell[][], header: boolean): DataTable {
  const width = Math.max(1, ...grid.map((r) => r.length))
  const head = header ? grid[0] : []
  const columns = Array.from({ length: width }, (_, i) => (head[i] !== null && head[i] !== undefined ? String(head[i]) : `Column ${i + 1}`))
  const rows = (header ? grid.slice(1) : grid).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null))
  return { columns, rows }
}

export function column(t: DataTable, i: number): Cell[] {
  return t.rows.map((r) => r[i] ?? null)
}

export const numbers = (cells: Cell[]): number[] => cells.filter(isNum)

/** Which chart layout fits the data best. */
export type DataShape = 'groups' | 'xy' | 'categories' | 'plate' | 'survival' | 'volcano'

const WELL_ID = /^\s*[A-Pa-p]\s*0?\d{1,2}\s*$/

export function guessShape(t: DataTable): DataShape {
  const heads = t.columns.map((c) => c.toLowerCase())
  if (heads.some((h) => /time|day|month|week|follow/.test(h)) && heads.some((h) => /event|status|censor|death|died|dead/.test(h))) return 'survival'
  if (heads.some((h) => /fc|fold/.test(h)) && heads.some((h) => /^p\b|p.?val|padj|fdr|q.?val/.test(h))) return 'volcano'
  const firstCol = column(t, 0).filter((c) => c !== null)
  if (firstCol.length >= 6 && firstCol.filter((c) => typeof c === 'string' && WELL_ID.test(c)).length >= firstCol.length * 0.8) return 'plate'
  const letters = firstCol.length >= 2 && firstCol.every((c) => typeof c === 'string' && /^[A-Pa-p]$/.test(c.trim()))
  if (letters && t.columns.length - 1 >= 3 && firstCol[0] === 'A') return 'plate'
  const first = column(t, 0)
  const restNumeric = t.columns.slice(1).every((_, i) => column(t, i + 1).every((c) => c === null || isNum(c)))
  if (t.columns.length >= 2 && restNumeric && first.some((c) => typeof c === 'string')) return 'categories'
  const firstNums = numbers(first)
  const increasing = firstNums.length > 2 && firstNums.every((v, i) => i === 0 || v >= firstNums[i - 1])
  if (t.columns.length >= 2 && restNumeric && increasing && firstNums.length === first.filter((c) => c !== null).length) return 'xy'
  return 'groups'
}

export const SAMPLE_GROUPS: DataTable = {
  columns: ['Control', 'Drug A', 'Drug B'],
  rows: [
    [12.1, 18.4, 24.9],
    [10.8, 20.2, 27.3],
    [13.5, 17.1, 22.8],
    [11.2, 19.6, 26.1],
    [12.9, 21.3, 25.5]
  ]
}

/** Example data for each chart type, used by "Example chart" and when switching type on an empty chart. */
export const SAMPLES: Record<string, DataTable> = {
  groups: SAMPLE_GROUPS,
  categories: { columns: ['Tissue', 'WT', 'KO'], rows: [['Liver', 12, 7], ['Kidney', 9, 11], ['Heart', 5, 4]] },
  parts: { columns: ['Cell type', 'Percent'], rows: [['T cells', 42], ['B cells', 18], ['NK cells', 9], ['Monocytes', 23], ['Other', 8]] },
  xy: { columns: ['Time (h)', 'Control', 'Treated'], rows: [[0, 1, 1], [2, 1.4, 2.1], [4, 1.9, 3.8], [8, 2.6, 6.9], [12, 3.1, 9.2]] },
  matrix: {
    columns: ['Gene', 'Ctrl 1', 'Ctrl 2', 'Ctrl 3', 'Trt 1', 'Trt 2', 'Trt 3'],
    rows: [['IL6', -1.2, -0.9, -1.1, 1.8, 2.1, 1.6], ['TNF', -0.8, -1.0, -0.7, 1.2, 1.5, 1.1], ['MYC', 0.4, 0.2, 0.5, -0.6, -0.8, -0.5], ['GAPDH', 0.1, -0.1, 0.0, 0.1, 0.0, -0.1], ['CXCL8', -1.4, -1.3, -1.6, 2.2, 2.4, 2.0]]
  },
  plate: {
    columns: ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
    rows: 'ABCDEFGH'.split('').map((r, i) => [r, ...Array.from({ length: 12 }, (_, j) => Math.round((0.1 + ((i * 12 + j) % 17) / 17 + (j < 2 ? 1.2 : 0)) * 100) / 100)])
  },
  survival: {
    columns: ['Months', 'Event', 'Group'],
    rows: [[2, 1, 'Control'], [4, 1, 'Control'], [5, 0, 'Control'], [7, 1, 'Control'], [9, 1, 'Control'], [12, 0, 'Control'], [3, 0, 'Treated'], [8, 1, 'Treated'], [11, 0, 'Treated'], [14, 1, 'Treated'], [18, 0, 'Treated'], [20, 0, 'Treated']]
  },
  volcano: {
    columns: ['Gene', 'log2FC', 'p value'],
    rows: [['IL6', 3.2, 1e-8], ['TNF', 2.4, 3e-6], ['CXCL8', 2.9, 5e-7], ['MYC', -1.8, 2e-4], ['SOX2', -2.6, 1e-6], ['GAPDH', 0.1, 0.8], ['ACTB', -0.2, 0.6], ['CCL2', 1.4, 0.003], ['KLF4', -1.2, 0.01], ['FOS', 0.6, 0.2], ['JUN', 0.9, 0.04], ['EGR1', -0.4, 0.3]]
  }
}

export const SAMPLE_TABLE: DataTable = {
  columns: ['Gene', 'Fold change', 'p value'],
  rows: [
    ['IL6', 4.21, 0.0003],
    ['TNF', 2.87, 0.0041],
    ['CXCL8', 3.65, 0.0012],
    ['GAPDH', 1.02, 0.91]
  ]
}

/** Text for a cell: numbers with a fixed number of decimals (or as-is when decimals is null). */
export function formatCell(c: Cell, decimals: number | null): string {
  if (c === null) return ''
  if (isNum(c)) {
    if (decimals === null) return Math.abs(c) !== 0 && (Math.abs(c) < 1e-3 || Math.abs(c) >= 1e7) ? c.toExponential(2) : String(Math.round(c * 1e6) / 1e6)
    return c.toFixed(decimals)
  }
  return c
}
