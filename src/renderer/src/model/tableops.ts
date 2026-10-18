import { toCell } from './data'
import type { Cell, DataTable } from './types'

// Pure edits on a table's data. Row 0 means the header row (column names).

export function setCell(d: DataTable, row: number, col: number, text: string): DataTable {
  if (row === 0) return { ...d, columns: d.columns.map((c, j) => (j === col ? text : c)) }
  const v: Cell = toCell(text)
  return { ...d, rows: d.rows.map((r, i) => (i === row - 1 ? r.map((c, j) => (j === col ? v : c)) : r)) }
}

export function cellText(d: DataTable, row: number, col: number): string {
  if (row === 0) return d.columns[col] ?? ''
  const c = d.rows[row - 1]?.[col]
  return c === null || c === undefined ? '' : String(c)
}

/** Insert an empty body row before body row `at` (0-based; at = rows.length appends). */
export function insertRow(d: DataTable, at = d.rows.length): DataTable {
  const rows = d.rows.slice()
  rows.splice(at, 0, d.columns.map(() => null))
  return { ...d, rows }
}

export function insertColumn(d: DataTable, at = d.columns.length): DataTable {
  const columns = d.columns.slice()
  columns.splice(at, 0, '')
  return { columns, rows: d.rows.map((r) => [...r.slice(0, at), null, ...r.slice(at)]) }
}

export function deleteRow(d: DataTable, at: number): DataTable {
  return d.rows.length > 1 ? { ...d, rows: d.rows.filter((_, i) => i !== at) } : d
}

export function deleteColumn(d: DataTable, at: number): DataTable {
  return d.columns.length > 1 ? { columns: d.columns.filter((_, j) => j !== at), rows: d.rows.map((r) => r.filter((_, j) => j !== at)) } : d
}

export function blankTable(rows: number, cols: number): DataTable {
  return { columns: Array.from({ length: cols }, () => ''), rows: Array.from({ length: Math.max(1, rows - 1) }, () => Array.from({ length: cols }, () => null)) }
}
