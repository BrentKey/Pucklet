import type { Snapshot } from './doc'
import type { Pt } from './geometry'
import { center, normalizeAngle, rotate } from './geometry'
import type { FigObject, Id, LineObj, TextObj } from './types'
import { isBoxObj } from './types'
import { layoutText } from '../text/layout'

// Pure transforms. Each returns new versions of the affected objects keyed by id, so the same
// code drives the live preview during a drag and the final commit.

export type Changes = Map<Id, FigObject>

/** Objects that actually carry geometry for a selection: groups expand to their descendants. */
function leaves(snap: Snapshot, ids: Iterable<Id>): FigObject[] {
  const out = new Map<Id, FigObject>()
  const visit = (id: Id) => {
    const o = snap.get(id)
    if (!o) return
    if (o.type === 'group') snap.childIdsOf(id).forEach(visit)
    else out.set(id, o)
  }
  for (const id of ids) visit(id)
  return [...out.values()]
}

const movePt = (p: { x: number; y: number }, dx: number, dy: number) => ({ ...p, x: p.x + dx, y: p.y + dy })

export function translate(snap: Snapshot, ids: Iterable<Id>, dx: number, dy: number): Changes {
  const out: Changes = new Map()
  for (const o of leaves(snap, ids)) {
    if (o.type === 'line') {
      // Bound ends follow their target; only free ends move with the line.
      out.set(o.id, {
        ...o,
        start: o.start.bind ? o.start : movePt(o.start, dx, dy),
        end: o.end.bind ? o.end : movePt(o.end, dx, dy)
      })
    } else if (isBoxObj(o)) {
      out.set(o.id, { ...o, x: o.x + dx, y: o.y + dy })
    }
  }
  return out
}

export function withTextSize<T extends TextObj>(t: T): T {
  const l = layoutText(t)
  return { ...t, w: l.width, h: l.height }
}

/** Scale everything about `anchor` (used for multi-selection and group resizing). */
export function scaleAbout(snap: Snapshot, ids: Iterable<Id>, anchor: Pt, sx: number, sy: number): Changes {
  const out: Changes = new Map()
  const sp = (p: Pt) => ({ x: anchor.x + (p.x - anchor.x) * sx, y: anchor.y + (p.y - anchor.y) * sy })
  for (const o of leaves(snap, ids)) {
    if (o.type === 'line') {
      const s = Math.sqrt(Math.abs(sx * sy))
      out.set(o.id, {
        ...o,
        start: o.start.bind ? o.start : { ...o.start, ...sp(o.start) },
        end: o.end.bind ? o.end : { ...o.end, ...sp(o.end) },
        bend: o.bend * s
      })
      continue
    }
    if (!isBoxObj(o)) continue
    const c = sp(center(o))
    if (o.type === 'text') {
      const fontSize = Math.max(1, Math.round(o.fontSize * Math.sqrt(Math.abs(sx * sy)) * 10) / 10)
      const t = withTextSize({ ...o, fontSize })
      out.set(o.id, { ...t, x: c.x - t.w / 2, y: c.y - t.h / 2 })
      continue
    }
    const w = Math.max(1, o.w * Math.abs(sx))
    const h = Math.max(1, o.h * Math.abs(sy))
    out.set(o.id, { ...o, x: c.x - w / 2, y: c.y - h / 2, w, h })
  }
  return out
}

export function rotateAbout(snap: Snapshot, ids: Iterable<Id>, pivot: Pt, deg: number): Changes {
  const out: Changes = new Map()
  for (const o of leaves(snap, ids)) {
    if (o.type === 'line') {
      const r = (e: LineObj['start']) => (e.bind ? e : { ...e, ...rotate(e, deg, pivot) })
      out.set(o.id, { ...o, start: r(o.start), end: r(o.end) })
      continue
    }
    if (!isBoxObj(o)) continue
    const c = rotate(center(o), deg, pivot)
    out.set(o.id, { ...o, x: c.x - o.w / 2, y: c.y - o.h / 2, rotation: normalizeAngle(o.rotation + deg) })
  }
  return out
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/**
 * Resize one (possibly rotated) box by dragging a handle to `p`, keeping the opposite side fixed.
 * Works in the box's own rotated frame.
 */
export function resizeBox<T extends FigObject & { x: number; y: number; w: number; h: number; rotation: number }>(
  o: T,
  handle: Handle,
  p: Pt,
  keepAspect: boolean
): T {
  const c = center(o)
  const q = rotate(p, -o.rotation, c)
  let left = o.x
  let right = o.x + o.w
  let top = o.y
  let bottom = o.y + o.h
  const MIN = 2
  if (handle.includes('w')) left = Math.min(q.x, right - MIN)
  if (handle.includes('e')) right = Math.max(q.x, left + MIN)
  if (handle.includes('n')) top = Math.min(q.y, bottom - MIN)
  if (handle.includes('s')) bottom = Math.max(q.y, top + MIN)
  let w = right - left
  let h = bottom - top
  if (keepAspect) {
    const ratio = o.w / o.h
    if (handle === 'n' || handle === 's') w = h * ratio
    else if (handle === 'e' || handle === 'w') h = w / ratio
    else if (w / h > ratio) h = w / ratio
    else w = h * ratio
    // Re-anchor to the fixed side(s).
    if (handle.includes('w')) left = right - w
    else if (!handle.includes('e')) left = o.x + (o.w - w) / 2
    else right = left + w
    if (handle.includes('n')) top = bottom - h
    else if (!handle.includes('s')) top = o.y + (o.h - h) / 2
    else bottom = top + h
  }
  // New center in the rotated frame, mapped back to world space.
  const localCenter = { x: left + w / 2, y: top + h / 2 }
  const nc = rotate(localCenter, o.rotation, c)
  return { ...o, x: nc.x - w / 2, y: nc.y - h / 2, w, h }
}
