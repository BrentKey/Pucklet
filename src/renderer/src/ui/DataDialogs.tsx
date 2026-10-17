import { useEffect, useMemo, useState } from 'react'
import { viewportCenter } from '../library/place'
import type { Cell, DataTable, ParsedSheet } from '../model/data'
import { formatCell, guessHeader, guessShape, looksTabular, parseDelimited, parseFile, SAMPLE_GROUPS, SAMPLE_TABLE, toCell, toTable } from '../model/data'
import { makeChart, makeTable } from '../model/defaults'
import type { ChartKind, ChartObj, TableObj } from '../model/types'
import { platform } from '../platform'
import { withTableSize } from '../render/Table'
import { useEditor } from '../state/editor'

export const CHART_KINDS: { kind: ChartKind; label: string; layout: string }[] = [
  { kind: 'bar', label: 'Bar (mean ± error, with points)', layout: 'groups' },
  { kind: 'dot', label: 'Dot plot (points, mean ± error)', layout: 'groups' },
  { kind: 'box', label: 'Box plot', layout: 'groups' },
  { kind: 'violin', label: 'Violin plot', layout: 'groups' },
  { kind: 'grouped', label: 'Grouped bars', layout: 'categories' },
  { kind: 'stacked', label: 'Stacked bars', layout: 'categories' },
  { kind: 'scatter', label: 'Scatter (X–Y)', layout: 'xy' },
  { kind: 'line', label: 'Line (X–Y)', layout: 'xy' }
]

export const LAYOUT_HELP: Record<string, string> = {
  groups: 'Each column is a group; each row is a replicate.',
  categories: 'First column: category names. Other columns: one series each.',
  xy: 'First column: X values. Other columns: one Y series each.'
}

const PREVIEW_ROWS = 8
const KIND_FOR: Record<string, ChartKind> = { groups: 'bar', categories: 'grouped', xy: 'line' }

async function pickData(): Promise<ParsedSheet[] | null> {
  const f = await platform.openDataFile()
  if (!f) return null
  return parseFile(f.name, f.data)
}

function Preview({ table }: { table: DataTable }) {
  return (
    <div className="data-preview">
      <table>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={typeof c === 'number' ? 'num' : ''}>
                  {formatCell(c, null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length > PREVIEW_ROWS && <p className="muted small">…and {table.rows.length - PREVIEW_ROWS} more rows</p>}
    </div>
  )
}

/** Choose a file / paste / example, check the preview, then insert a chart or a table. */
export function ImportDataDialog({ initial, at }: { initial?: ParsedSheet[]; at?: { x: number; y: number } }) {
  const close = () => useEditor.getState().set({ dataDialog: null })
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(initial ?? null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sheet = sheets?.[sheetIndex]
  const [header, setHeader] = useState(true)
  useEffect(() => {
    if (sheet) setHeader(guessHeader(sheet.grid))
  }, [sheet])
  const table = useMemo(() => (sheet ? toTable(sheet.grid, header) : null), [sheet, header])
  const shape = table ? guessShape(table) : 'groups'
  const [as, setAs] = useState<'chart' | 'table'>('chart')
  const [kind, setKind] = useState<ChartKind>('bar')
  useEffect(() => setKind(KIND_FOR[shape]), [shape])

  const insert = (data: DataTable, mode: 'chart' | 'table', k: ChartKind) => {
    const s = useEditor.getState()
    const p = at ?? viewportCenter()
    const z = s.doc.snapshot().topZ(s.context)
    const obj = mode === 'chart' ? makeChart(z, data, p.x, p.y, k) : makeTable(z, data, p.x, p.y)
    const placed = s.context ? { ...obj, parentId: s.context } : obj
    s.doc.transact((tx) => tx.add(placed))
    s.set({ selection: [placed.id], tool: 'select', dataDialog: null })
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide-modal" role="dialog" aria-label="Insert chart or table" onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Insert a chart or table</h2>
        {!sheets && (
          <div className="data-sources">
            <button
              className="primary"
              onClick={async () => {
                try {
                  const s = await pickData()
                  if (s?.length) setSheets(s)
                  else if (s) setError('That file has no data.')
                } catch (e) {
                  setError((e as Error).message)
                }
              }}
            >
              Choose CSV or Excel file…
            </button>
            <div className="field">
              <label>…or paste cells copied from Excel, Google Sheets or Prism</label>
              <textarea
                className="smart-items"
                rows={5}
                placeholder={'Control\tDrug A\n12.1\t18.4\n10.8\t20.2'}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <button disabled={!pasted.trim()} onClick={() => setSheets([{ name: 'Pasted', grid: parseDelimited(pasted) }])}>
                Use pasted data
              </button>
            </div>
            <div className="btn-row">
              <span className="muted small">No data yet?</span>
              <button onClick={() => insert(SAMPLE_GROUPS, 'chart', 'bar')}>Example chart</button>
              <button onClick={() => insert(SAMPLE_TABLE, 'table', 'bar')}>Example table</button>
            </div>
          </div>
        )}
        {sheets && table && (
          <>
            <div className="row">
              {sheets.length > 1 && (
                <select value={sheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={i} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <label className="check small">
                <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
                First row is column names
              </label>
              <span className="muted small grow" style={{ textAlign: 'right' }}>
                {table.rows.length} rows × {table.columns.length} columns
              </span>
            </div>
            <Preview table={table} />
            <div className="field">
              <label>Insert as</label>
              <div className="row">
                <select value={as} onChange={(e) => setAs(e.target.value as 'chart' | 'table')}>
                  <option value="chart">Chart</option>
                  <option value="table">Table</option>
                </select>
                {as === 'chart' && (
                  <select className="grow" value={kind} onChange={(e) => setKind(e.target.value as ChartKind)}>
                    {CHART_KINDS.map((k) => (
                      <option key={k.kind} value={k.kind}>
                        {k.label}
                        {k.layout === shape ? '  ✓ fits this data' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {as === 'chart' && <p className="muted small">{LAYOUT_HELP[CHART_KINDS.find((k) => k.kind === kind)!.layout]}</p>}
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {sheets && !initial && <button onClick={() => setSheets(null)}>Back</button>}
          <button onClick={close}>Cancel</button>
          {table && (
            <button className="primary" onClick={() => insert(table, as, kind)}>
              Insert {as}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const MAX_EDIT_ROWS = 1000

/** Spreadsheet-style editor for a chart's or table's data. Applies as one undo step. */
export function DataEditorDialog({ id }: { id: string }) {
  const s = useEditor.getState()
  const obj = s.doc.snapshot().get(id) as ChartObj | TableObj | undefined
  const close = () => useEditor.getState().set({ dataDialog: null })
  const [data, setData] = useState<DataTable>(() => (obj ? { columns: [...obj.data.columns], rows: obj.data.rows.map((r) => [...r]) } : { columns: [], rows: [] }))
  const [error, setError] = useState<string | null>(null)
  if (!obj) return null

  const setCell = (r: number, c: number, v: Cell) =>
    setData((d) => ({ ...d, rows: d.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) }))
  const setHeader = (c: number, v: string) => setData((d) => ({ ...d, columns: d.columns.map((x, j) => (j === c ? v : x)) }))
  const addRow = () => setData((d) => ({ ...d, rows: [...d.rows, d.columns.map(() => null)] }))
  const addCol = () => setData((d) => ({ columns: [...d.columns, `Column ${d.columns.length + 1}`], rows: d.rows.map((r) => [...r, null]) }))
  const delRow = (r: number) => setData((d) => ({ ...d, rows: d.rows.filter((_, i) => i !== r) }))
  const delCol = (c: number) => setData((d) => ({ columns: d.columns.filter((_, j) => j !== c), rows: d.rows.map((r) => r.filter((_, j) => j !== c)) }))

  /** Pasting a block of cells spreads it across the grid from the focused cell. */
  const pasteAt = (r0: number, c0: number, text: string) => {
    const grid = parseDelimited(text)
    setData((d) => {
      const width = Math.max(d.columns.length, c0 + Math.max(0, ...grid.map((g) => g.length)))
      const columns = Array.from({ length: width }, (_, j) => d.columns[j] ?? `Column ${j + 1}`)
      const height = Math.max(d.rows.length, r0 + grid.length)
      const rows = Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => d.rows[i]?.[j] ?? null))
      grid.forEach((g, i) => g.forEach((v, j) => (rows[r0 + i][c0 + j] = v)))
      return { columns, rows }
    })
  }

  const apply = () => {
    const doc = useEditor.getState().doc
    doc.transact((tx) => {
      const cur = tx.snap.get(id) as ChartObj | TableObj | undefined
      if (!cur) return
      tx.put(cur.type === 'table' ? withTableSize({ ...cur, data }) : { ...cur, data })
    })
    close()
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal data-modal" role="dialog" aria-label="Edit data" onKeyDown={(e) => e.key === 'Escape' && close()}>
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>
            Edit data
          </h2>
          <button
            onClick={async () => {
              try {
                const sheets = await pickData()
                if (sheets?.[0]) setData(toTable(sheets[0].grid, guessHeader(sheets[0].grid)))
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            Replace from file…
          </button>
        </div>
        {obj.type === 'chart' && <p className="muted small">{LAYOUT_HELP[CHART_KINDS.find((k) => k.kind === obj.kind)!.layout]} Paste cells from a spreadsheet into any cell.</p>}
        <div className="data-grid-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th />
                {data.columns.map((c, j) => (
                  <th key={j}>
                    <input value={c} onChange={(e) => setHeader(j, e.target.value)} />
                    <button className="del" title="Delete column" onClick={() => delCol(j)}>
                      ×
                    </button>
                  </th>
                ))}
                <th>
                  <button title="Add column" onClick={addCol}>
                    +
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, MAX_EDIT_ROWS).map((row, i) => (
                <tr key={i}>
                  <td className="rownum">
                    {i + 1}
                    <button className="del" title="Delete row" onClick={() => delRow(i)}>
                      ×
                    </button>
                  </td>
                  {row.map((c, j) => (
                    <td key={j}>
                      <input
                        className={typeof c === 'number' ? 'num' : ''}
                        defaultValue={formatCell(c, null)}
                        key={`${i}-${j}-${String(c)}`}
                        onBlur={(e) => setCell(i, j, toCell(e.target.value))}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData('text/plain')
                          if (looksTabular(text) || text.includes('\t')) {
                            e.preventDefault()
                            pasteAt(i, j, text)
                          }
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.rows.length > MAX_EDIT_ROWS && <p className="muted small">Showing the first {MAX_EDIT_ROWS} of {data.rows.length} rows; the rest are kept.</p>}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button onClick={addRow}>+ Row</button>
          <span className="grow" />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={apply}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

export function DataDialogs() {
  const dlg = useEditor((s) => s.dataDialog)
  if (!dlg) return null
  return dlg.mode === 'edit' ? <DataEditorDialog key={dlg.id} id={dlg.id} /> : <ImportDataDialog initial={dlg.sheets} at={dlg.at} />
}
