import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'
import type { FigureDoc, Snapshot, Tx } from './doc'
import { newId } from './doc'
import type { Rect } from './geometry'
import { center, objectBounds, resolveLine, unionRects } from './geometry'
import { translate } from './transform'
import type { Asset, FigObject, GroupObj, Id, LineObj } from './types'
import { isBoxObj } from './types'

export function applyChanges(tx: Tx, changes: Map<Id, FigObject>): void {
  for (const o of changes.values()) tx.put(o)
}

/** Selection bounds in artboard space. */
export function boundsOf(snap: Snapshot, ids: Iterable<Id>): Rect | null {
  return unionRects(
    [...ids]
      .map((id) => snap.get(id))
      .filter((o): o is FigObject => !!o)
      .map((o) => objectBounds(o, snap))
      .filter((r): r is Rect => !!r)
  )
}

/** Fix line endpoints that point at objects about to disappear: freeze them where they are. */
function detachLines(tx: Tx, snap: Snapshot, removed: Set<Id>): void {
  for (const o of snap.objects.values()) {
    if (o.type !== 'line' || removed.has(o.id)) continue
    const sb = o.start.bind && removed.has(o.start.bind)
    const eb = o.end.bind && removed.has(o.end.bind)
    if (!sb && !eb) continue
    const g = resolveLine(o, snap)
    tx.put({
      ...o,
      start: sb ? { x: g.p1.x, y: g.p1.y } : o.start,
      end: eb ? { x: g.p2.x, y: g.p2.y } : o.end
    })
  }
}

export function deleteObjects(doc: FigureDoc, ids: Id[]): void {
  if (!ids.length) return
  doc.transact((tx) => {
    const snap = tx.snap
    const removed = new Set([...ids, ...snap.descendants(ids)])
    // Groups left empty disappear too.
    for (const id of ids) {
      let p = snap.parentOf(id)
      while (p && snap.childIdsOf(p).every((c) => removed.has(c))) {
        removed.add(p)
        p = snap.parentOf(p)
      }
    }
    detachLines(tx, snap, removed)
    for (const id of removed) tx.remove(id)
  })
}

export function groupObjects(doc: FigureDoc, ids: Id[]): Id | null {
  const snap = doc.snapshot()
  const members = ids.map((id) => snap.get(id)).filter((o): o is FigObject => !!o)
  if (members.length < 2) return null
  const parent = snap.parentOf(members[0].id)
  if (members.some((m) => snap.parentOf(m.id) !== parent)) return null
  const top = members.reduce((a, b) => (a.z > b.z ? a : b))
  const group: GroupObj = { id: newId(), type: 'group', z: top.z, opacity: 1, ...(parent ? { parentId: parent } : {}) }
  doc.transact((tx) => {
    tx.add(group)
    for (const m of members) tx.update(m.id, { parentId: group.id })
  })
  return group.id
}

export function ungroupObjects(doc: FigureDoc, ids: Id[]): Id[] {
  const snap = doc.snapshot()
  const freed: Id[] = []
  doc.transact((tx) => {
    for (const id of ids) {
      const g = snap.get(id)
      if (!g || g.type !== 'group') continue
      const parent = snap.parentOf(id)
      const siblings = snap.childIdsOf(parent)
      const next = siblings[siblings.indexOf(id) + 1]
      const kids = snap.childIdsOf(id)
      const keys = generateNKeysBetween(g.z, next ? snap.get(next)!.z : null, kids.length)
      kids.forEach((k, i) => {
        const o = snap.get(k)!
        const { parentId: _p, ...rest } = o
        void _p
        tx.put({ ...rest, ...(parent ? { parentId: parent } : {}), z: keys[i] } as FigObject)
        freed.push(k)
      })
      tx.remove(id)
    }
  })
  return freed
}

export type ZMove = 'front' | 'back' | 'forward' | 'backward'

export function reorder(doc: FigureDoc, ids: Id[], move: ZMove): void {
  const snap = doc.snapshot()
  const byParent = new Map<Id | '', Set<Id>>()
  for (const id of ids) {
    if (!snap.get(id)) continue
    const p = snap.parentOf(id)
    if (!byParent.has(p)) byParent.set(p, new Set())
    byParent.get(p)!.add(id)
  }
  doc.transact((tx) => {
    for (const [parent, sel] of byParent) {
      const order = [...snap.childIdsOf(parent)]
      if (move === 'front') order.sort((a, b) => Number(sel.has(a)) - Number(sel.has(b)))
      else if (move === 'back') order.sort((a, b) => Number(sel.has(b)) - Number(sel.has(a)))
      else if (move === 'forward') {
        for (let i = order.length - 2; i >= 0; i--) {
          if (sel.has(order[i]) && !sel.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]]
        }
      } else {
        for (let i = 1; i < order.length; i++) {
          if (sel.has(order[i]) && !sel.has(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]]
        }
      }
      const keys = generateNKeysBetween(null, null, order.length)
      order.forEach((id, i) => {
        if (snap.get(id)!.z !== keys[i]) tx.update(id, { z: keys[i] })
      })
    }
  })
}

export function setLocked(doc: FigureDoc, ids: Id[], locked: boolean): void {
  doc.transact((tx) => ids.forEach((id) => tx.update(id, { locked })))
}

export function setHidden(doc: FigureDoc, ids: Id[], hidden: boolean): void {
  doc.transact((tx) => ids.forEach((id) => tx.update(id, { hidden })))
}

/**
 * Moves objects under `parent` (a group id, or '' for top level), placed just below `before`
 * in paint order (null = on top). Coordinates are absolute, so nothing moves on the canvas.
 */
export function moveInto(doc: FigureDoc, ids: Id[], parent: Id | '', before: Id | null): void {
  const snap = doc.snapshot()
  // A group can't go inside itself or one of its descendants.
  if (parent && ids.some((id) => id === parent || snap.descendants([id]).includes(parent))) return
  const siblings = snap.childIdsOf(parent).filter((id) => !ids.includes(id))
  const idx = before ? siblings.indexOf(before) : siblings.length
  if (idx < 0) return
  const lo = idx > 0 ? snap.get(siblings[idx - 1])!.z : null
  const hi = idx < siblings.length ? snap.get(siblings[idx])!.z : null
  const moving = ids.map((id) => snap.get(id)).filter((o): o is FigObject => !!o).sort((a, b) => (a.z < b.z ? -1 : 1))
  const keys = generateNKeysBetween(lo, hi, moving.length)
  const oldParents = new Set(moving.map((o) => snap.parentOf(o.id)))
  doc.transact((tx) => {
    moving.forEach((o, i) => {
      const { parentId: _p, ...rest } = o
      void _p
      tx.put({ ...rest, ...(parent ? { parentId: parent } : {}), z: keys[i] } as FigObject)
    })
    // Groups emptied by the move are removed.
    for (const p of oldParents) {
      if (p && p !== parent && tx.snap.childIdsOf(p).length === 0) tx.remove(p)
    }
  })
}

// ---------------------------------------------------------------------------------------
// Align & distribute

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

export function align(doc: FigureDoc, ids: Id[], mode: AlignMode, to?: Rect): void {
  const snap = doc.snapshot()
  const target = to ?? boundsOf(snap, ids)
  if (!target) return
  doc.transact((tx) => {
    for (const id of ids) {
      const b = boundsOf(snap, [id])
      if (!b) continue
      let dx = 0
      let dy = 0
      if (mode === 'left') dx = target.x - b.x
      if (mode === 'hcenter') dx = target.x + target.w / 2 - (b.x + b.w / 2)
      if (mode === 'right') dx = target.x + target.w - (b.x + b.w)
      if (mode === 'top') dy = target.y - b.y
      if (mode === 'vcenter') dy = target.y + target.h / 2 - (b.y + b.h / 2)
      if (mode === 'bottom') dy = target.y + target.h - (b.y + b.h)
      if (dx || dy) applyChanges(tx, translate(snap, [id], dx, dy))
    }
  })
}

export function distribute(doc: FigureDoc, ids: Id[], axis: 'h' | 'v'): void {
  const snap = doc.snapshot()
  const items = ids
    .map((id) => ({ id, b: boundsOf(snap, [id]) }))
    .filter((i): i is { id: Id; b: Rect } => !!i.b)
  if (items.length < 3) return
  const pos = (r: Rect) => (axis === 'h' ? r.x : r.y)
  const size = (r: Rect) => (axis === 'h' ? r.w : r.h)
  items.sort((a, b) => pos(a.b) - pos(b.b))
  const first = items[0].b
  const last = items[items.length - 1].b
  const span = pos(last) + size(last) - pos(first)
  const gap = (span - items.reduce((s, i) => s + size(i.b), 0)) / (items.length - 1)
  doc.transact((tx) => {
    let cursor = pos(first)
    for (const { id, b } of items) {
      const d = cursor - pos(b)
      if (Math.abs(d) > 0.01) applyChanges(tx, translate(snap, [id], axis === 'h' ? d : 0, axis === 'v' ? d : 0))
      cursor += size(b) + gap
    }
  })
}

// ---------------------------------------------------------------------------------------
// Copy / paste / duplicate

export interface Clip {
  objects: FigObject[]
  assets: Asset[]
}

/** Copies the given objects with their descendants and the assets they use. */
export function copyObjects(snap: Snapshot, ids: Id[]): Clip {
  const all = new Set([...ids, ...snap.descendants(ids)])
  const objects: FigObject[] = []
  for (const id of all) {
    const o = snap.get(id)
    if (!o) continue
    if (o.type === 'line') {
      // Ends bound to objects outside the copy are frozen at their current position.
      const g = resolveLine(o, snap)
      const fix = (e: LineObj['start'], p: { x: number; y: number }) =>
        e.bind && !all.has(e.bind) ? { x: p.x, y: p.y } : { ...e, x: p.x, y: p.y }
      objects.push({ ...o, start: fix(o.start, g.p1), end: fix(o.end, g.p2) })
    } else objects.push(o)
  }
  const assetIds = new Set(objects.flatMap((o) => (o.type === 'icon' || (o.type === 'brush' && o.assetId) ? [o.assetId!] : [])))
  return { objects, assets: [...assetIds].map((a) => snap.assets.get(a)).filter((a): a is Asset => !!a) }
}

/** Inserts a clip under `parent` with fresh ids, offset by (dx, dy). Returns the new top-level ids. */
export function pasteClip(doc: FigureDoc, clip: Clip, parent: Id | '', dx: number, dy: number): Id[] {
  const remap = new Map(clip.objects.map((o) => [o.id, newId()]))
  const roots = clip.objects.filter((o) => !o.parentId || !remap.has(o.parentId)).sort((a, b) => (a.z < b.z ? -1 : 1))
  const snap = doc.snapshot()
  let z = snap.topZ(parent)
  const out: Id[] = []
  doc.transact((tx) => {
    for (const a of clip.assets) tx.putAsset(a)
    for (const o of clip.objects) {
      const id = remap.get(o.id)!
      const isRoot = roots.includes(o)
      let copy: FigObject = { ...o, id }
      if (isRoot) {
        const { parentId: _p, ...rest } = copy
        void _p
        copy = { ...rest, ...(parent ? { parentId: parent } : {}), z } as FigObject
        z = generateKeyBetween(z, null)
        out.push(id)
      } else {
        copy = { ...copy, parentId: remap.get(o.parentId!) }
      }
      if (copy.type === 'line') {
        const end = (e: LineObj['start']) => {
          const bind = e.bind ? remap.get(e.bind) : undefined
          return bind ? { x: e.x + dx, y: e.y + dy, bind } : { x: e.x + dx, y: e.y + dy }
        }
        copy = { ...copy, start: end(copy.start), end: end(copy.end) }
      } else if (isBoxObj(copy)) {
        copy = { ...copy, x: copy.x + dx, y: copy.y + dy }
      } else if (copy.type === 'brush') {
        copy = { ...copy, points: copy.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
      }
      tx.add(copy)
    }
  })
  return out
}

/** Center of the given objects, or null. */
export function centerOf(snap: Snapshot, ids: Id[]) {
  const b = boundsOf(snap, ids)
  return b ? center(b) : null
}
