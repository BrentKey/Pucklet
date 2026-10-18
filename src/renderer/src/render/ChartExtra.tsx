import { bin as d3bin, extent } from 'd3-array'
import { scaleBand, scaleLinear } from 'd3-scale'
import type { ScaleLinear } from 'd3-scale'
import { interpolateBlues, interpolateGreens, interpolateMagma, interpolateRdBu, interpolateReds, interpolateViridis } from 'd3-scale-chromatic'
import { arc as d3arc, pie as d3pie } from 'd3-shape'
import type { ReactNode } from 'react'
import { column, isNum, numbers } from '../model/data'
import { errorOf, jitter, mean } from '../model/stats'
import type { ChartObj, ColorScaleName, DataTable } from '../model/types'
import { shade } from './Brush'
import { Label, textWidth } from './Label'

// Chart types beyond the basic bar / box / XY family: parts of a whole, matrices, plates,
// survival curves, distributions and differential-expression plots.

export const EXTRA_KINDS = new Set(['pie', 'donut', 'heatmap', 'plate', 'survival', 'histogram', 'volcano', 'meanline'])

const INK = '#222222'
const f = (n: number) => Math.round(n * 100) / 100
const PALETTE = ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#f0e442', '#555555']

export function tickLabel(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e5 || a < 1e-3) return v.toExponential(0).replace('e+', 'e')
  return String(Math.round(v * 1e6) / 1e6)
}

const SCALES: Record<ColorScaleName, (t: number) => string> = {
  viridis: interpolateViridis,
  magma: interpolateMagma,
  blues: interpolateBlues,
  reds: interpolateReds,
  greens: interpolateGreens,
  // Blue (low) → white → red (high).
  diverging: (t) => interpolateRdBu(1 - t)
}

/** Text colour that stays readable on a given fill. */
function contrast(hex: string): string {
  const m = hex.match(/\d+/g)
  let r: number, g: number, b: number
  if (hex.startsWith('#')) [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  else [r, g, b] = (m ?? ['0', '0', '0']).map(Number)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff'
}

// ---------------------------------------------------------------------------------------
// Shared layout: title, plot rectangle, axes.

interface Frame {
  px0: number
  px1: number
  py0: number
  py1: number
}

function frame(o: ChartObj, opts: { left: number; bottom: number; right?: number }): Frame {
  const fs = o.fontSize
  const top = o.title ? fs * 1.8 : fs * 0.6
  return { px0: o.x + opts.left, px1: o.x + o.w - (opts.right ?? fs * 0.8), py0: o.y + top, py1: Math.max(o.y + top + 20, o.y + o.h - opts.bottom) }
}

function Title({ o, fr }: { o: ChartObj; fr: Frame }) {
  return o.title ? <Label x={(fr.px0 + fr.px1) / 2} y={o.y + o.fontSize * 1.2} text={o.title} size={o.fontSize * 1.1} family={o.fontFamily} anchor="middle" bold /> : null
}

function YAxis({ o, fr, y, label }: { o: ChartObj; fr: Frame; y: ScaleLinear<number, number>; label: string }) {
  const fs = o.fontSize
  return (
    <g>
      <path d={`M${f(fr.px0)} ${f(fr.py0)} V${f(fr.py1)}`} stroke={INK} strokeWidth={1.2} />
      {y.ticks(5).map((t) => (
        <g key={t}>
          <path d={`M${f(fr.px0)} ${f(y(t))} h${f(-fs * 0.3)}`} stroke={INK} />
          <Label x={fr.px0 - fs * 0.45} y={y(t) + fs * 0.32} text={tickLabel(t)} size={fs * 0.9} family={o.fontFamily} anchor="end" />
        </g>
      ))}
      {label && <Label x={o.x + fs * 1.1} y={(fr.py0 + fr.py1) / 2} text={label} size={fs} family={o.fontFamily} anchor="middle" rotate={-90} />}
    </g>
  )
}

function XAxis({ o, fr, x, label }: { o: ChartObj; fr: Frame; x: ScaleLinear<number, number>; label: string }) {
  const fs = o.fontSize
  return (
    <g>
      <path d={`M${f(fr.px0)} ${f(fr.py1)} H${f(fr.px1)}`} stroke={INK} strokeWidth={1.2} />
      {x.ticks(6).map((t) => (
        <g key={t}>
          <path d={`M${f(x(t))} ${f(fr.py1)} v${f(fs * 0.3)}`} stroke={INK} />
          <Label x={x(t)} y={fr.py1 + fs * 1.3} text={tickLabel(t)} size={fs * 0.9} family={o.fontFamily} anchor="middle" />
        </g>
      ))}
      {label && <Label x={(fr.px0 + fr.px1) / 2} y={o.y + o.h - fs * 0.4} text={label} size={fs} family={o.fontFamily} anchor="middle" />}
    </g>
  )
}

const yTickWidth = (o: ChartObj, y: ScaleLinear<number, number>) => Math.max(...y.ticks(5).map((t) => textWidth(tickLabel(t), o.fontSize * 0.9, o.fontFamily)), o.fontSize) + o.fontSize * 0.6

function Legend({ o, items, x, y }: { o: ChartObj; items: { name: string; color: string }[]; x: number; y: number }) {
  const fs = o.fontSize
  return (
    <g>
      {items.map((s, j) => (
        <g key={j}>
          <rect x={f(x)} y={f(y + j * fs * 1.4)} width={f(fs * 0.8)} height={f(fs * 0.8)} fill={s.color} />
          <Label x={x + fs * 1.1} y={y + j * fs * 1.4 + fs * 0.75} text={s.name} size={fs * 0.9} family={o.fontFamily} />
        </g>
      ))}
    </g>
  )
}

/** Vertical colour bar with min / max labels. */
function ColorBar({ o, x, y0, y1, lo, hi, scale }: { o: ChartObj; x: number; y0: number; y1: number; lo: number; hi: number; scale: (t: number) => string }) {
  const steps = 24
  const h = (y1 - y0) / steps
  return (
    <g>
      {Array.from({ length: steps }, (_, i) => (
        <rect key={i} x={f(x)} y={f(y0 + i * h)} width={f(o.fontSize * 0.8)} height={f(h + 0.5)} fill={scale(1 - i / (steps - 1))} />
      ))}
      <Label x={x + o.fontSize * 1.1} y={y0 + o.fontSize * 0.7} text={tickLabel(hi)} size={o.fontSize * 0.8} family={o.fontFamily} />
      <Label x={x + o.fontSize * 1.1} y={y1} text={tickLabel(lo)} size={o.fontSize * 0.8} family={o.fontFamily} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------
// Pie & donut: first column = labels, second column = values.

function Pie({ o }: { o: ChartObj }) {
  const fs = o.fontSize
  const color = (i: number) => o.colors[i] ?? PALETTE[i % PALETTE.length]
  const parts = o.data.rows
    .map((r, i) => ({ name: r[0] === null ? '' : String(r[0]), v: isNum(r[1]) ? Math.abs(r[1]) : 0, color: color(i) }))
    .filter((p) => p.v > 0)
  const total = parts.reduce((s, p) => s + p.v, 0) || 1
  const legendW = o.legend ? Math.max(0, ...parts.map((p) => textWidth(p.name, fs * 0.9, o.fontFamily))) + fs * 2.2 : 0
  const fr = frame(o, { left: fs * 0.6, bottom: fs * 0.6, right: legendW + fs * 0.6 })
  const cx = (fr.px0 + fr.px1) / 2
  const cy = (fr.py0 + fr.py1) / 2
  const r = Math.max(10, Math.min(fr.px1 - fr.px0, fr.py1 - fr.py0) / 2)
  const inner = o.kind === 'donut' ? r * 0.55 : 0
  const arcs = d3pie<(typeof parts)[number]>()
    .sort(null)
    .value((p) => p.v)(parts)
  const path = d3arc<(typeof arcs)[number]>().innerRadius(inner).outerRadius(r)
  const labelArc = d3arc<(typeof arcs)[number]>()
    .innerRadius(inner ? (inner + r) / 2 : r * 0.62)
    .outerRadius(inner ? (inner + r) / 2 : r * 0.62)
  return (
    <g>
      <Title o={o} fr={fr} />
      <g transform={`translate(${f(cx)} ${f(cy)})`}>
        {arcs.map((a, i) => (
          <path key={i} d={path(a) ?? ''} fill={a.data.color} stroke="#ffffff" strokeWidth={1.5} />
        ))}
        {(o.showValues ?? true) &&
          arcs.map((a, i) => {
            const pct = (a.data.v / total) * 100
            if (pct < 4) return null
            const [lx, ly] = labelArc.centroid(a)
            return <Label key={'l' + i} x={lx} y={ly + fs * 0.32} text={`${pct.toFixed(pct < 10 ? 1 : 0)}%`} size={fs * 0.85} family={o.fontFamily} anchor="middle" color={contrast(a.data.color)} bold />
          })}
      </g>
      {o.legend && <Legend o={o} items={parts} x={fr.px1 + fs * 0.8} y={cy - (parts.length * fs * 1.4) / 2} />}
    </g>
  )
}

// ---------------------------------------------------------------------------------------
// Heatmap: first column = row labels, header = column labels, cells = values.

function matrix(t: DataTable) {
  const colLabels = t.columns.slice(1)
  const rowLabels = t.rows.map((r) => (r[0] === null ? '' : String(r[0])))
  const values = t.rows.map((r) => colLabels.map((_, j) => (isNum(r[j + 1]) ? (r[j + 1] as number) : null)))
  return { colLabels, rowLabels, values }
}

function scaleFor(o: ChartObj, vals: number[]) {
  const [a, b] = extent(vals) as [number | undefined, number | undefined]
  let lo = o.yMin ?? a ?? 0
  let hi = o.yMax ?? b ?? 1
  if (o.colorScale === 'diverging' && o.yMin === null && o.yMax === null) {
    const m = Math.max(Math.abs(lo), Math.abs(hi))
    ;[lo, hi] = [-m, m]
  }
  if (lo === hi) hi = lo + 1
  const interp = SCALES[o.colorScale ?? 'viridis']
  return { lo, hi, interp, color: (v: number) => interp(Math.max(0, Math.min(1, (v - lo) / (hi - lo)))) }
}

function Heatmap({ o }: { o: ChartObj }) {
  const fs = o.fontSize
  const { colLabels, rowLabels, values } = matrix(o.data)
  const sc = scaleFor(o, values.flat().filter((v): v is number => v !== null))
  const rowW = Math.max(0, ...rowLabels.map((l) => textWidth(l, fs * 0.85, o.fontFamily))) + fs * 0.6
  const fr0 = frame(o, { left: rowW, bottom: fs, right: fs * 3.6 })
  const cw = (fr0.px1 - fr0.px0) / Math.max(1, colLabels.length)
  const widest = Math.max(0, ...colLabels.map((l) => textWidth(l, fs * 0.85, o.fontFamily)))
  const rotate = widest > cw * 0.95
  const fr = frame(o, { left: rowW, bottom: (rotate ? widest * 0.71 + fs : fs * 1.6) + (o.xLabel ? fs * 1.4 : 0), right: fs * 3.6 })
  const x = scaleBand<number>().domain(colLabels.map((_, i) => i)).range([fr.px0, fr.px1]).paddingInner(0.04)
  const y = scaleBand<number>().domain(rowLabels.map((_, i) => i)).range([fr.py0, fr.py1]).paddingInner(0.04)
  const parts: ReactNode[] = []
  values.forEach((row, i) =>
    row.forEach((v, j) => {
      const fill = v === null ? '#eeeeee' : sc.color(v)
      parts.push(<rect key={`${i}-${j}`} x={f(x(j)!)} y={f(y(i)!)} width={f(x.bandwidth())} height={f(y.bandwidth())} fill={fill} />)
      if (o.showValues && v !== null && y.bandwidth() > fs * 0.9) {
        parts.push(<Label key={`v${i}-${j}`} x={x(j)! + x.bandwidth() / 2} y={y(i)! + y.bandwidth() / 2 + fs * 0.3} text={tickLabel(Math.round(v * 100) / 100)} size={Math.min(fs * 0.8, y.bandwidth() * 0.6)} family={o.fontFamily} anchor="middle" color={contrast(fill)} />)
      }
    })
  )
  return (
    <g>
      <Title o={o} fr={fr} />
      {parts}
      {rowLabels.map((l, i) => (
        <Label key={'r' + i} x={fr.px0 - fs * 0.4} y={y(i)! + y.bandwidth() / 2 + fs * 0.3} text={l} size={fs * 0.85} family={o.fontFamily} anchor="end" />
      ))}
      {colLabels.map((l, j) =>
        rotate ? (
          <Label key={'c' + j} x={x(j)! + x.bandwidth() / 2 + fs * 0.3} y={fr.py1 + fs} text={l} size={fs * 0.85} family={o.fontFamily} anchor="end" rotate={-45} />
        ) : (
          <Label key={'c' + j} x={x(j)! + x.bandwidth() / 2} y={fr.py1 + fs * 1.1} text={l} size={fs * 0.85} family={o.fontFamily} anchor="middle" />
        )
      )}
      {o.xLabel && <Label x={(fr.px0 + fr.px1) / 2} y={o.y + o.h - fs * 0.4} text={o.xLabel} size={fs} family={o.fontFamily} anchor="middle" />}
      <ColorBar o={o} x={fr.px1 + fs * 0.8} y0={fr.py0} y1={fr.py1} lo={sc.lo} hi={sc.hi} scale={sc.interp} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------
// Well plates: either a grid (A, B, C… rows × 1, 2, 3… columns) or a list of "A1, value".

const PLATES: [number, number][] = [
  [2, 3],
  [3, 4],
  [4, 6],
  [6, 8],
  [8, 12],
  [16, 24]
]
const WELL = /^\s*([A-Pa-p])\s*0?(\d{1,2})\s*$/

export function plateData(t: DataTable): { rows: number; cols: number; values: (number | null)[][] } {
  const first = column(t, 0)
  const wells = first.filter((c) => typeof c === 'string' && WELL.test(c)).length
  const cells: { r: number; c: number; v: number | null }[] = []
  if (wells >= Math.max(1, first.filter((c) => c !== null).length * 0.6)) {
    // Long format: Well, Value.
    const vi = t.columns.findIndex((_, i) => i > 0 && numbers(column(t, i)).length > 0)
    t.rows.forEach((r) => {
      const m = typeof r[0] === 'string' ? r[0].match(WELL) : null
      if (m) cells.push({ r: m[1].toUpperCase().charCodeAt(0) - 65, c: Number(m[2]) - 1, v: vi > 0 && isNum(r[vi]) ? (r[vi] as number) : null })
    })
  } else {
    // Grid: optional row-letter column, then one column per plate column.
    const hasLetters = first.some((c) => typeof c === 'string' && /^[A-Pa-p]$/.test(c.trim()))
    const off = hasLetters ? 1 : 0
    t.rows.forEach((r, i) => r.slice(off).forEach((v, j) => cells.push({ r: i, c: j, v: isNum(v) ? v : null })))
  }
  const needR = Math.max(1, ...cells.map((c) => c.r + 1))
  const needC = Math.max(1, ...cells.map((c) => c.c + 1))
  const [rows, cols] = PLATES.find(([r, c]) => r >= needR && c >= needC) ?? [needR, needC]
  const values = Array.from({ length: rows }, () => Array<number | null>(cols).fill(null))
  for (const c of cells) if (c.r < rows && c.c < cols) values[c.r][c.c] = c.v
  return { rows, cols, values }
}

function Plate({ o }: { o: ChartObj }) {
  const fs = o.fontSize
  const { rows, cols, values } = plateData(o.data)
  const sc = scaleFor(o, values.flat().filter((v): v is number => v !== null))
  const fr = frame(o, { left: fs * 1.6, bottom: fs * 0.8, right: fs * 3.8 })
  const top = fr.py0 + fs * 1.4
  const pitch = Math.min((fr.px1 - fr.px0) / cols, (fr.py1 - top) / rows)
  const ox = fr.px0 + (fr.px1 - fr.px0 - pitch * cols) / 2
  const r = pitch * 0.42
  const parts: ReactNode[] = []
  values.forEach((row, i) =>
    row.forEach((v, j) => {
      const cx = ox + pitch * (j + 0.5)
      const cy = top + pitch * (i + 0.5)
      const fill = v === null ? '#ffffff' : sc.color(v)
      parts.push(<circle key={`${i}-${j}`} cx={f(cx)} cy={f(cy)} r={f(r)} fill={fill} stroke={v === null ? '#bbbbbb' : shade(fill.startsWith('#') ? fill : '#888888', -0.25)} strokeWidth={0.8} />)
      if (o.showValues && v !== null && r > fs * 0.55) {
        parts.push(<Label key={`v${i}-${j}`} x={cx} y={cy + fs * 0.25} text={tickLabel(Math.round(v * 100) / 100)} size={Math.min(fs * 0.7, r * 0.8)} family={o.fontFamily} anchor="middle" color={contrast(fill)} />)
      }
    })
  )
  return (
    <g>
      <Title o={o} fr={fr} />
      <rect x={f(ox - pitch * 0.25)} y={f(top - pitch * 0.25)} width={f(pitch * (cols + 0.5))} height={f(pitch * (rows + 0.5))} rx={f(pitch * 0.4)} fill="#f7f7f7" stroke="#999999" />
      {parts}
      {Array.from({ length: cols }, (_, j) => (
        <Label key={'c' + j} x={ox + pitch * (j + 0.5)} y={top - pitch * 0.35} text={String(j + 1)} size={Math.min(fs * 0.8, pitch * 0.6)} family={o.fontFamily} anchor="middle" />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <Label key={'r' + i} x={ox - pitch * 0.4} y={top + pitch * (i + 0.5) + fs * 0.28} text={String.fromCharCode(65 + i)} size={Math.min(fs * 0.8, pitch * 0.6)} family={o.fontFamily} anchor="end" />
      ))}
      <ColorBar o={o} x={fr.px1 + fs * 0.8} y0={top} y1={top + pitch * rows} lo={sc.lo} hi={sc.hi} scale={sc.interp} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------
// Kaplan–Meier survival: Time, Event (1 = event, 0 = censored), optional Group.

const EVENT_TRUE = /^(1|true|yes|y|dead|died|death|event|relapse)$/i

export function kaplanMeier(times: number[], events: boolean[]): { t: number; s: number; censored: boolean }[] {
  const d = times.map((t, i) => ({ t, e: events[i] })).sort((a, b) => a.t - b.t || Number(b.e) - Number(a.e))
  let atRisk = d.length
  let s = 1
  const out: { t: number; s: number; censored: boolean }[] = [{ t: 0, s: 1, censored: false }]
  for (let i = 0; i < d.length; ) {
    const t = d[i].t
    let deaths = 0
    let removed = 0
    while (i < d.length && d[i].t === t) {
      if (d[i].e) deaths++
      removed++
      i++
    }
    if (deaths) s *= 1 - deaths / atRisk
    out.push({ t, s, censored: deaths === 0 })
    atRisk -= removed
  }
  return out
}

function Survival({ o }: { o: ChartObj }) {
  const fs = o.fontSize
  const t = o.data
  const groups = new Map<string, { times: number[]; events: boolean[] }>()
  t.rows.forEach((r) => {
    if (!isNum(r[0])) return
    const g = t.columns.length > 2 && r[2] !== null ? String(r[2]) : 'All'
    const e = r[1]
    if (!groups.has(g)) groups.set(g, { times: [], events: [] })
    groups.get(g)!.times.push(r[0])
    groups.get(g)!.events.push(isNum(e) ? e !== 0 : typeof e === 'string' && EVENT_TRUE.test(e.trim()))
  })
  const curves = [...groups.entries()].map(([name, g], i) => ({ name, color: o.colors[i] ?? PALETTE[i % PALETTE.length], pts: kaplanMeier(g.times, g.events) }))
  const tmax = Math.max(1, ...curves.flatMap((c) => c.pts.map((p) => p.t)))
  const y = scaleLinear().domain([0, 100])
  const legendW = curves.length > 1 && o.legend ? Math.max(...curves.map((c) => textWidth(c.name, fs * 0.9, o.fontFamily))) + fs * 2.2 : 0
  const fr = frame(o, { left: yTickWidth(o, y) + fs * 1.9, bottom: fs * 3, right: legendW + fs * 0.8 })
  y.range([fr.py1, fr.py0])
  const x = scaleLinear().domain([0, tmax]).nice().range([fr.px0, fr.px1])
  return (
    <g>
      <Title o={o} fr={fr} />
      {curves.map((c, i) => {
        let d = `M${f(x(0))} ${f(y(100))}`
        let prev = 100
        for (const p of c.pts.slice(1)) {
          d += ` H${f(x(p.t))}`
          const s = p.s * 100
          if (s !== prev) d += ` V${f(y(s))}`
          prev = s
        }
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={c.color} strokeWidth={2} />
            {c.pts.filter((p) => p.censored).map((p, k) => (
              <path key={k} d={`M${f(x(p.t))} ${f(y(p.s * 100) - fs * 0.35)} v${f(fs * 0.7)}`} stroke={c.color} strokeWidth={1.5} />
            ))}
          </g>
        )
      })}
      <YAxis o={o} fr={fr} y={y} label={o.yLabel || 'Survival (%)'} />
      <XAxis o={o} fr={fr} x={x} label={o.xLabel || t.columns[0] || 'Time'} />
      {legendW > 0 && <Legend o={o} items={curves} x={fr.px1 + fs * 0.8} y={fr.py0} />}
    </g>
  )
}

// ---------------------------------------------------------------------------------------
// Histogram: each column's values binned; columns overlaid.

function Histogram({ o }: { o: ChartObj }) {
  const fs = o.fontSize
  const series = o.data.columns.map((name, i) => ({ name, color: o.colors[i] ?? PALETTE[i % PALETTE.length], values: numbers(column(o.data, i)) })).filter((s) => s.values.length)
  const all = series.flatMap((s) => s.values)
  const [lo, hi] = (extent(all) as [number, number] | [undefined, undefined])[0] === undefined ? [0, 1] : (extent(all) as [number, number])
  const x = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).nice()
  const binner = d3bin().domain(x.domain() as [number, number]).thresholds(x.ticks(o.bins ?? Math.ceil(Math.log2(Math.max(2, all.length / Math.max(1, series.length))) + 1)))
  const binned = series.map((s) => ({ ...s, bins: binner(s.values) }))
  const maxCount = Math.max(1, ...binned.flatMap((s) => s.bins.map((b) => b.length)))
  const y = scaleLinear().domain([0, maxCount]).nice()
  const legendW = series.length > 1 && o.legend ? Math.max(...series.map((s) => textWidth(s.name, fs * 0.9, o.fontFamily))) + fs * 2.2 : 0
  const fr = frame(o, { left: yTickWidth(o, y) + (o.yLabel ? fs * 1.9 : fs * 1.9), bottom: fs * 3, right: legendW + fs * 0.8 })
  x.range([fr.px0, fr.px1])
  y.range([fr.py1, fr.py0])
  return (
    <g>
      <Title o={o} fr={fr} />
      {binned.map((s, i) => (
        <g key={i} fill={s.color} fillOpacity={series.length > 1 ? 0.55 : 0.85} stroke={shade(s.color, -0.3)} strokeWidth={0.8}>
          {s.bins.map((b, k) => (b.length ? <rect key={k} x={f(x(b.x0!))} y={f(y(b.length))} width={f(Math.max(0, x(b.x1!) - x(b.x0!) - 0.5))} height={f(y(0) - y(b.length))} /> : null))}
        </g>
      ))}
      <YAxis o={o} fr={fr} y={y} label={o.yLabel || 'Count'} />
      <XAxis o={o} fr={fr} x={x} label={o.xLabel || (series.length === 1 ? series[0].name : 'Value')} />
      {legendW > 0 && <Legend o={o} items={series} x={fr.px1 + fs * 0.8} y={fr.py0} />}
    </g>
  )
}

// ---------------------------------------------------------------------------------------
// Volcano: Label, log2 fold change, p-value.

function Volcano({ o }: { o: ChartObj }) {
  const fs = o.fontSize
  const fcT = o.fcThreshold ?? 1
  const pT = o.pThreshold ?? 0.05
  const pts = o.data.rows
    .map((r) => ({ name: r[0] === null ? '' : String(r[0]), fc: r[1], p: r[2] }))
    .filter((d): d is { name: string; fc: number; p: number } => isNum(d.fc) && isNum(d.p) && d.p > 0)
    .map((d) => ({ ...d, y: -Math.log10(d.p), up: d.fc >= fcT && d.p < pT, down: d.fc <= -fcT && d.p < pT }))
  const xm = Math.max(1, ...pts.map((d) => Math.abs(d.fc)))
  const x = scaleLinear().domain([-xm, xm]).nice()
  const y = scaleLinear().domain([0, Math.max(1, ...pts.map((d) => d.y))]).nice()
  const fr = frame(o, { left: yTickWidth(o, y) + fs * 1.9, bottom: fs * 3 })
  x.range([fr.px0, fr.px1])
  y.range([fr.py1, fr.py0])
  const [upC, downC] = [o.colors[0] ?? '#d55e00', o.colors[1] ?? '#0072b2']
  const top = pts
    .filter((d) => d.up || d.down)
    .sort((a, b) => a.p - b.p)
    .slice(0, o.labelTop ?? 10)
  const r = Math.max(1.5, fs * 0.2)
  return (
    <g>
      <Title o={o} fr={fr} />
      <g stroke="#999999" strokeDasharray="4 3" strokeWidth={1}>
        <path d={`M${f(x(fcT))} ${f(fr.py0)} V${f(fr.py1)} M${f(x(-fcT))} ${f(fr.py0)} V${f(fr.py1)}`} />
        {-Math.log10(pT) <= y.domain()[1] && <path d={`M${f(fr.px0)} ${f(y(-Math.log10(pT)))} H${f(fr.px1)}`} />}
      </g>
      {pts.map((d, i) => (
        <circle key={i} cx={f(x(d.fc))} cy={f(y(d.y))} r={f(r)} fill={d.up ? upC : d.down ? downC : '#bbbbbb'} fillOpacity={d.up || d.down ? 0.9 : 0.5} />
      ))}
      {top.map((d, i) => (
        <Label key={'t' + i} x={x(d.fc) + (d.fc > 0 ? r * 1.6 : -r * 1.6)} y={y(d.y) - r} text={d.name} size={fs * 0.75} family={o.fontFamily} anchor={d.fc > 0 ? 'start' : 'end'} />
      ))}
      <YAxis o={o} fr={fr} y={y} label={o.yLabel || '−log₁₀ p-value'} />
      <XAxis o={o} fr={fr} x={x} label={o.xLabel || 'log₂ fold change'} />
    </g>
  )
}

// ---------------------------------------------------------------------------------------
// Mean ± error connected across groups (time courses with replicates per column).

function MeanLine({ o }: { o: ChartObj }) {
  const fs = o.fontSize
  const groups = o.data.columns.map((name, i) => ({ name, values: numbers(column(o.data, i)) }))
  const stats = groups.map((g) => ({ ...g, m: g.values.length ? mean(g.values) : NaN, e: errorOf(g.values, o.error) }))
  const vals = stats.flatMap((s) => (Number.isFinite(s.m) ? [s.m + s.e, s.m - s.e, ...(o.showPoints ? s.values : [])] : []))
  const y = scaleLinear().domain([o.yMin ?? Math.min(...vals, 0), o.yMax ?? Math.max(...vals, 1)])
  if (o.yMin === null && o.yMax === null) y.nice()
  const fr = frame(o, { left: yTickWidth(o, y) + (o.yLabel ? fs * 1.9 : fs * 0.4), bottom: fs * 1.6 + (o.xLabel ? fs * 1.6 : 0) })
  y.range([fr.py1, fr.py0])
  const x = scaleBand<number>().domain(groups.map((_, i) => i)).range([fr.px0, fr.px1]).padding(0.4)
  const color = o.colors[0] ?? PALETTE[0]
  const cx = (i: number) => x(i)! + x.bandwidth() / 2
  const ok = stats.map((s, i) => ({ s, i })).filter(({ s }) => Number.isFinite(s.m))
  return (
    <g>
      <Title o={o} fr={fr} />
      {o.showPoints &&
        stats.map((s, i) =>
          s.values.map((v, k) => <circle key={`${i}-${k}`} cx={f(cx(i) + jitter(k, i + 1) * x.bandwidth() * 0.25)} cy={f(y(v))} r={f(fs * 0.18)} fill={color} fillOpacity={0.35} />)
        )}
      <path d={'M' + ok.map(({ s, i }) => `${f(cx(i))} ${f(y(s.m))}`).join(' L')} fill="none" stroke={color} strokeWidth={2} />
      {ok.map(({ s, i }) => (
        <g key={i}>
          {s.e > 0 && <path d={`M${f(cx(i))} ${f(y(s.m - s.e))} V${f(y(s.m + s.e))} M${f(cx(i) - fs * 0.35)} ${f(y(s.m - s.e))} h${f(fs * 0.7)} M${f(cx(i) - fs * 0.35)} ${f(y(s.m + s.e))} h${f(fs * 0.7)}`} stroke={INK} strokeWidth={1.2} />}
          <circle cx={f(cx(i))} cy={f(y(s.m))} r={f(fs * 0.3)} fill={color} stroke="#ffffff" strokeWidth={1} />
        </g>
      ))}
      <YAxis o={o} fr={fr} y={y} label={o.yLabel} />
      <path d={`M${f(fr.px0)} ${f(fr.py1)} H${f(fr.px1)}`} stroke={INK} strokeWidth={1.2} />
      {groups.map((g, i) => (
        <Label key={'g' + i} x={cx(i)} y={fr.py1 + fs * 1.15} text={g.name} size={fs * 0.9} family={o.fontFamily} anchor="middle" />
      ))}
      {o.xLabel && <Label x={(fr.px0 + fr.px1) / 2} y={o.y + o.h - fs * 0.4} text={o.xLabel} size={fs} family={o.fontFamily} anchor="middle" />}
    </g>
  )
}

export function ExtraChart({ o }: { o: ChartObj }) {
  switch (o.kind) {
    case 'pie':
    case 'donut':
      return <Pie o={o} />
    case 'heatmap':
      return <Heatmap o={o} />
    case 'plate':
      return <Plate o={o} />
    case 'survival':
      return <Survival o={o} />
    case 'histogram':
      return <Histogram o={o} />
    case 'volcano':
      return <Volcano o={o} />
    case 'meanline':
      return <MeanLine o={o} />
    default:
      return null
  }
}
