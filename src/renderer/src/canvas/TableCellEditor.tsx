import { useLayoutEffect, useRef } from 'react'
import { cellText, insertRow, setCell } from '../model/tableops'
import type { TableObj } from '../model/types'
import { cellRect, layoutTable, withTableSize } from '../render/Table'
import { useEditor } from '../state/editor'

/**
 * Types into one cell of a table directly on the canvas. Tab / Shift+Tab move across,
 * Enter / Shift+Enter move down / up (adding a row at the bottom), Esc or clicking away finishes.
 */
export function TableCellEditor() {
  const cell = useEditor((s) => s.editingCell)
  const view = useEditor((s) => s.view)
  const doc = useEditor((s) => s.doc)
  const ref = useRef<HTMLInputElement>(null)
  const table = cell ? (doc.snapshot().get(cell.id) as TableObj | undefined) : undefined

  useLayoutEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [cell?.id, cell?.row, cell?.col])

  if (!cell || !table || table.type !== 'table') return null
  const l = layoutTable(table)
  const sx = table.w / l.w
  const sy = table.h / l.h
  const r = cellRect(l, cell.row, cell.col)
  const z = view.zoom
  const numeric = l.numeric[cell.col]

  /** Save the cell's text; returns the updated table. */
  const commit = (): TableObj => {
    const cur = useEditor.getState().doc.snapshot().get(cell.id) as TableObj
    const text = ref.current?.value ?? ''
    if (text === cellText(cur.data, cell.row, cell.col)) return cur
    const next = withTableSize({ ...cur, data: setCell(cur.data, cell.row, cell.col, text) })
    useEditor.getState().doc.transact((tx) => tx.put(next))
    return next
  }

  const move = (dRow: number, dCol: number) => {
    let t = commit()
    let row = cell.row
    let col = cell.col + dCol
    const cols = t.data.columns.length
    if (col >= cols) ((col = 0), (row += 1))
    if (col < 0) ((col = cols - 1), (row -= 1))
    row += dRow
    if (row < 0) row = 0
    if (row > t.data.rows.length) {
      // Moving past the last row adds a new one.
      t = withTableSize({ ...t, data: insertRow(t.data) })
      useEditor.getState().doc.transact((tx) => tx.put(t))
    }
    useEditor.getState().set({ editingCell: { id: cell.id, row, col } })
  }

  const done = () => {
    // A cell we've already moved away from can still report a blur; ignore it.
    const now = useEditor.getState().editingCell
    if (!now || now.id !== cell.id || now.row !== cell.row || now.col !== cell.col) return
    commit()
    useEditor.getState().set({ editingCell: null, selection: [cell.id] })
  }

  return (
    <input
      ref={ref}
      key={`${cell.row}-${cell.col}`}
      className="cell-editor"
      defaultValue={cellText(table.data, cell.row, cell.col)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={done}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Tab') {
          e.preventDefault()
          move(0, e.shiftKey ? -1 : 1)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          move(e.shiftKey ? -1 : 1, 0)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          done()
        }
      }}
      onPaste={(e) => e.stopPropagation()}
      style={{
        left: view.panX + (table.x + r.x * sx) * z,
        top: view.panY + (table.y + r.y * sy) * z,
        width: r.w * sx * z,
        height: r.h * sy * z,
        fontFamily: table.style.fontFamily,
        fontSize: table.style.fontSize * sy * z,
        fontWeight: cell.row === 0 ? 'bold' : undefined,
        textAlign: numeric ? 'right' : 'left',
        padding: `0 ${l.padX * sx * z}px`
      }}
    />
  )
}
