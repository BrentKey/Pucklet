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
export type DataShape = 'groups' | 'xy' | 'categories'

export function guessShape(t: DataTable): DataShape {
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
