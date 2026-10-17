import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { makeBrush, makeEllipse, makeLine, makeRect, makeText } from '../model/defaults'
import { simplify } from '../model/brush'
import type { Snapshot } from '../model/doc'
import type { Pt, Rect } from '../model/geometry'
import { bindingFor, center, dist, lineAnchors, norm, objectBounds, rectsIntersect, resolveLine, snapAngle, sub } from '../model/geometry'
import { applyChanges, boundsOf, copyObjects, pasteClip } from '../model/ops'
import type { Changes, Handle } from '../model/transform'
import { resizeBox, rotateAbout, scaleAbout, translate, withTextSize } from '../model/transform'
import type { BrushObj, FigObject, IconObj, Id, LineObj, TextObj } from '../model/types'
import { cropPan, cropResize } from '../model/crop'
import { withTableSize } from '../render/Table'
import { isBoxObj } from '../model/types'
import { SceneContent } from '../render/Figure'
import { useEditor, useLiveSnapshot, useSnapshot } from '../state/editor'
import { importDroppedFiles, placeLibraryIcon, LIBRARY_DRAG_TYPE } from '../library/place'
import { Overlay } from './Overlay'
import { TextEditor } from './TextEditor'
import { Rulers } from './Rulers'
import { fitView, zoomAt } from './view'

type Drag =
  | { kind: 'pan'; client: Pt; pan: Pt }
  | { kind: 'move'; origin: Pt; ids: Id[]; base: Snapshot; bounds: Rect; xs: number[]; ys: number[]; moved: boolean; clickSelect?: Id }
  | { kind: 'resize'; handle: Handle; ids: Id[]; base: Snapshot; bounds: Rect; xs: number[]; ys: number[] }
  | { kind: 'rotate'; ids: Id[]; base: Snapshot; pivot: Pt; a0: number }
  | { kind: 'marquee'; origin: Pt; base: Id[] }
  | { kind: 'create'; obj: FigObject; origin: Pt }
  | { kind: 'line-end'; line: LineObj; which: 'start' | 'end'; base: Snapshot; isNew: boolean }
  | { kind: 'bend'; line: LineObj; base: Snapshot }
  | { kind: 'sketch'; pts: Pt[]; parent: Id | ''; z: string }
  | { kind: 'text-box'; origin: Pt; obj: TextObj; left?: number; width?: number }
  | { kind: 'crop-pan'; origin: Pt; icon: IconObj }
  | { kind: 'brush-point'; brush: BrushObj; index: number }

const SNAP_PX = 6
const FILTERS = {
  protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  tritanopia: '1.255528 -0.076749 -0.178779 0 0  -0.078411 0.930809 0.147602 0 0  0.004733 0.691367 0.303900 0 0  0 0 0 1 0'
}

/** Edges and centres that moving or resizing objects snap to: the artboard plus every other object in the current group. */
function snapTargets(snap: Snapshot, context: Id | '', exclude: Id[], W: number, H: number): { xs: number[]; ys: number[] } {
  const skip = new Set([...exclude, ...snap.descendants(exclude)])
  const xs = [0, W / 2, W]
  const ys = [0, H / 2, H]
  for (const o of snap.children(context)) {
    if (skip.has(o.id) || o.hidden) continue
    const r = objectBounds(o, snap)
    if (!r) continue
    xs.push(r.x, r.x + r.w / 2, r.x + r.w)
    ys.push(r.y, r.y + r.h / 2, r.y + r.h)
  }
  return { xs, ys }
}

function nearest(v: number, cands: number[], tol: number): number | null {
  let best: number | null = null
  for (const c of cands) if (Math.abs(c - v) < tol && (best === null || Math.abs(c - v) < Math.abs(best - v))) best = c
  return best
}

/** Topmost bindable object under p (connectors attach to shapes, text and icons). */
/**
 * What a connector end dropped at p should attach to (topmost first), following the rules in
 * geometry.bindingFor: pinned to an outline, attached to a small object, or nothing.
 */
function findBinding(snap: Snapshot, p: Pt, exclude: Id, zoom: number): { id: Id; anchor?: { x: number; y: number } } | null {
  const order: FigObject[] = []
  const walk = (parent: Id | '') => {
    for (const o of snap.children(parent)) {
      if (o.hidden) continue
      if (o.type === 'group') walk(o.id)
      else order.push(o)
    }
  }
  walk('')
  for (let i = order.length - 1; i >= 0; i--) {
    const o = order[i]
    if (o.id === exclude) continue
    const b = bindingFor(o, p, zoom)
    if (b) return { id: o.id, ...b }
  }
  return null
}

export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const spaceDown = useRef(false)
  const snap = useSnapshot()
  const live = useLiveSnapshot()
  const view = useEditor((s) => s.view)
  const tool = useEditor((s) => s.tool)
  const editingText = useEditor((s) => s.editingText)
  const filter = useEditor((s) => s.filter)
  const prefs = useEditor((s) => s.prefs)
  const doc = useEditor((s) => s.doc)
  const { width: W, height: H, background } = snap.meta

  // Track viewport size, and fit the artboard whenever a document is loaded.
  useLayoutEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => {
      // Keep whatever is in the middle of the view in the middle when the window resizes.
      const s = useEditor.getState()
      const w = el.clientWidth
      const h = el.clientHeight
      const dx = (w - s.viewport.w) / 2
      const dy = (h - s.viewport.h) / 2
      s.set({ viewport: { w, h }, view: { ...s.view, panX: s.view.panX + dx, panY: s.view.panY + dy } })
    })
    ro.observe(el)
    useEditor.getState().set({ viewport: { w: el.clientWidth, h: el.clientHeight } })
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    fitView()
  }, [doc])

  const toWorld = useCallback((clientX: number, clientY: number): Pt => {
    const r = wrapRef.current!.getBoundingClientRect()
    const v = useEditor.getState().view
    return { x: (clientX - r.left - v.panX) / v.zoom, y: (clientY - r.top - v.panY) / v.zoom }
  }, [])

  // Wheel: pinch / ctrl+wheel zooms at the cursor, plain wheel pans. Needs a non-passive listener.
  useEffect(() => {
    const el = wrapRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top)
      } else {
        const v = useEditor.getState().view
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
        useEditor.getState().set({ view: { ...v, panX: v.panX - dx, panY: v.panY - dy } })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Space bar = temporary hand tool.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping()) {
        spaceDown.current = true
        e.preventDefault()
        wrapRef.current?.classList.add('panning')
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false
        wrapRef.current?.classList.remove('panning')
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  /** Map an element under the pointer to the object that a click should select. */
  const selectableFrom = (target: EventTarget | null): Id | null => {
    const el = (target as Element | null)?.closest?.('[data-id]')
    const leaf = el?.getAttribute('data-id')
    if (!leaf) return null
    const s = useEditor.getState()
    const snapNow = s.doc.snapshot()
    if (!snapNow.get(leaf)) return null
    const chain = snapNow.ancestry(leaf)
    if (s.context && chain.includes(s.context)) {
      const i = chain.indexOf(s.context)
      return chain[i + 1] ?? chain[i]
    }
    if (s.context) s.set({ context: '' })
    return chain[0]
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return
    const s = useEditor.getState()
    if (s.editingText) return // the text editor commits on blur
    wrapRef.current!.setPointerCapture(e.pointerId)
    const p = toWorld(e.clientX, e.clientY)
    const base = s.doc.snapshot()

    if (e.button === 1 || s.tool === 'hand' || spaceDown.current) {
      drag.current = { kind: 'pan', client: { x: e.clientX, y: e.clientY }, pan: { x: s.view.panX, y: s.view.panY } }
      return
    }

    const handle = (e.target as Element).closest?.('[data-handle]')?.getAttribute('data-handle')
    if (handle) {
      const ids = s.selection
      if (handle === 'rotate') {
        const b = boundsOf(base, ids)!
        const single = ids.length === 1 ? base.get(ids[0]) : undefined
        const pivot = single && isBoxObj(single) ? center(single) : center(b)
        drag.current = { kind: 'rotate', ids, base, pivot, a0: Math.atan2(p.y - pivot.y, p.x - pivot.x) }
      } else if (handle === 'start' || handle === 'end') {
        drag.current = { kind: 'line-end', line: base.get(ids[0]) as LineObj, which: handle, base, isNew: false }
      } else if (handle === 'bend') {
        drag.current = { kind: 'bend', line: base.get(ids[0]) as LineObj, base }
      } else if (handle.startsWith('bpt:') || handle.startsWith('bmid:')) {
        let brush = base.get(ids[0]) as BrushObj
        let index = Number(handle.split(':')[1])
        if (handle.startsWith('bmid:')) {
          // Dragging a midpoint inserts a new point there.
          index += 1
          brush = { ...brush, points: [...brush.points.slice(0, index), p, ...brush.points.slice(index)] }
        } else if (e.altKey && brush.points.length > (brush.closed ? 3 : 2)) {
          const b2 = { ...brush, points: brush.points.filter((_, i) => i !== index) }
          s.doc.transact((tx) => tx.put(b2))
          return
        }
        drag.current = { kind: 'brush-point', brush, index }
        s.set({ drafts: new Map([[brush.id, brush]]) })
      } else {
        drag.current = { kind: 'resize', handle: handle as Handle, ids, base, bounds: boundsOf(base, ids)!, ...snapTargets(base, s.context, ids, W, H) }
      }
      return
    }

    const parent = s.context
    const z = base.topZ(parent)
    const withParent = <T extends FigObject>(o: T): T => (parent ? { ...o, parentId: parent } : o)

    switch (s.tool) {
      case 'rect':
      case 'ellipse': {
        const obj = withParent(s.tool === 'rect' ? makeRect(z, p.x, p.y, 1, 1) : makeEllipse(z, p.x, p.y, 1, 1))
        drag.current = { kind: 'create', obj, origin: p }
        return
      }
      case 'text': {
        // Keep the browser from moving focus to the canvas, which would blur the new editor.
        e.preventDefault()
        drag.current = { kind: 'text-box', origin: p, obj: withParent(makeText(z, p.x, p.y - 12)) }
        return
      }
      case 'brush': {
        drag.current = { kind: 'sketch', pts: [p], parent, z }
        s.set({ sketch: [p] })
        return
      }
      case 'line':
      case 'arrow': {
        const style = s.tool === 'arrow' ? s.lineStyle : { ...s.lineStyle, startCap: 'none' as const, endCap: 'none' as const }
        const bind = e.altKey ? null : findBinding(base, p, '', s.view.zoom)
        const line = withParent(makeLine(z, p.x, p.y, style))
        if (bind) line.start = { x: p.x, y: p.y, bind: bind.id, ...(bind.anchor ? { anchor: bind.anchor } : {}) }
        drag.current = { kind: 'line-end', line, which: 'end', base, isNew: true }
        s.set({ drafts: new Map([[line.id, line]]) })
        return
      }
    }

    // Select tool.
    const hit = selectableFrom(e.target)
    if (s.cropping && hit !== s.cropping) s.set({ cropping: null })
    if (hit && hit === s.cropping) {
      drag.current = { kind: 'crop-pan', origin: p, icon: base.get(hit) as IconObj }
      return
    }
    if (hit) {
      let sel = s.selection
      let clickSelect: Id | undefined
      if (e.shiftKey) {
        sel = sel.includes(hit) ? sel.filter((i) => i !== hit) : [...sel, hit]
      } else if (!sel.includes(hit)) {
        sel = [hit]
      } else if (sel.length > 1) {
        clickSelect = hit
      }
      s.select(sel)
      let ids = sel.filter((id) => !base.get(id)?.locked)
      if (!ids.length || (e.shiftKey && !sel.includes(hit))) return
      if (e.altKey) {
        ids = pasteClip(s.doc, copyObjects(base, ids), s.context, 0, 0)
        s.select(ids)
      }
      const { xs, ys } = snapTargets(base, s.context, ids, W, H)
      const snapBase = e.altKey ? s.doc.snapshot() : base
      drag.current = { kind: 'move', origin: p, ids, base: snapBase, bounds: boundsOf(snapBase, ids)!, xs, ys, moved: false, clickSelect }
    } else {
      if (!e.shiftKey) s.select([])
      drag.current = { kind: 'marquee', origin: p, base: e.shiftKey ? s.selection : [] }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const s = useEditor.getState()
    const p = toWorld(e.clientX, e.clientY)
    const zoom = s.view.zoom

    switch (d.kind) {
      case 'pan':
        s.set({ view: { ...s.view, panX: d.pan.x + e.clientX - d.client.x, panY: d.pan.y + e.clientY - d.client.y } })
        return

      case 'move': {
        let dx = p.x - d.origin.x
        let dy = p.y - d.origin.y
        if (!d.moved && Math.hypot(dx, dy) * zoom < 3) return
        d.moved = true
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        const guides = { x: [] as number[], y: [] as number[] }
        if (s.prefs.snapToGrid && !e.metaKey && !e.ctrlKey) {
          // Grid snapping: the selection's top-left corner lands on grid points.
          const G = s.prefs.gridSize
          dx = Math.round((d.bounds.x + dx) / G) * G - d.bounds.x
          dy = Math.round((d.bounds.y + dy) / G) * G - d.bounds.y
        } else if (!e.metaKey && !e.ctrlKey) {
          const snap1 = (edges: number[], cands: number[]) => {
            let best = SNAP_PX / zoom
            let off = 0
            for (const e1 of edges) for (const c of cands) if (Math.abs(c - e1) < best) ((best = Math.abs(c - e1)), (off = c - e1))
            return off
          }
          const b = d.bounds
          const ox = snap1([b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx], d.xs)
          const oy = snap1([b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy], d.ys)
          dx += ox
          dy += oy
          const near = (v: number) => (c: number) => Math.abs(c - v) < 0.01
          for (const v of [b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx]) if (d.xs.some(near(v))) guides.x.push(v)
          for (const v of [b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy]) if (d.ys.some(near(v))) guides.y.push(v)
        }
        s.set({ drafts: translate(d.base, d.ids, dx, dy), guides })
        return
      }

      case 'resize': {
        const single = d.ids.length === 1 ? d.base.get(d.ids[0]) : undefined
        // Snap the dragged edge(s) to nearby guides (only meaningful for unrotated boxes).
        const guides = { x: [] as number[], y: [] as number[] }
        const unrotated = !(single && isBoxObj(single) && single.rotation)
        if (unrotated && s.prefs.snapToGrid && !e.metaKey && !e.ctrlKey) {
          const G = s.prefs.gridSize
          p.x = Math.round(p.x / G) * G
          p.y = Math.round(p.y / G) * G
        } else if (unrotated && !e.metaKey && !e.ctrlKey) {
          const tol = SNAP_PX / zoom
          if (d.handle.includes('e') || d.handle.includes('w')) {
            const gx = nearest(p.x, d.xs, tol)
            if (gx !== null) guides.x.push((p.x = gx))
          }
          if (d.handle.includes('n') || d.handle.includes('s')) {
            const gy = nearest(p.y, d.ys, tol)
            if (gy !== null) guides.y.push((p.y = gy))
          }
        }
        s.set({ guides })
        if (single?.type === 'icon' && s.cropping === single.id) {
          const icon = cropResize(single, d.handle, p)
          s.set({ drafts: new Map([[icon.id, icon]]) })
          return
        }
        if (single && isBoxObj(single)) {
          if (single.type === 'table') {
            // Tables keep their proportions: resizing scales the text.
            const r = resizeBox(single, d.handle, p, true)
            const k = r.h / single.h
            const t = withTableSize({ ...single, style: { ...single.style, fontSize: Math.max(4, Math.round(single.style.fontSize * k * 10) / 10) } })
            const c = center(r)
            s.set({ drafts: new Map([[t.id, { ...t, x: c.x - t.w / 2, y: c.y - t.h / 2 }]]) })
            return
          }
          const proportional = single.type === 'icon' || single.type === 'text' ? !e.shiftKey : e.shiftKey
          if (single.type === 'text' && (d.handle === 'e' || d.handle === 'w')) {
            // Side handles set the width the text wraps within; the font size stays.
            const r = resizeBox(single, d.handle, p, false)
            const t = withTextSize({ ...single, wrap: Math.max(20, r.w) })
            const x = d.handle === 'w' ? single.x + single.w - t.w : single.x
            s.set({ drafts: new Map([[t.id, { ...t, x }]]) })
            return
          }
          let r = resizeBox(single, d.handle, p, proportional || single.type === 'text')
          if (r.type === 'text' && single.type === 'text') {
            const k = r.h / single.h
            const fontSize = Math.max(1, Math.round(single.fontSize * k * 10) / 10)
            const t = withTextSize({ ...single, fontSize, ...(single.wrap ? { wrap: single.wrap * k } : {}) })
            const c = center(r)
            r = { ...t, x: c.x - t.w / 2, y: c.y - t.h / 2 }
          }
          s.set({ drafts: new Map([[r.id, r]]) })
        } else {
          const b = d.bounds
          const hasRigid = d.ids.some((id) => d.base.get(id)?.type !== 'rect' && d.base.get(id)?.type !== 'ellipse')
          const corner = d.handle.length === 2
          const proportional = corner && (hasRigid ? !e.shiftKey : e.shiftKey)
          const r = resizeBox({ ...b, rotation: 0 } as never, d.handle, p, proportional) as Rect
          const sx = b.w ? r.w / b.w : 1
          const sy = b.h ? r.h / b.h : 1
          const scaled = scaleAbout(d.base, d.ids, { x: b.x, y: b.y }, sx, sy)
          s.set({ drafts: translate(d.base.withOverrides(scaled), d.ids, r.x - b.x, r.y - b.y) })
        }
        return
      }

      case 'rotate': {
        let deg = ((Math.atan2(p.y - d.pivot.y, p.x - d.pivot.x) - d.a0) * 180) / Math.PI
        const single = d.ids.length === 1 ? d.base.get(d.ids[0]) : undefined
        const startRot = single && isBoxObj(single) ? single.rotation : 0
        deg = e.shiftKey ? snapAngle(startRot + deg) - startRot : Math.round(deg * 10) / 10
        s.set({ drafts: rotateAbout(d.base, d.ids, d.pivot, deg) })
        return
      }

      case 'marquee': {
        const r = { x: Math.min(d.origin.x, p.x), y: Math.min(d.origin.y, p.y), w: Math.abs(p.x - d.origin.x), h: Math.abs(p.y - d.origin.y) }
        const snapNow = s.doc.snapshot()
        const hits = snapNow
          .children(s.context)
          .filter((o) => !o.locked && !o.hidden)
          .filter((o) => {
            const b = objectBounds(o, snapNow)
            return b && rectsIntersect(b, r)
          })
          .map((o) => o.id)
        s.set({ marquee: r, selection: [...new Set([...d.base, ...hits])] })
        return
      }

      case 'create': {
        let w = p.x - d.origin.x
        let h = p.y - d.origin.y
        if (e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h))
          w = Math.sign(w || 1) * m
          h = Math.sign(h || 1) * m
        }
        const o = { ...d.obj, x: Math.min(d.origin.x, d.origin.x + w), y: Math.min(d.origin.y, d.origin.y + h), w: Math.abs(w), h: Math.abs(h) } as FigObject
        s.set({ drafts: new Map([[o.id, o]]) })
        return
      }

      case 'line-end': {
        const bind = e.altKey ? null : findBinding(d.base, p, d.line.id, zoom)
        const other = d.which === 'start' ? d.line.end : d.line.start
        // Don't attach both ends to the same object.
        const target = bind && bind.id !== other.bind ? bind : null
        let q = p
        if (e.shiftKey && !target) {
          // Shift: constrain to 45° steps from where the other end actually is.
          const g = resolveLine(d.line, d.base)
          const o = d.which === 'start' ? g.p2 : g.p1
          const ang = snapAngle((Math.atan2(p.y - o.y, p.x - o.x) * 180) / Math.PI, 45) * (Math.PI / 180)
          const l = dist(o, p)
          q = { x: o.x + Math.cos(ang) * l, y: o.y + Math.sin(ang) * l }
        }
        const ep = target ? { x: q.x, y: q.y, bind: target.id, ...(target.anchor ? { anchor: target.anchor } : {}) } : { x: q.x, y: q.y }
        const line = { ...d.line, [d.which]: ep }
        s.set({ drafts: new Map([[line.id, line]]), bindTarget: target?.id ?? null })
        return
      }

      case 'crop-pan': {
        const icon = cropPan(d.icon, p.x - d.origin.x, p.y - d.origin.y)
        s.set({ drafts: new Map([[icon.id, icon]]) })
        return
      }

      case 'text-box': {
        // Dragging with the text tool draws a fixed-width box that the text wraps within.
        const w = Math.abs(p.x - d.origin.x)
        if (w * zoom < 8) return
        d.width = w
        d.left = Math.min(p.x, d.origin.x)
        s.set({ marquee: { x: Math.min(p.x, d.origin.x), y: d.origin.y, w, h: Math.max(4, p.y - d.origin.y) } })
        return
      }

      case 'sketch': {
        const last = d.pts[d.pts.length - 1]
        if (e.shiftKey) d.pts = [d.pts[0], p]
        else if (dist(last, p) * zoom > 3) d.pts.push(p)
        s.set({ sketch: [...d.pts] })
        return
      }

      case 'brush-point': {
        const points = d.brush.points.slice()
        points[d.index] = p
        s.set({ drafts: new Map([[d.brush.id, { ...d.brush, points }]]) })
        return
      }

      case 'bend': {
        const { a, b } = lineAnchors(d.line, d.base)
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const n = norm({ x: -(b.y - a.y), y: b.x - a.x })
        const v = sub(p, m)
        let bend = 2 * (v.x * n.x + v.y * n.y)
        if (Math.abs(bend) * zoom < 6) bend = 0
        const line: LineObj = { ...d.line, route: 'curved', bend }
        s.set({ drafts: new Map([[line.id, line]]) })
        return
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (wrapRef.current?.hasPointerCapture(e.pointerId)) wrapRef.current.releasePointerCapture(e.pointerId)
    if (!d) return
    const s = useEditor.getState()
    const drafts = s.drafts
    const done = () => s.set({ drafts: new Map(), guides: { x: [], y: [] }, bindTarget: null, marquee: null })

    if (d.kind === 'move' && !d.moved) {
      if (d.clickSelect) s.select([d.clickSelect])
      return done()
    }
    if (d.kind === 'create') {
      let o = drafts.get(d.obj.id) as FigObject | undefined
      if (!o || !isBoxObj(o) || o.w < 4 || o.h < 4) {
        const def = d.obj.type === 'ellipse' ? { w: 100, h: 100 } : { w: 140, h: 90 }
        o = { ...d.obj, x: d.origin.x - def.w / 2, y: d.origin.y - def.h / 2, ...def } as FigObject
      }
      const obj = o
      s.doc.transact((tx) => tx.add(obj))
      s.set({ selection: [obj.id], tool: 'select' })
      return done()
    }
    if (d.kind === 'text-box') {
      let obj: TextObj = d.obj
      if (d.width) obj = withTextSize({ ...obj, x: d.left ?? d.origin.x, y: d.origin.y, wrap: Math.max(20, d.width) })
      s.set({ drafts: new Map([[obj.id, obj]]), editingText: obj.id, selection: [obj.id], tool: 'select', marquee: null })
      return
    }
    if (d.kind === 'sketch') {
      s.set({ sketch: null })
      let pts = d.pts
      const zoom = s.view.zoom
      const length = pts.reduce((acc, q, i) => (i ? acc + dist(pts[i - 1], q) : 0), 0)
      if (length * zoom < 10) pts = [pts[0], { x: pts[0].x + 240, y: pts[0].y }]
      // A path that ends where it started becomes a closed loop (e.g. a cell membrane).
      const closed = pts.length > 8 && dist(pts[0], pts[pts.length - 1]) * zoom < 24
      pts = simplify(pts, 2.5 / zoom)
      if (closed && pts.length > 3) pts = pts.slice(0, -1)
      const brush = makeBrush(d.z, s.brushKind, pts, closed && pts.length > 2)
      const obj = d.parent ? { ...brush, parentId: d.parent } : brush
      s.doc.transact((tx) => tx.add(obj))
      s.set({ selection: [obj.id], tool: 'select' })
      return done()
    }
    if (d.kind === 'line-end' && d.isNew) {
      let line = (drafts.get(d.line.id) as LineObj) ?? d.line
      const g = { a: line.start, b: line.end }
      if (dist(g.a, g.b) * s.view.zoom < 6 && !line.end.bind) line = { ...line, end: { x: line.start.x + 160, y: line.start.y } }
      const committed = line
      s.doc.transact((tx) => tx.add(committed))
      s.set({ selection: [committed.id], tool: 'select' })
      return done()
    }
    if (drafts.size && d.kind !== 'marquee' && d.kind !== 'pan') {
      const changes: Changes = drafts
      s.doc.transact((tx) => applyChanges(tx, changes))
    }
    done()
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = useEditor.getState()
    const el = (e.target as Element).closest?.('[data-id]')
    const leaf = el?.getAttribute('data-id')
    if (!leaf) return
    const snapNow = s.doc.snapshot()
    const chain = snapNow.ancestry(leaf)
    const ctxIndex = s.context ? chain.indexOf(s.context) : -1
    const current = chain[ctxIndex + 1]
    const o = current ? snapNow.get(current) : undefined
    if (!o) return
    if (o.type === 'group') {
      // Enter the group and select the child under the pointer.
      s.set({ context: o.id, selection: [chain[ctxIndex + 2] ?? o.id] })
      const child = snapNow.get(chain[ctxIndex + 2])
      if (child?.type === 'text' && !child.locked) s.set({ editingText: child.id })
    } else if (o.type === 'text' && !o.locked) {
      s.set({ editingText: o.id, selection: [o.id] })
    } else if (o.type === 'line' && !o.locked) {
      s.set({ selection: [o.id] })
      requestAnimationFrame(() => (document.getElementById('connector-label') as HTMLInputElement | null)?.focus())
    } else if (o.type === 'icon' && !o.locked) {
      s.set({ selection: [o.id], cropping: s.cropping === o.id ? null : o.id })
    }
  }

  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(LIBRARY_DRAG_TYPE) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const p = toWorld(e.clientX, e.clientY)
    const lib = e.dataTransfer.getData(LIBRARY_DRAG_TYPE)
    if (lib) void placeLibraryIcon(JSON.parse(lib), p)
    else if (e.dataTransfer.files.length) void importDroppedFiles(Array.from(e.dataTransfer.files), p)
  }

  const hidden = useMemo(() => (editingText ? new Set([editingText]) : undefined), [editingText])
  const filterCss = filter === 'none' ? undefined : filter === 'grayscale' ? 'grayscale(1)' : `url(#cvd-${filter})`

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap tool-${tool}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg className="canvas-svg" width="100%" height="100%">
        <defs>
          {Object.entries(FILTERS).map(([k, m]) => (
            <filter key={k} id={`cvd-${k}`}>
              <feColorMatrix type="matrix" values={m} />
            </filter>
          ))}
          <pattern id="grid" width={prefs.gridSize} height={prefs.gridSize} patternUnits="userSpaceOnUse">
            <path d={`M${prefs.gridSize} 0 L0 0 0 ${prefs.gridSize}`} fill="none" stroke="#c7d2fe" strokeWidth={1 / view.zoom} />
          </pattern>
          <pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#e6e6e6" />
            <rect x="8" y="8" width="8" height="8" fill="#e6e6e6" />
          </pattern>
          <filter id="artboard-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="3" floodOpacity="0.18" />
          </filter>
        </defs>
        <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          <rect x={0} y={0} width={W} height={H} fill={background === 'none' ? '#ffffff' : background} filter="url(#artboard-shadow)" />
          {background === 'none' && <rect x={0} y={0} width={W} height={H} fill="url(#checker)" />}
          {prefs.showGrid && prefs.gridSize * view.zoom >= 5 && <rect x={0} y={0} width={W} height={H} fill="url(#grid)" pointerEvents="none" />}
          <g style={{ filter: filterCss }}>
            <SceneContent snap={live} mode="canvas" hidden={hidden} />
          </g>
          <Overlay snap={live} />
          <Sketch />
        </g>
      </svg>
      {editingText && <TextEditor key={editingText} id={editingText} />}
      <Rulers />
    </div>
  )
}

export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

/** Live preview of a freehand brush stroke. */
function Sketch() {
  const pts = useEditor((s) => s.sketch)
  const zoom = useEditor((s) => s.view.zoom)
  if (!pts || pts.length < 2) return null
  return <polyline points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#2f80ed" strokeWidth={2 / zoom} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} pointerEvents="none" />
}
