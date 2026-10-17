import type { Pt } from './geometry'
import type { BrushKind, BrushObj } from './types'

// Brushes draw a repeating biological pattern along a path: lipid bilayers and monolayers,
// DNA double helices, bead filaments, or any icon repeated along a curve.

export interface BrushPreset {
  kind: BrushKind
  name: string
  spacing: number
  thickness: number
  colors: string[]
  /** Labels for each entry of `colors`, shown in the properties panel. */
  colorNames: string[]
}

export const BRUSH_PRESETS: BrushPreset[] = [
  { kind: 'bilayer', name: 'Lipid bilayer', spacing: 12, thickness: 44, colors: ['#e8a33d', '#c9b48a'], colorNames: ['Heads', 'Tails'] },
  { kind: 'monolayer', name: 'Lipid monolayer', spacing: 12, thickness: 24, colors: ['#e8a33d', '#c9b48a'], colorNames: ['Heads', 'Tails'] },
  { kind: 'dna', name: 'DNA double helix', spacing: 60, thickness: 28, colors: ['#2f5f8f', '#5aa0d8', '#e69f00', '#009e73', '#d55e00', '#cc79a7'], colorNames: ['Strand 1', 'Strand 2', 'A', 'T', 'G', 'C'] },
  { kind: 'beads', name: 'Filament / beads', spacing: 14, thickness: 14, colors: ['#56b4e9', '#0072b2'], colorNames: ['Bead 1', 'Bead 2'] },
  { kind: 'icon', name: 'Repeat an icon', spacing: 40, thickness: 40, colors: [], colorNames: [] }
]

export const presetFor = (kind: BrushKind): BrushPreset => BRUSH_PRESETS.find((p) => p.kind === kind)!

// ---------------------------------------------------------------------------------------
// Path geometry

/** The path's centerline as a dense polyline (Catmull–Rom smoothing when `smooth`). */
export function flattenPath(points: Pt[], closed: boolean, smooth: boolean): Pt[] {
  if (points.length < 2) return points.slice()
  if (!smooth || points.length < 3) return closed ? [...points, points[0]] : points.slice()
  const n = points.length
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))])
  const segs = closed ? n : n - 1
  const out: Pt[] = []
  const STEPS = 16
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      })
    }
  }
  out.push(closed ? at(0) : at(n - 1))
  return out
}

export interface PathSampler {
  length: number
  /** Position and unit tangent at arc length d. */
  at(d: number): { p: Pt; t: Pt }
}

export function sampler(poly: Pt[]): PathSampler {
  const cum = [0]
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y))
  const length = cum[cum.length - 1] ?? 0
  return {
    length,
    at(d) {
      if (poly.length < 2) return { p: poly[0] ?? { x: 0, y: 0 }, t: { x: 1, y: 0 } }
      const dd = Math.max(0, Math.min(length, d))
      let lo = 0
      let hi = cum.length - 1
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1
        if (cum[m] <= dd) lo = m
        else hi = m
      }
      const a = poly[lo]
      const b = poly[hi]
      const seg = cum[hi] - cum[lo] || 1
      const k = (dd - cum[lo]) / seg
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l = Math.hypot(dx, dy) || 1
      return { p: { x: a.x + dx * k, y: a.y + dy * k }, t: { x: dx / l, y: dy / l } }
    }
  }
}

/** Ramer–Douglas–Peucker simplification for freehand input. */
export function simplify(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const pa = points[a]
    const pb = points[b]
    const dx = pb.x - pa.x
    const dy = pb.y - pa.y
    const l = Math.hypot(dx, dy) || 1
    let best = -1
    let bestD = epsilon
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * points[i].x - dx * points[i].y + pb.x * pa.y - pb.y * pa.x) / l
      if (d > bestD) ((bestD = d), (best = i))
    }
    if (best >= 0) {
      keep[best] = 1
      stack.push([a, best], [best, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

export function circlePoints(cx: number, cy: number, rx: number, ry: number, n = 12): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }
  })
}

// ---------------------------------------------------------------------------------------
// Pattern layout: positions of each repeated unit along the path.

export interface Unit {
  p: Pt
  /** Tangent angle in degrees. */
  angle: number
  index: number
}

export function brushUnits(o: Pick<BrushObj, 'points' | 'closed' | 'smooth' | 'spacing'>): { units: Unit[]; poly: Pt[]; s: PathSampler } {
  const poly = flattenPath(o.points, o.closed, o.smooth)
  const s = sampler(poly)
  const spacing = Math.max(2, o.spacing)
  const count = Math.max(1, Math.floor(s.length / spacing + (o.closed ? 0 : 1)))
  // Spread units evenly so closed shapes meet without a seam.
  const step = o.closed ? s.length / count : count > 1 ? s.length / (count - 1) : 0
  const units: Unit[] = []
  for (let i = 0; i < count; i++) {
    const { p, t } = s.at(i * step)
    units.push({ p, angle: (Math.atan2(t.y, t.x) * 180) / Math.PI, index: i })
  }
  return { units, poly, s }
}
