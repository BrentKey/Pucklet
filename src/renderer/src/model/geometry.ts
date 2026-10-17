import type { Box, Cap, FigObject, Id, LineObj } from './types'
import { isBoxObj } from './types'
import { flattenPath } from './brush'

export interface Pt {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Read access to the document that geometry helpers need. */
export interface Lookup {
  get(id: Id): FigObject | undefined
  children(id: Id): FigObject[]
}

const DEG = Math.PI / 180

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s })
export const len = (a: Pt): number => Math.hypot(a.x, a.y)
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

export function norm(a: Pt): Pt {
  const l = len(a)
  return l < 1e-9 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l }
}

export function rotate(p: Pt, deg: number, about: Pt = { x: 0, y: 0 }): Pt {
  if (!deg) return p
  const r = deg * DEG
  const c = Math.cos(r)
  const s = Math.sin(r)
  const dx = p.x - about.x
  const dy = p.y - about.y
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c }
}

export const center = (b: Box | Rect): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

export function boxCorners(b: Box): Pt[] {
  const c = center(b)
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h }
  ].map((p) => rotate(p, b.rotation, c))
}

export function rectOfPoints(pts: Pt[]): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null
  return rectOfPoints(rects.flatMap((r) => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]))
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
}

/** Point inside a (possibly rotated) box. */
export function boxContains(b: Box, p: Pt, pad = 0): boolean {
  const q = rotate(p, -b.rotation, center(b))
  return q.x >= b.x - pad && q.x <= b.x + b.w + pad && q.y >= b.y - pad && q.y <= b.y + b.h + pad
}

// ---------------------------------------------------------------------------------------
// Lines and connectors

export interface LineGeom {
  p1: Pt
  p2: Pt
  /** Path for the stroke, already shortened where a cap covers the end. */
  d: string
  /** Every point that defines the path (for bounds and handles). */
  pts: Pt[]
  /** Unit direction the line travels as it arrives at each end (pointing outward). */
  dir1: Pt
  dir2: Pt
  /** Quadratic control point for curved routes. */
  ctrl?: Pt
}

export const capSize = (strokeWidth: number): number => 5 + strokeWidth * 3

/** Shape used for attaching connectors to an object. */
interface Target {
  kind: 'rect' | 'ellipse'
  box: Box
}

function targetOf(id: Id | undefined, scene: Lookup): Target | null {
  if (!id) return null
  const o = scene.get(id)
  if (!o) return null
  if (o.type === 'ellipse') return { kind: 'ellipse', box: o }
  if (isBoxObj(o)) return { kind: 'rect', box: o }
  if (o.type === 'group') {
    const r = objectBounds(o, scene)
    return r ? { kind: 'rect', box: { ...r, rotation: 0 } } : null
  }
  return null
}

/** Where a ray from the target's center toward `toward` leaves its outline, pushed out by `pad`. */
function boundaryPoint(t: Target, toward: Pt, pad: number): Pt {
  const c = center(t.box)
  const local = rotate(toward, -t.box.rotation, c)
  const d = norm(sub(local, c))
  const hw = t.box.w / 2
  const hh = t.box.h / 2
  let s: number
  if (t.kind === 'ellipse') {
    s = 1 / Math.sqrt((d.x / Math.max(hw, 1e-6)) ** 2 + (d.y / Math.max(hh, 1e-6)) ** 2)
  } else {
    const sx = Math.abs(d.x) > 1e-9 ? hw / Math.abs(d.x) : Infinity
    const sy = Math.abs(d.y) > 1e-9 ? hh / Math.abs(d.y) : Infinity
    s = Math.min(sx, sy)
  }
  return rotate(add(c, scale(d, s + pad)), t.box.rotation, c)
}

function capInset(cap: Cap, strokeWidth: number): number {
  return cap === 'arrow' || cap === 'diamond' ? capSize(strokeWidth) * 0.8 : 0
}

const f = (n: number): string => String(Math.round(n * 100) / 100)

/** The points a connector aims between: centers of bound targets, or the free endpoint positions. */
export function lineAnchors(line: LineObj, scene: Lookup): { a: Pt; b: Pt } {
  const ta = targetOf(line.start.bind, scene)
  const tb = targetOf(line.end.bind, scene)
  return {
    a: ta ? center(ta.box) : { x: line.start.x, y: line.start.y },
    b: tb ? center(tb.box) : { x: line.end.x, y: line.end.y }
  }
}

export function resolveLine(line: LineObj, scene: Lookup): LineGeom {
  const ta = targetOf(line.start.bind, scene)
  const tb = targetOf(line.end.bind, scene)
  const { a, b } = lineAnchors(line, scene)
  const pad = line.padding

  if (line.route === 'elbow') {
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
    const attach = (t: Target | null, from: Pt, other: Pt): Pt => {
      if (!t) return from
      const r = rectOfPoints(boxCorners(t.box))
      const c = center(r)
      if (horizontal) return { x: other.x >= c.x ? r.x + r.w + pad : r.x - pad, y: c.y }
      return { x: c.x, y: other.y >= c.y ? r.y + r.h + pad : r.y - pad }
    }
    const p1 = attach(ta, a, b)
    const p2 = attach(tb, b, a)
    const pts = horizontal
      ? [p1, { x: (p1.x + p2.x) / 2, y: p1.y }, { x: (p1.x + p2.x) / 2, y: p2.y }, p2]
      : [p1, { x: p1.x, y: (p1.y + p2.y) / 2 }, { x: p2.x, y: (p1.y + p2.y) / 2 }, p2]
    const dir1 = norm(sub(pts[0], pts[1]))
    const dir2 = norm(sub(pts[3], pts[2]))
    const drawn = pts.slice()
    drawn[0] = sub(p1, scale(dir1, Math.min(capInset(line.startCap, line.strokeWidth), dist(pts[0], pts[1]))))
    drawn[3] = sub(p2, scale(dir2, Math.min(capInset(line.endCap, line.strokeWidth), dist(pts[3], pts[2]))))
    const d = 'M' + drawn.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L')
    return { p1, p2, d, pts, dir1, dir2 }
  }

  if (line.route === 'curved' && Math.abs(line.bend) > 0.5) {
    const m = mid(a, b)
    const n = norm({ x: -(b.y - a.y), y: b.x - a.x })
    const ctrl = add(m, scale(n, line.bend))
    const p1 = ta ? boundaryPoint(ta, ctrl, pad) : a
    const p2 = tb ? boundaryPoint(tb, ctrl, pad) : b
    const dir1 = norm(sub(p1, ctrl))
    const dir2 = norm(sub(p2, ctrl))
    const s1 = sub(p1, scale(dir1, capInset(line.startCap, line.strokeWidth)))
    const s2 = sub(p2, scale(dir2, capInset(line.endCap, line.strokeWidth)))
    const d = `M${f(s1.x)} ${f(s1.y)} Q${f(ctrl.x)} ${f(ctrl.y)} ${f(s2.x)} ${f(s2.y)}`
    // Midpoint of the quadratic, used for the bend handle and bounds.
    const peak = { x: 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y }
    return { p1, p2, d, pts: [p1, peak, p2], dir1, dir2, ctrl }
  }

  const p1 = ta ? boundaryPoint(ta, b, pad) : a
  const p2 = tb ? boundaryPoint(tb, a, pad) : b
  const dir2 = norm(sub(p2, p1))
  const dir1 = scale(dir2, -1)
  const total = dist(p1, p2)
  const i1 = Math.min(capInset(line.startCap, line.strokeWidth), total / 2)
  const i2 = Math.min(capInset(line.endCap, line.strokeWidth), total / 2)
  const s1 = sub(p1, scale(dir1, i1))
  const s2 = sub(p2, scale(dir2, i2))
  return { p1, p2, d: `M${f(s1.x)} ${f(s1.y)} L${f(s2.x)} ${f(s2.y)}`, pts: [p1, p2], dir1, dir2 }
}

/** SVG path data for an end cap at `tip` pointing along `dir`. Filled caps use `fill`. */
export function capPath(cap: Cap, tip: Pt, dir: Pt, strokeWidth: number): { d: string; filled: boolean } | null {
  if (cap === 'none') return null
  const s = capSize(strokeWidth)
  const back = (k: number) => sub(tip, scale(dir, s * k))
  const n = { x: -dir.y, y: dir.x }
  const side = (p: Pt, k: number) => add(p, scale(n, s * k))
  const P = (p: Pt) => `${f(p.x)} ${f(p.y)}`
  switch (cap) {
    case 'arrow': {
      const b = back(1)
      return { d: `M${P(tip)} L${P(side(b, 0.5))} L${P(side(b, -0.5))} Z`, filled: true }
    }
    case 'open': {
      const b = back(1)
      return { d: `M${P(side(b, 0.5))} L${P(tip)} L${P(side(b, -0.5))}`, filled: false }
    }
    case 'bar':
      return { d: `M${P(side(tip, 0.6))} L${P(side(tip, -0.6))}`, filled: false }
    case 'dot': {
      const r = s * 0.35
      const c = back(0.35)
      return { d: `M${f(c.x - r)} ${f(c.y)} a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`, filled: true }
    }
    case 'diamond': {
      const m = back(0.5)
      return { d: `M${P(tip)} L${P(side(m, 0.35))} L${P(back(1))} L${P(side(m, -0.35))} Z`, filled: true }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Bounds

export function objectBounds(o: FigObject, scene: Lookup): Rect | null {
  if (isBoxObj(o)) return rectOfPoints(boxCorners(o))
  if (o.type === 'line') {
    const g = resolveLine(o, scene)
    return rectOfPoints(g.pts)
  }
  if (o.type === 'brush') {
    const r = rectOfPoints(flattenPath(o.points, o.closed, o.smooth))
    const pad = o.thickness / 2
    return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }
  }
  return unionRects(
    scene
      .children(o.id)
      .map((c) => objectBounds(c, scene))
      .filter((r): r is Rect => !!r)
  )
}

export function snapAngle(deg: number, step = 15): number {
  return Math.round(deg / step) * step
}

export function normalizeAngle(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return Math.round(d * 1000) / 1000
}
