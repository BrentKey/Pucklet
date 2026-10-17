import type { Box, Cap, Endpoint, FigObject, Id, LineObj } from './types'
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

/** A fixed point on the outline (anchor in 0–1 box coordinates), pushed out by `pad` along the outline's normal. */
function anchoredPoint(t: Target, an: { x: number; y: number }, pad: number): Pt {
  const b = t.box
  const c = center(b)
  const q = { x: b.x + an.x * b.w, y: b.y + an.y * b.h }
  let n: Pt
  if (t.kind === 'ellipse') {
    const rx = Math.max(b.w / 2, 1e-6)
    const ry = Math.max(b.h / 2, 1e-6)
    n = norm({ x: (q.x - c.x) / (rx * rx), y: (q.y - c.y) / (ry * ry) })
  } else {
    const edges: [number, Pt][] = [
      [an.x * b.w, { x: -1, y: 0 }],
      [(1 - an.x) * b.w, { x: 1, y: 0 }],
      [an.y * b.h, { x: 0, y: -1 }],
      [(1 - an.y) * b.h, { x: 0, y: 1 }]
    ]
    n = edges.reduce((m, e) => (e[0] < m[0] ? e : m))[1]
  }
  return rotate(add(q, scale(n, pad)), b.rotation, c)
}

/** Where an endpoint sits before padding/aiming: anchor point, target centre, or free position. */
function endBase(e: Endpoint, t: Target | null): Pt {
  if (!t) return { x: e.x, y: e.y }
  return e.anchor ? anchoredPoint(t, e.anchor, 0) : center(t.box)
}

/** The points a connector aims between: anchors or centres of bound targets, or the free endpoint positions. */
export function lineAnchors(line: LineObj, scene: Lookup): { a: Pt; b: Pt } {
  return { a: endBase(line.start, targetOf(line.start.bind, scene)), b: endBase(line.end, targetOf(line.end.bind, scene)) }
}

/**
 * How an endpoint dropped at `p` should attach to object `o`, or null for "don't attach".
 * - Near the outline: pinned to that exact spot (anchor).
 * - Inside a small object (icons, labels, markers): attached to the whole object, aiming at its centre.
 * - Inside a large shape, away from its edge: not attached, so lines can be drawn on top of boxes and panels.
 */
export function bindingFor(o: FigObject, p: Pt, zoom: number): { anchor?: { x: number; y: number } } | null {
  if (!isBoxObj(o) || o.w <= 0 || o.h <= 0) return null
  const c = center(o)
  const q = rotate(p, -o.rotation, c)
  const tol = 10 / zoom
  let inside: boolean
  let edgeDist: number
  let proj: Pt
  if (o.type === 'ellipse') {
    const rx = o.w / 2
    const ry = o.h / 2
    const dx = q.x - c.x
    const dy = q.y - c.y
    const r = Math.hypot(dx / rx, dy / ry)
    inside = r <= 1
    const k = r > 1e-9 ? 1 / r : 0
    proj = r > 1e-9 ? { x: c.x + dx * k, y: c.y + dy * k } : { x: c.x + rx, y: c.y }
    edgeDist = dist(q, proj)
  } else {
    inside = q.x >= o.x && q.x <= o.x + o.w && q.y >= o.y && q.y <= o.y + o.h
    if (inside) {
      const d = [q.x - o.x, o.x + o.w - q.x, q.y - o.y, o.y + o.h - q.y]
      const m = Math.min(...d)
      const i = d.indexOf(m)
      proj = i === 0 ? { x: o.x, y: q.y } : i === 1 ? { x: o.x + o.w, y: q.y } : i === 2 ? { x: q.x, y: o.y } : { x: q.x, y: o.y + o.h }
      edgeDist = m
    } else {
      proj = { x: Math.min(Math.max(q.x, o.x), o.x + o.w), y: Math.min(Math.max(q.y, o.y), o.y + o.h) }
      edgeDist = dist(q, proj)
    }
  }
  const small = o.w * zoom < 160 && o.h * zoom < 160
  const anchor = { anchor: { x: round3((proj.x - o.x) / o.w), y: round3((proj.y - o.y) / o.h) } }
  if (o.type === 'rect' || o.type === 'ellipse') {
    if (edgeDist <= tol) return anchor
    return inside && small ? {} : null
  }
  // Icons and text have invisible bounding boxes: attach to the whole object when the end is
  // dropped on a small one, pin to the box edge when approached from outside.
  if (inside) return small ? {} : null
  return edgeDist <= tol ? (small ? {} : anchor) : null
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

export function resolveLine(line: LineObj, scene: Lookup): LineGeom {
  const ta = targetOf(line.start.bind, scene)
  const tb = targetOf(line.end.bind, scene)
  const { a, b } = lineAnchors(line, scene)
  const pad = line.padding
  // Pinned ends never move when the other end does; unpinned bound ends aim across the line.
  const fixed1 = ta && line.start.anchor ? anchoredPoint(ta, line.start.anchor, pad) : null
  const fixed2 = tb && line.end.anchor ? anchoredPoint(tb, line.end.anchor, pad) : null

  if (line.route === 'elbow') {
    const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
    const attach = (t: Target | null, fixed: Pt | null, from: Pt, other: Pt): Pt => {
      if (fixed) return fixed
      if (!t) return from
      const r = rectOfPoints(boxCorners(t.box))
      const c = center(r)
      if (horizontal) return { x: other.x >= c.x ? r.x + r.w + pad : r.x - pad, y: c.y }
      return { x: c.x, y: other.y >= c.y ? r.y + r.h + pad : r.y - pad }
    }
    const p1 = attach(ta, fixed1, a, b)
    const p2 = attach(tb, fixed2, b, a)
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
    const p1 = fixed1 ?? (ta ? boundaryPoint(ta, ctrl, pad) : a)
    const p2 = fixed2 ?? (tb ? boundaryPoint(tb, ctrl, pad) : b)
    const dir1 = norm(sub(p1, ctrl))
    const dir2 = norm(sub(p2, ctrl))
    const s1 = sub(p1, scale(dir1, capInset(line.startCap, line.strokeWidth)))
    const s2 = sub(p2, scale(dir2, capInset(line.endCap, line.strokeWidth)))
    const d = `M${f(s1.x)} ${f(s1.y)} Q${f(ctrl.x)} ${f(ctrl.y)} ${f(s2.x)} ${f(s2.y)}`
    // Midpoint of the quadratic, used for the bend handle and bounds.
    const peak = { x: 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y }
    return { p1, p2, d, pts: [p1, peak, p2], dir1, dir2, ctrl }
  }

  const p1 = fixed1 ?? (ta ? boundaryPoint(ta, fixed2 ?? b, pad) : a)
  const p2 = fixed2 ?? (tb ? boundaryPoint(tb, fixed1 ?? a, pad) : b)
  const dir2 = norm(sub(p2, p1))
  const dir1 = scale(dir2, -1)
  const total = dist(p1, p2)
  const i1 = Math.min(capInset(line.startCap, line.strokeWidth), total / 2)
  const i2 = Math.min(capInset(line.endCap, line.strokeWidth), total / 2)
  const s1 = sub(p1, scale(dir1, i1))
  const s2 = sub(p2, scale(dir2, i2))
  return { p1, p2, d: `M${f(s1.x)} ${f(s1.y)} L${f(s2.x)} ${f(s2.y)}`, pts: [p1, p2], dir1, dir2 }
}

/** Where a connector's label sits: the middle of the path. */
export function lineMidpoint(g: LineGeom): Pt {
  if (g.pts.length === 3) return g.pts[1] // curved: the peak
  if (g.pts.length === 4) return mid(g.pts[1], g.pts[2]) // elbow: middle segment
  return mid(g.p1, g.p2)
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
