import { memo } from 'react'
import { formatCell, isNum } from '../model/data'
import { center } from '../model/geometry'
import type { TableObj, TableStyle } from '../model/types'
import type { RenderMode } from './Figure'
import { Label, textWidth } from './Label'

export interface TableLayout {
  colW: number[]
  rowH: number
  padX: number
  /** Per column: right-align when it holds mostly numbers. */
  numeric: boolean[]
  w: number
  h: number
}

export function layoutTable(t: Pick<TableObj, 'data' | 'style'>): TableLayout {
  const s = t.style
  const fs = s.fontSize
  const padX = fs * 0.6
  const rowH = fs * 1.7
  const { columns, rows } = t.data
  const colW = columns.map((c, i) => {
    let w = textWidth(c, fs, s.fontFamily, true)
    for (const r of rows) w = Math.max(w, textWidth(formatCell(r[i] ?? null, s.decimals), fs, s.fontFamily))
    return Math.ceil(w + padX * 2)
  })
  const numeric = columns.map((_, i) => {
    const filled = rows.map((r) => r[i]).filter((c) => c !== null)
    return filled.length > 0 && filled.filter(isNum).length / filled.length >= 0.6
  })
  return { colW, rowH, padX, numeric, w: Math.max(1, colW.reduce((a, b) => a + b, 0)), h: Math.ceil(rowH * (rows.length + 1)) }
}

/** Returns the table with w/h matching its content. */
export function withTableSize<T extends TableObj>(t: T): T {
  const l = layoutTable(t)
  return { ...t, w: l.w, h: l.h }
}

export const DEFAULT_TABLE_STYLE: TableStyle = {
  fontFamily: 'Arial',
  fontSize: 16,
  color: '#1f1f1f',
  headerFill: '#f2f2f2',
  headerColor: '#1f1f1f',
  stripe: 'none',
  borderColor: '#333333',
  borderWidth: 1,
  decimals: null
}

export const TableView = memo(function TableView({ o, mode }: { o: TableObj; mode: RenderMode }) {
  const l = layoutTable(o)
  const s = o.style
  const fs = s.fontSize
  const c = center(o)
  // Lay out at the table's own size, then stretch to the box (they match unless mid-resize).
  const sx = o.w / l.w
  const sy = o.h / l.h
  const xs = l.colW.reduce<number[]>((acc, w, i) => [...acc, acc[i] + w], [0])
  const baseline = (row: number) => row * l.rowH + l.rowH / 2 + fs * 0.35
  const rule = (y: number, weight: number) => (
    <line x1={0} x2={l.w} y1={y} y2={y} stroke={s.borderColor} strokeWidth={s.borderWidth * weight} />
  )
  return (
    <g
      data-id={mode === 'canvas' ? o.id : undefined}
      opacity={o.opacity < 1 ? o.opacity : undefined}
      transform={[o.rotation ? `rotate(${o.rotation} ${c.x} ${c.y})` : '', `translate(${o.x} ${o.y})`, sx !== 1 || sy !== 1 ? `scale(${sx} ${sy})` : ''].join(' ').trim()}
    >
      {mode === 'canvas' && <rect width={l.w} height={l.h} fill="transparent" />}
      {s.headerFill !== 'none' && <rect width={l.w} height={l.rowH} fill={s.headerFill} />}
      {s.stripe !== 'none' &&
        o.data.rows.map((_, r) => (r % 2 === 1 ? <rect key={'s' + r} y={(r + 1) * l.rowH} width={l.w} height={l.rowH} fill={s.stripe} /> : null))}
      {/* Publication-style rules: top, under the header, bottom. */}
      {s.borderWidth > 0 && (
        <>
          {rule(0, 1.5)}
          {rule(l.rowH, 1)}
          {rule(l.h, 1.5)}
        </>
      )}
      {o.data.columns.map((name, i) => (
        <Label
          key={'h' + i}
          x={l.numeric[i] ? xs[i + 1] - l.padX : xs[i] + l.padX}
          y={baseline(0)}
          anchor={l.numeric[i] ? 'end' : 'start'}
          text={name}
          size={fs}
          family={s.fontFamily}
          color={s.headerColor}
          bold
        />
      ))}
      {o.data.rows.map((row, r) =>
        o.data.columns.map((_, i) => (
          <Label
            key={`${r}-${i}`}
            x={l.numeric[i] ? xs[i + 1] - l.padX : xs[i] + l.padX}
            y={baseline(r + 1)}
            anchor={l.numeric[i] ? 'end' : 'start'}
            text={formatCell(row[i] ?? null, s.decimals)}
            size={fs}
            family={s.fontFamily}
            color={s.color}
          />
        ))
      )}
    </g>
  )
})
