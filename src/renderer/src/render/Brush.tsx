import { memo } from 'react'
import { instanceMarkup } from '../assets/svg'
import { brushUnits } from '../model/brush'
import type { Pt } from '../model/geometry'
import type { Asset, BrushObj } from '../model/types'
import type { RenderMode } from './Figure'

const r2 = (n: number) => Math.round(n * 100) / 100

/** Darken (k < 0) or lighten (k > 0) a #rrggbb colour. */
export function shade(hex: string, k: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')
}

const polyD = (pts: Pt[], closed = false) =>
  pts.length ? 'M' + pts.map((p) => `${r2(p.x)} ${r2(p.y)}`).join(' L') + (closed ? ' Z' : '') : ''

/** One repeated unit, drawn centred at the origin with the path running along +x. */
function UnitShape({ o, asset, prefix }: { o: BrushObj; asset?: Asset; prefix: string }) {
  const s = Math.max(2, o.spacing)
  const T = Math.max(2, o.thickness)
  const [c0 = '#999999', c1 = '#cccccc'] = o.colors
  switch (o.kind) {
    case 'bilayer':
    case 'monolayer': {
      const r = Math.min(s * 0.46, T * (o.kind === 'bilayer' ? 0.17 : 0.3))
      const tw = Math.max(0.6, r * 0.3)
      const leaflet = (side: 1 | -1) => {
        const hy = side * (T / 2 - r)
        const inner = o.kind === 'bilayer' ? side * T * 0.04 : side * -(T / 2)
        return (
          <g key={side}>
            <path
              d={`M${r2(-r * 0.42)} ${r2(hy - side * r * 0.8)} L${r2(-r * 0.42)} ${r2(inner)} M${r2(r * 0.42)} ${r2(hy - side * r * 0.8)} L${r2(r * 0.42)} ${r2(inner)}`}
              stroke={c1}
              strokeWidth={r2(tw)}
              strokeLinecap="round"
              fill="none"
            />
            <circle cx={0} cy={r2(hy)} r={r2(r)} fill={c0} stroke={shade(c0, -0.3)} strokeWidth={r2(Math.max(0.4, r * 0.12))} />
          </g>
        )
      }
      if (o.kind === 'bilayer') return <g>{[leaflet(-1), leaflet(1)]}</g>
      return leaflet(o.flip ? 1 : -1)
    }
    case 'icon':
      return asset ? (
        <g dangerouslySetInnerHTML={{ __html: instanceMarkup(asset, { x: -s / 2, y: -T / 2, w: s, h: T }, {}, prefix + 'a') }} />
      ) : (
        <rect x={-s / 2} y={-T / 2} width={s} height={T} fill="#eee" stroke="#c33" strokeDasharray="3 2" />
      )
    default:
      return null
  }
}

function dnaPaths(o: BrushObj, s: ReturnType<typeof brushUnits>['s']) {
  const A = o.thickness / 2
  const lambda = Math.max(8, o.spacing)
  const strand = (phase: number): Pt[] => {
    const pts: Pt[] = []
    for (let d = 0; d <= s.length; d += 2) {
      const { p, t } = s.at(d)
      const off = A * Math.sin((2 * Math.PI * d) / lambda + phase) * (o.flip ? -1 : 1)
      pts.push({ x: p.x - t.y * off, y: p.y + t.x * off })
    }
    return pts
  }
  const rungs: { a: Pt; b: Pt; c: number }[] = []
  const step = lambda / 10
  for (let k = 0, d = step / 2; d < s.length; k++, d += step) {
    const { p, t } = s.at(d)
    const off = A * Math.sin((2 * Math.PI * d) / lambda) * (o.flip ? -1 : 1)
    if (Math.abs(off) < A * 0.15) continue
    rungs.push({ a: { x: p.x - t.y * off, y: p.y + t.x * off }, b: { x: p.x + t.y * off, y: p.y - t.x * off }, c: k % 4 })
  }
  return { s1: strand(0), s2: strand(Math.PI), rungs }
}

export const BrushView = memo(function BrushView({ o, asset, mode }: { o: BrushObj; asset?: Asset; mode: RenderMode }) {
  const { units, poly, s } = brushUnits(o)
  const prefix = 'b' + o.id
  const common = { 'data-id': mode === 'canvas' ? o.id : undefined, opacity: o.opacity < 1 ? o.opacity : undefined }
  const hit =
    mode === 'canvas' ? (
      <path d={polyD(poly, o.closed)} fill="none" stroke="transparent" strokeWidth={Math.max(o.thickness, 10)} strokeLinejoin="round" pointerEvents="stroke" />
    ) : null

  if (o.kind === 'dna') {
    const { s1, s2, rungs } = dnaPaths(o, s)
    const w = Math.max(1, o.thickness * 0.12)
    const [c0 = '#2f5f8f', c1 = '#5aa0d8', ...bases] = o.colors
    return (
      <g {...common}>
        {hit}
        <path d={polyD(s2)} fill="none" stroke={c1} strokeWidth={r2(w)} strokeLinecap="round" strokeLinejoin="round" />
        {rungs.map((r, i) => (
          <path key={i} d={polyD([r.a, r.b])} stroke={bases[r.c] ?? '#999999'} strokeWidth={r2(w * 0.7)} strokeLinecap="round" />
        ))}
        <path d={polyD(s1)} fill="none" stroke={c0} strokeWidth={r2(w)} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    )
  }

  if (o.kind === 'beads') {
    const rad = Math.min(o.spacing, o.thickness) / 2
    const [c0 = '#56b4e9', c1 = c0] = o.colors
    return (
      <g {...common}>
        {hit}
        {units.map((u) => {
          const c = u.index % 2 ? c1 : c0
          return <circle key={u.index} cx={r2(u.p.x)} cy={r2(u.p.y)} r={r2(rad)} fill={c} stroke={shade(c, -0.3)} strokeWidth={r2(Math.max(0.4, rad * 0.12))} />
        })}
      </g>
    )
  }

  // Membranes and repeated icons: draw the unit once, then reference it along the path.
  const unitId = `${prefix}-unit`
  return (
    <g {...common}>
      <defs>
        <g id={unitId}>
          <UnitShape o={o} asset={asset} prefix={prefix} />
        </g>
      </defs>
      {hit}
      {units.map((u) => (
        <use key={u.index} href={`#${unitId}`} transform={`translate(${r2(u.p.x)} ${r2(u.p.y)}) rotate(${r2(u.angle)})`} />
      ))}
    </g>
  )
})
