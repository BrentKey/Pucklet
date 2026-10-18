import { scaleBand, scaleLinear, scaleLog } from 'd3-scale'
import type { ScaleBand, ScaleContinuousNumeric } from 'd3-scale'
import { memo } from 'react'
import type { ReactNode } from 'react'
import { column, isNum, numbers } from '../model/data'
import { center } from '../model/geometry'
import { analyze, layoutBrackets } from '../model/significance'
import { boxStats, errorOf, jitter, kde, linearFit, mean } from '../model/stats'
import type { ChartObj } from '../model/types'
import { shade } from './Brush'
import type { RenderMode } from './Figure'
import { Label, textWidth } from './Label'
import { EXTRA_KINDS, ExtraChart } from './ChartExtra'

export const CHART_COLORS = ['#0072b2', '#e69f00', '#009e73', '#d55e00', '#cc79a7', '#56b4e9', '#f0e442', '#555555']

const GROUP_KINDS = new Set(['bar', 'dot', 'box', 'violin'])
const XY_KINDS = new Set(['scatter', 'line'])

const f = (n: number) => Math.round(n * 100) / 100

export function tickLabel(v: number): string {
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e5 || a < 1e-3) return v.toExponential(0).replace('e+', 'e')
  return String(Math.round(v * 1e6) / 1e6)
}

interface Series {
  name: string
  color: string
}

/** Everything a chart needs, derived once from its data. */
function prepare(o: ChartObj) {
  const t = o.data
  const color = (i: number) => o.colors[i] ?? CHART_COLORS[i % CHART_COLORS.length]
  if (GROUP_KINDS.has(o.kind)) {
    const groups = t.columns.map((name, i) => ({ name, color: color(i), values: numbers(column(t, i)) }))
    return { mode: 'groups' as const, groups }
  }
  if (XY_KINDS.has(o.kind)) {
    const xs = column(t, 0)
    const series = t.columns.slice(1).map((name, j) => {
      const pts: [number, number][] = []
      t.rows.forEach((r, k) => {
        const x = xs[k]
        const y = r[j + 1]
        if (isNum(x) && isNum(y)) pts.push([x, y])
      })
      if (o.kind === 'line') pts.sort((a, b) => a[0] - b[0])
      return { name, color: color(j), pts }
    })
    return { mode: 'xy' as const, xName: t.columns[0] ?? 'X', series }
  }
  // grouped / stacked: first column = category labels, other columns = series.
  const cats = t.rows.map((r) => (r[0] === null ? '' : String(r[0])))
  const series = t.columns.slice(1).map((name, j) => ({ name, color: color(j), values: t.rows.map((r) => (isNum(r[j + 1]) ? (r[j + 1] as number) : 0)) }))
  return { mode: 'cats' as const, cats, series }
}

export const ChartView = memo(function ChartView({ o, mode }: { o: ChartObj; mode: RenderMode }) {
  if (EXTRA_KINDS.has(o.kind)) {
    const c = center(o)
    return (
      <g data-id={mode === 'canvas' ? o.id : undefined} opacity={o.opacity < 1 ? o.opacity : undefined} transform={o.rotation ? `rotate(${o.rotation} ${c.x} ${c.y})` : undefined}>
        {mode === 'canvas' && <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="transparent" />}
        <ExtraChart o={o} />
      </g>
    )
  }
  return <BasicChart o={o} mode={mode} />
})

function BasicChart({ o, mode }: { o: ChartObj; mode: RenderMode }) {
  const d = prepare(o)
  const fs = o.fontSize
  const fam = o.fontFamily
  const ink = '#222222'

  // ---- Value (y) range
  let lo = Infinity
  let hi = -Infinity
  const take = (v: number) => {
    if (!Number.isFinite(v)) return
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (d.mode === 'groups') {
    for (const g of d.groups) {
      if (!g.values.length) continue
      const m = mean(g.values)
      const e = errorOf(g.values, o.error)
      if (o.kind === 'bar') take(0)
      take(m + e)
      take(m - e)
      if (o.showPoints || o.kind === 'dot' || o.kind === 'box' || o.kind === 'violin') g.values.forEach(take)
    }
  } else if (d.mode === 'cats') {
    take(0)
    d.cats.forEach((_, k) => {
      if (o.kind === 'stacked') {
        take(d.series.reduce((s, ser) => s + Math.max(0, ser.values[k]), 0))
        take(d.series.reduce((s, ser) => s + Math.min(0, ser.values[k]), 0))
      } else d.series.forEach((ser) => take(ser.values[k]))
    })
  } else {
    d.series.forEach((s) => s.pts.forEach((p) => take(p[1])))
  }
  if (lo === Infinity) ((lo = 0), (hi = 1))
  if (lo === hi) ((lo -= 1), (hi += 1))
  const useLog = o.logY && lo > 0
  const yDomain: [number, number] = [o.yMin ?? lo, o.yMax ?? hi]
  const y0: ScaleContinuousNumeric<number, number> = useLog ? scaleLog().domain(yDomain) : scaleLinear().domain(yDomain)
  if (o.yMin === null && o.yMax === null) y0.nice()
  const yTicks = useLog ? y0.ticks(4).filter((v) => /^[1]/.test(v.toExponential())) : y0.ticks(5)
  const yTickLabels = yTicks.map(tickLabel)

  // ---- Legend (multi-series charts)
  const series: Series[] = d.mode === 'groups' ? [] : d.series.map((s) => ({ name: s.name, color: s.color }))
  const showLegend = o.legend && series.length > 1
  const legendW = showLegend ? Math.max(...series.map((s) => textWidth(s.name, fs * 0.9, fam))) + fs * 2 : 0

  // ---- Margins
  const titleH = o.title ? fs * 1.8 : fs * 0.6
  // ---- Significance brackets: reserve room above the data for their stacked levels.
  const analysis = d.mode === 'groups' && o.stats ? analyze(o) : null
  const brackets = analysis && o.stats ? layoutBrackets(analysis.rows, o.stats) : []
  const statFs = fs * 0.85
  const tick = fs * 0.35
  const levelH = statFs * 0.95 + tick + fs * 0.35
  const statReserve = brackets.length ? (Math.max(...brackets.map((b) => b.level)) + 1) * levelH + fs * 0.2 : 0
  const yLabelW = o.yLabel ? fs * 1.6 : 0
  const yTickW = Math.max(...yTickLabels.map((l) => textWidth(l, fs * 0.9, fam)), fs) + fs * 0.6
  const left = yLabelW + yTickW + fs * 0.3
  const right = legendW + fs * 0.8

  // Category labels may need rotating when they don't fit their band.
  const catNames = d.mode === 'groups' ? d.groups.map((g) => g.name) : d.mode === 'cats' ? d.cats : []
  const plotW = Math.max(20, o.w - left - right)
  const band = catNames.length ? plotW / catNames.length : plotW
  const widest = Math.max(0, ...catNames.map((n) => textWidth(n, fs * 0.9, fam)))
  const rotateCats = catNames.length > 0 && widest > band * 0.92
  const xTickH = rotateCats ? widest * 0.71 + fs : fs * 1.5
  const bottom = xTickH + (o.xLabel || (d.mode === 'xy' && d.xName) ? fs * 1.6 : 0) + fs * 0.3
  const px0 = o.x + left
  const px1 = o.x + o.w - right
  const py0 = o.y + titleH
  const py1 = Math.max(py0 + 20, o.y + o.h - bottom)
  const y = y0.copy().range([py1, Math.min(py1 - 10, py0 + statReserve)])
  const Y = (v: number) => f(y(v))

  const parts: ReactNode[] = []
  const statParts: ReactNode[] = []
  const key = (() => {
    let n = 0
    return () => n++
  })()

  // ---- Data marks
  const dotR = Math.max(1.5, fs * 0.22)
  const pointsAt = (cx: number, width: number, values: number[], color: string, seed: number) =>
    values.map((v, i) => (
      <circle key={key()} cx={f(cx + jitter(i, seed) * width * 0.28)} cy={Y(v)} r={dotR} fill={color} fillOpacity={0.85} stroke={shade(color, -0.35)} strokeWidth={0.6} />
    ))
  const errorBar = (cx: number, m: number, e: number, w: number, color = ink) =>
    e > 0 ? (
      <path key={key()} d={`M${f(cx)} ${Y(m - e)} V${Y(m + e)} M${f(cx - w)} ${Y(m - e)} H${f(cx + w)} M${f(cx - w)} ${Y(m + e)} H${f(cx + w)}`} stroke={color} strokeWidth={1.2} fill="none" />
    ) : null

  let xAxis: ReactNode = null
  if (d.mode === 'groups' || d.mode === 'cats') {
    const x: ScaleBand<string> = scaleBand<string>()
      .domain(catNames.map((_, i) => String(i)))
      .range([px0, px1])
      .paddingInner(0.3)
      .paddingOuter(0.2)
    const bw = x.bandwidth()
    if (d.mode === 'groups') {
      d.groups.forEach((g, i) => {
        const cx = x(String(i))! + bw / 2
        if (!g.values.length) return
        const m = mean(g.values)
        const e = errorOf(g.values, o.error)
        if (o.kind === 'bar') {
          const base = useLog ? y.domain()[0] : 0
          const top = Math.min(Y(m), Y(base))
          parts.push(<rect key={key()} x={f(cx - bw / 2)} y={top} width={f(bw)} height={f(Math.abs(Y(base) - Y(m)))} fill={g.color} fillOpacity={0.85} stroke={shade(g.color, -0.3)} strokeWidth={1} />)
          if (o.showPoints) parts.push(...pointsAt(cx, bw, g.values, shade(g.color, -0.45), i + 1))
          parts.push(errorBar(cx, m, e, bw * 0.18))
        } else if (o.kind === 'dot') {
          parts.push(...pointsAt(cx, bw, g.values, g.color, i + 1))
          parts.push(<path key={key()} d={`M${f(cx - bw * 0.3)} ${Y(m)} H${f(cx + bw * 0.3)}`} stroke={ink} strokeWidth={2} />)
          parts.push(errorBar(cx, m, e, bw * 0.15))
        } else if (o.kind === 'box') {
          const b = boxStats(g.values)!
          const hw = bw * 0.35
          parts.push(
            <g key={key()} stroke={shade(g.color, -0.4)} strokeWidth={1.2}>
              <path d={`M${f(cx)} ${Y(b.lo)} V${Y(b.q1)} M${f(cx)} ${Y(b.q3)} V${Y(b.hi)} M${f(cx - hw / 2)} ${Y(b.lo)} H${f(cx + hw / 2)} M${f(cx - hw / 2)} ${Y(b.hi)} H${f(cx + hw / 2)}`} fill="none" />
              <rect x={f(cx - hw)} y={Y(b.q3)} width={f(hw * 2)} height={f(Math.max(0.5, Y(b.q1) - Y(b.q3)))} fill={g.color} fillOpacity={0.55} />
              <path d={`M${f(cx - hw)} ${Y(b.median)} H${f(cx + hw)}`} strokeWidth={2.2} />
            </g>
          )
          if (o.showPoints) parts.push(...pointsAt(cx, bw, g.values, shade(g.color, -0.3), i + 1))
          else b.outliers.forEach((v) => parts.push(<circle key={key()} cx={f(cx)} cy={Y(v)} r={dotR} fill="none" stroke={shade(g.color, -0.4)} />))
        } else {
          // Violin: mirrored density with the median and interquartile range.
          const [dlo, dhi] = [Math.min(...g.values), Math.max(...g.values)]
          const pad = (dhi - dlo) * 0.15 || 1
          const dens = kde(g.values, dlo - pad, dhi + pad)
          const peak = Math.max(...dens.map((p) => p[1])) || 1
          const half = bw * 0.48
          const side = dens.map(([v, dd]) => `${f(cx + (dd / peak) * half)} ${Y(v)}`)
          const other = dens.map(([v, dd]) => `${f(cx - (dd / peak) * half)} ${Y(v)}`).reverse()
          const b = boxStats(g.values)!
          parts.push(
            <g key={key()}>
              <path d={`M${side.join(' L')} L${other.join(' L')} Z`} fill={g.color} fillOpacity={0.5} stroke={shade(g.color, -0.35)} strokeWidth={1} />
              <path d={`M${f(cx)} ${Y(b.q1)} V${Y(b.q3)}`} stroke={ink} strokeWidth={4} />
              <circle cx={f(cx)} cy={Y(b.median)} r={dotR * 1.1} fill="#ffffff" stroke={ink} />
            </g>
          )
          if (o.showPoints) parts.push(...pointsAt(cx, bw * 0.6, g.values, shade(g.color, -0.3), i + 1))
        }
      })
      // Brackets: each sits above the data of the groups it spans and above any bracket below it.
      const dataTop = d.groups.map((g) => {
        if (!g.values.length) return py1
        const m = mean(g.values)
        const tops = o.kind === 'bar' || o.kind === 'dot' ? [m + errorOf(g.values, o.error), m] : []
        if (o.kind !== 'bar' || o.showPoints) tops.push(Math.max(...g.values))
        if (o.kind === 'violin') {
          // The density outline runs 15% of the range past the largest value.
          const [vlo, vhi] = [Math.min(...g.values), Math.max(...g.values)]
          tops.push(vhi + ((vhi - vlo) * 0.15 || 1))
        }
        if (o.kind === 'bar' && !useLog) tops.push(0)
        return Math.max(py0 + statReserve, Math.min(...tops.filter(Number.isFinite).map(y)) - (o.kind === 'bar' && !o.showPoints ? 0 : dotR))
      })
      const reach = dataTop.slice()
      for (const b of brackets) {
        const x1 = x(String(b.i))! + bw / 2 + bw * 0.04
        const x2 = x(String(b.j))! + bw / 2 - bw * 0.04
        const base = Math.min(...reach.slice(b.i, b.j + 1)) - fs * 0.3
        const yb = base - tick
        const isStars = !b.text.startsWith('p') && b.text !== 'ns'
        statParts.push(
          <g key={key()}>
            <path d={`M${f(x1)} ${f(base)} V${f(yb)} H${f(x2)} V${f(base)}`} stroke={ink} strokeWidth={1} fill="none" />
            <Label x={(x1 + x2) / 2} y={yb - (isStars ? -statFs * 0.15 : fs * 0.2)} text={b.text} size={isStars ? statFs * 1.15 : statFs} family={fam} anchor="middle" />
          </g>
        )
        for (let g = b.i; g <= b.j; g++) reach[g] = yb - levelH + tick + fs * 0.3
      }
    } else {
      const inner = scaleBand<string>()
        .domain(d.series.map((_, j) => String(j)))
        .range([0, bw])
        .paddingInner(0.08)
      d.cats.forEach((_, k) => {
        const bx = x(String(k))!
        let up = 0
        let down = 0
        d.series.forEach((s, j) => {
          const v = s.values[k]
          if (o.kind === 'stacked') {
            const from = v >= 0 ? up : down
            const to = from + v
            if (v >= 0) up = to
            else down = to
            parts.push(<rect key={key()} x={f(bx)} y={Math.min(Y(from), Y(to))} width={f(bw)} height={f(Math.abs(Y(to) - Y(from)))} fill={s.color} stroke="#ffffff" strokeWidth={0.8} />)
          } else {
            parts.push(<rect key={key()} x={f(bx + inner(String(j))!)} y={Math.min(Y(0), Y(v))} width={f(inner.bandwidth())} height={f(Math.abs(Y(v) - Y(0)))} fill={s.color} fillOpacity={0.9} stroke={shade(s.color, -0.3)} strokeWidth={0.8} />)
          }
        })
      })
    }
    // Category axis.
    xAxis = (
      <g key="xaxis">
        <path d={`M${f(px0)} ${f(py1)} H${f(px1)}`} stroke={ink} strokeWidth={1.2} />
        {catNames.map((name, i) => {
          const cx = x(String(i))! + bw / 2
          return rotateCats ? (
            <Label key={i} x={cx + fs * 0.3} y={py1 + fs * 1.1} text={name} size={fs * 0.9} family={fam} anchor="end" rotate={-45} />
          ) : (
            <Label key={i} x={cx} y={py1 + fs * 1.15} text={name} size={fs * 0.9} family={fam} anchor="middle" />
          )
        })}
      </g>
    )
  } else {
    // XY charts: numeric x axis.
    let xlo = Infinity
    let xhi = -Infinity
    d.series.forEach((s) => s.pts.forEach(([xv]) => ((xlo = Math.min(xlo, xv)), (xhi = Math.max(xhi, xv)))))
    if (xlo === Infinity) ((xlo = 0), (xhi = 1))
    if (xlo === xhi) ((xlo -= 1), (xhi += 1))
    const x = scaleLinear().domain([xlo, xhi]).nice().range([px0, px1])
    const X = (v: number) => f(x(v))
    d.series.forEach((s, j) => {
      if (o.kind === 'line' && s.pts.length > 1) {
        parts.push(<path key={key()} d={'M' + s.pts.map(([a, b]) => `${X(a)} ${Y(b)}`).join(' L')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />)
      }
      if (o.kind === 'scatter' || o.showPoints) {
        s.pts.forEach(([a, b]) => parts.push(<circle key={key()} cx={X(a)} cy={Y(b)} r={dotR * 1.1} fill={s.color} fillOpacity={0.85} stroke={shade(s.color, -0.35)} strokeWidth={0.6} />))
      }
      if (o.fit) {
        const fit = linearFit(
          s.pts.map((p) => p[0]),
          s.pts.map((p) => p[1])
        )
        if (fit) {
          const [a, b] = x.domain()
          parts.push(<path key={key()} d={`M${X(a)} ${Y(fit.intercept + fit.slope * a)} L${X(b)} ${Y(fit.intercept + fit.slope * b)}`} stroke={s.color} strokeWidth={1.5} strokeDasharray="6 4" />)
          parts.push(
            <Label key={key()} x={px1 - fs * 0.3} y={py0 + fs * (1 + j * 1.2)} anchor="end" text={`R² = ${fit.r2.toFixed(3)}`} size={fs * 0.8} family={fam} color={s.color} />
          )
        }
      }
    })
    xAxis = (
      <g key="xaxis">
        <path d={`M${f(px0)} ${f(py1)} H${f(px1)}`} stroke={ink} strokeWidth={1.2} />
        {x.ticks(6).map((t) => (
          <g key={t}>
            <path d={`M${X(t)} ${f(py1)} v${f(fs * 0.3)}`} stroke={ink} />
            <Label x={x(t)} y={py1 + fs * 1.3} text={tickLabel(t)} size={fs * 0.9} family={fam} anchor="middle" />
          </g>
        ))}
      </g>
    )
  }

  const c = center(o)
  const xTitle = o.xLabel || (d.mode === 'xy' ? d.xName : '')
  return (
    <g data-id={mode === 'canvas' ? o.id : undefined} opacity={o.opacity < 1 ? o.opacity : undefined} transform={o.rotation ? `rotate(${o.rotation} ${c.x} ${c.y})` : undefined}>
      {mode === 'canvas' && <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="transparent" />}
      <defs>
        <clipPath id={`plot-${o.id}`}>
          <rect x={px0 - dotR * 2} y={py0 - dotR * 2} width={px1 - px0 + dotR * 4} height={py1 - py0 + dotR * 4} />
        </clipPath>
      </defs>
      {o.title && <Label x={(px0 + px1) / 2} y={o.y + fs * 1.2} text={o.title} size={fs * 1.1} family={fam} anchor="middle" bold />}
      {/* Value axis */}
      <path d={`M${f(px0)} ${f(y.range()[1])} V${f(py1)}`} stroke={ink} strokeWidth={1.2} />
      {yTicks.map((t, i) => (
        <g key={'yt' + i}>
          <path d={`M${f(px0)} ${Y(t)} h${f(-fs * 0.3)}`} stroke={ink} />
          <Label x={px0 - fs * 0.45} y={Y(t) + fs * 0.32} text={yTickLabels[i]} size={fs * 0.9} family={fam} anchor="end" />
        </g>
      ))}
      {o.yLabel && <Label x={o.x + fs * 1.1} y={(py0 + py1) / 2} text={o.yLabel} size={fs} family={fam} anchor="middle" rotate={-90} />}
      <g clipPath={`url(#plot-${o.id})`}>{parts}</g>
      {statParts}
      {xAxis}
      {xTitle && <Label x={(px0 + px1) / 2} y={o.y + o.h - fs * 0.4} text={xTitle} size={fs} family={fam} anchor="middle" />}
      {showLegend &&
        series.map((s, j) => (
          <g key={'lg' + j}>
            <rect x={f(px1 + fs * 0.8)} y={f(py0 + j * fs * 1.4)} width={f(fs * 0.8)} height={f(fs * 0.8)} fill={s.color} />
            <Label x={px1 + fs * 1.9} y={py0 + j * fs * 1.4 + fs * 0.75} text={s.name} size={fs * 0.9} family={fam} />
          </g>
        ))}
    </g>
  )
}
