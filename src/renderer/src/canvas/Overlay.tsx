import type { Snapshot } from '../model/doc'
import type { Pt } from '../model/geometry'
import { boxCorners, center, objectBounds, resolveLine, rotate } from '../model/geometry'
import { boundsOf } from '../model/ops'
import type { Handle } from '../model/transform'
import type { Box, BrushObj, FigObject } from '../model/types'
import { flattenPath } from '../model/brush'
import { isBoxObj } from '../model/types'
import { useEditor } from '../state/editor'

const BLUE = '#2f80ed'
const PURPLE = '#8b5cf6'
const GUIDE = '#ec4899'

const HANDLES: { h: Handle; fx: number; fy: number; cursor: string }[] = [
  { h: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { h: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { h: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { h: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { h: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { h: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { h: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { h: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' }
]

function BoxFrame({ box, color, zoom, handles, rotatable }: { box: Box; color: string; zoom: number; handles: boolean; rotatable: boolean }) {
  const px = 1 / zoom
  const c = center(box)
  const pts = boxCorners(box)
  const hs = 8 * px
  const at = (fx: number, fy: number): Pt => rotate({ x: box.x + box.w * fx, y: box.y + box.h * fy }, box.rotation, c)
  const top = at(0.5, 0)
  const knob = rotate({ x: box.x + box.w / 2, y: box.y - 24 * px }, box.rotation, c)
  // Hide edge handles on tiny boxes so corners stay grabbable.
  const small = Math.min(box.w, box.h) * zoom < 28
  return (
    <g>
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={1.5 * px} pointerEvents="none" />
      {handles && rotatable && (
        <>
          <line x1={top.x} y1={top.y} x2={knob.x} y2={knob.y} stroke={color} strokeWidth={px} pointerEvents="none" />
          <circle data-handle="rotate" cx={knob.x} cy={knob.y} r={5 * px} fill="#fff" stroke={color} strokeWidth={1.5 * px} style={{ cursor: 'grab' }} />
        </>
      )}
      {handles &&
        HANDLES.filter((h) => !small || h.h.length === 2).map(({ h, fx, fy, cursor }) => {
          const p = at(fx, fy)
          return (
            <rect
              key={h}
              data-handle={h}
              x={p.x - hs / 2}
              y={p.y - hs / 2}
              width={hs}
              height={hs}
              fill="#fff"
              stroke={color}
              strokeWidth={1.5 * px}
              transform={box.rotation ? `rotate(${box.rotation} ${p.x} ${p.y})` : undefined}
              style={{ cursor }}
            />
          )
        })}
    </g>
  )
}

function LineHandles({ o, snap, zoom }: { o: Extract<FigObject, { type: 'line' }>; snap: Snapshot; zoom: number }) {
  const g = resolveLine(o, snap)
  const px = 1 / zoom
  const bendPt = g.pts.length === 3 ? g.pts[1] : { x: (g.p1.x + g.p2.x) / 2, y: (g.p1.y + g.p2.y) / 2 }
  const end = (which: 'start' | 'end', p: Pt, bound: boolean) => (
    <circle
      data-handle={which}
      cx={p.x}
      cy={p.y}
      r={5.5 * px}
      fill={bound ? BLUE : '#fff'}
      stroke={BLUE}
      strokeWidth={1.5 * px}
      style={{ cursor: 'crosshair' }}
    />
  )
  return (
    <g>
      <path d={g.d} fill="none" stroke={BLUE} strokeWidth={1 * px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" />
      {!o.locked && o.route !== 'elbow' && (
        <rect
          data-handle="bend"
          x={bendPt.x - 4 * px}
          y={bendPt.y - 4 * px}
          width={8 * px}
          height={8 * px}
          transform={`rotate(45 ${bendPt.x} ${bendPt.y})`}
          fill="#fff"
          stroke={BLUE}
          strokeWidth={1.5 * px}
          style={{ cursor: 'move' }}
        />
      )}
      {!o.locked && end('start', g.p1, !!o.start.bind)}
      {!o.locked && end('end', g.p2, !!o.end.bind)}
    </g>
  )
}

function BrushHandles({ o, zoom }: { o: BrushObj; zoom: number }) {
  const px = 1 / zoom
  const n = o.points.length
  const segs = o.closed ? n : n - 1
  const poly = flattenPath(o.points, o.closed, o.smooth)
  // Midpoint of each segment along the smoothed path (16 samples per segment, see flattenPath).
  const mids = Array.from({ length: segs }, (_, i) => (o.smooth && n > 2 ? poly[i * 16 + 8] : { x: (o.points[i].x + o.points[(i + 1) % n].x) / 2, y: (o.points[i].y + o.points[(i + 1) % n].y) / 2 }))
  return (
    <g>
      <path d={'M' + poly.map((p) => `${p.x} ${p.y}`).join(' L')} fill="none" stroke={BLUE} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" />
      {mids.map((m, i) =>
        m ? <circle key={'m' + i} data-handle={`bmid:${i}`} cx={m.x} cy={m.y} r={3.5 * px} fill="#fff" stroke={BLUE} strokeWidth={px} opacity={0.8} style={{ cursor: 'copy' }} /> : null
      )}
      {o.points.map((p, i) => (
        <circle key={i} data-handle={`bpt:${i}`} cx={p.x} cy={p.y} r={5 * px} fill={BLUE} stroke="#fff" strokeWidth={1.5 * px} style={{ cursor: 'move' }}>
          <title>Drag to reshape · ⌥-click to delete</title>
        </circle>
      ))}
    </g>
  )
}

export function Overlay({ snap }: { snap: Snapshot }) {
  const selection = useEditor((s) => s.selection)
  const context = useEditor((s) => s.context)
  const guides = useEditor((s) => s.guides)
  const bindTarget = useEditor((s) => s.bindTarget)
  const marquee = useEditor((s) => s.marquee)
  const zoom = useEditor((s) => s.view.zoom)
  const editingText = useEditor((s) => s.editingText)
  const px = 1 / zoom
  const { width: W, height: H } = snap.meta

  const sel = selection.map((id) => snap.get(id)).filter((o): o is FigObject => !!o)
  const ctxObj = context ? snap.get(context) : undefined
  const ctxBounds = ctxObj ? objectBounds(ctxObj, snap) : null
  const bind = bindTarget ? snap.get(bindTarget) : undefined

  let frame: React.ReactNode = null
  if (sel.length === 1 && sel[0].type === 'line') {
    frame = <LineHandles o={sel[0]} snap={snap} zoom={zoom} />
  } else if (sel.length === 1 && sel[0].type === 'brush' && !sel[0].locked) {
    const b = objectBounds(sel[0], snap)!
    frame = (
      <g>
        <BoxFrame box={{ ...b, rotation: 0 }} color={BLUE} zoom={zoom} handles rotatable />
        <BrushHandles o={sel[0]} zoom={zoom} />
      </g>
    )
  } else if (sel.length === 1 && isBoxObj(sel[0])) {
    const o = sel[0]
    frame = <BoxFrame box={o} color={o.locked ? '#999' : BLUE} zoom={zoom} handles={!o.locked && editingText !== o.id} rotatable />
  } else if (sel.length) {
    const b = boundsOf(snap, selection)
    const anyLocked = sel.some((o) => o.locked)
    const isGroup = sel.length === 1 && sel[0].type === 'group'
    if (b) {
      frame = (
        <g>
          {!isGroup &&
            sel.map((o) => {
              const r = objectBounds(o, snap)
              return r ? <rect key={o.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={BLUE} strokeWidth={px} opacity={0.6} pointerEvents="none" /> : null
            })}
          <BoxFrame box={{ ...b, rotation: 0 }} color={isGroup ? PURPLE : BLUE} zoom={zoom} handles={!anyLocked} rotatable />
        </g>
      )
    }
  }

  return (
    <g className="overlay">
      {ctxBounds && (
        <rect
          x={ctxBounds.x - 6 * px}
          y={ctxBounds.y - 6 * px}
          width={ctxBounds.w + 12 * px}
          height={ctxBounds.h + 12 * px}
          fill="none"
          stroke={PURPLE}
          strokeWidth={px}
          strokeDasharray={`${5 * px} ${4 * px}`}
          pointerEvents="none"
        />
      )}
      {bind && isBoxObj(bind) && (
        <polygon
          points={boxCorners(bind).map((p) => `${p.x},${p.y}`).join(' ')}
          fill={BLUE}
          fillOpacity={0.08}
          stroke={BLUE}
          strokeWidth={2 * px}
          pointerEvents="none"
        />
      )}
      {frame}
      {guides.x.map((x, i) => (
        <line key={'gx' + i} x1={x} x2={x} y1={-H} y2={H * 2} stroke={GUIDE} strokeWidth={px} pointerEvents="none" />
      ))}
      {guides.y.map((y, i) => (
        <line key={'gy' + i} y1={y} y2={y} x1={-W} x2={W * 2} stroke={GUIDE} strokeWidth={px} pointerEvents="none" />
      ))}
      {marquee && (
        <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill={BLUE} fillOpacity={0.08} stroke={BLUE} strokeWidth={px} pointerEvents="none" />
      )}
    </g>
  )
}
