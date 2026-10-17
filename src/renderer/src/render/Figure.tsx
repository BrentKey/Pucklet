import { memo } from 'react'
import { instanceMarkup } from '../assets/svg'
import type { Snapshot } from '../model/doc'
import { capPath, center, resolveLine } from '../model/geometry'
import type { Asset, Dash, EllipseObj, FigObject, IconObj, LineObj, RectObj, TextObj } from '../model/types'
import { layoutText } from '../text/layout'
import { BrushView } from './Brush'

// The single renderer for figures. The canvas renders it live (mode 'canvas'); export renders
// the same components to a static SVG string (mode 'export'), so what you see is what you get.

export type RenderMode = 'canvas' | 'export'

export function dashArray(dash: Dash, w: number): string | undefined {
  if (dash === 'dashed') return `${w * 4} ${w * 3}`
  if (dash === 'dotted') return `0 ${w * 2}`
  return undefined
}

const rotation = (o: { rotation: number; x: number; y: number; w: number; h: number }) => {
  if (!o.rotation) return undefined
  const c = center(o)
  return `rotate(${o.rotation} ${c.x} ${c.y})`
}

const paint = (c: string) => (c === 'none' ? 'none' : c)

function RectView({ o, mode }: { o: RectObj; mode: RenderMode }) {
  return (
    <rect
      data-id={mode === 'canvas' ? o.id : undefined}
      x={o.x}
      y={o.y}
      width={o.w}
      height={o.h}
      rx={o.radius || undefined}
      fill={paint(o.fill)}
      stroke={o.strokeWidth > 0 ? paint(o.stroke) : 'none'}
      strokeWidth={o.strokeWidth || undefined}
      strokeDasharray={dashArray(o.dash, o.strokeWidth)}
      strokeLinecap={o.dash === 'dotted' ? 'round' : undefined}
      opacity={o.opacity < 1 ? o.opacity : undefined}
      transform={rotation(o)}
      // Panel frames are only grabbable by their outline so they don't block clicks inside.
      pointerEvents={mode === 'canvas' ? (o.role === 'panel-frame' ? 'visibleStroke' : 'visible') : undefined}
    />
  )
}

function EllipseView({ o, mode }: { o: EllipseObj; mode: RenderMode }) {
  return (
    <ellipse
      data-id={mode === 'canvas' ? o.id : undefined}
      cx={o.x + o.w / 2}
      cy={o.y + o.h / 2}
      rx={o.w / 2}
      ry={o.h / 2}
      fill={paint(o.fill)}
      stroke={o.strokeWidth > 0 ? paint(o.stroke) : 'none'}
      strokeWidth={o.strokeWidth || undefined}
      strokeDasharray={dashArray(o.dash, o.strokeWidth)}
      strokeLinecap={o.dash === 'dotted' ? 'round' : undefined}
      opacity={o.opacity < 1 ? o.opacity : undefined}
      transform={rotation(o)}
      pointerEvents={mode === 'canvas' ? 'visible' : undefined}
    />
  )
}

function TextView({ o, mode }: { o: TextObj; mode: RenderMode }) {
  const layout = layoutText(o)
  return (
    <g data-id={mode === 'canvas' ? o.id : undefined} transform={rotation(o)} opacity={o.opacity < 1 ? o.opacity : undefined}>
      {mode === 'canvas' && <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="transparent" />}
      <text fontFamily={o.fontFamily} fontSize={o.fontSize} fill={o.color} xmlSpace="preserve">
        {layout.lines.flatMap((line, i) =>
          line.runs.map((r, j) => (
            <tspan
              key={`${i}-${j}`}
              x={round(o.x + line.left + r.x)}
              y={round(o.y + line.baseline + r.dy)}
              fontSize={r.fontSize !== o.fontSize ? round(r.fontSize) : undefined}
              fontWeight={r.run.bold ? 'bold' : undefined}
              fontStyle={r.run.italic ? 'italic' : undefined}
              textDecoration={r.run.underline ? 'underline' : undefined}
              fill={r.run.color}
            >
              {r.run.text}
            </tspan>
          ))
        )}
      </text>
    </g>
  )
}

const round = (n: number) => Math.round(n * 100) / 100

function IconView({ o, asset, mode }: { o: IconObj; asset: Asset | undefined; mode: RenderMode }) {
  const c = center(o)
  const transforms = [
    rotation(o),
    o.flipX || o.flipY ? `translate(${c.x} ${c.y}) scale(${o.flipX ? -1 : 1} ${o.flipY ? -1 : 1}) translate(${-c.x} ${-c.y})` : undefined
  ].filter(Boolean)
  const common = {
    'data-id': mode === 'canvas' ? o.id : undefined,
    transform: transforms.length ? transforms.join(' ') : undefined,
    opacity: o.opacity < 1 ? o.opacity : undefined
  }
  if (!asset) {
    return (
      <g {...common}>
        <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="#f3f3f3" stroke="#c33" strokeDasharray="4 3" />
      </g>
    )
  }
  if (asset.kind === 'raster') {
    return (
      <g {...common}>
        <image href={asset.data} x={o.x} y={o.y} width={o.w} height={o.h} preserveAspectRatio="none" />
      </g>
    )
  }
  return (
    <g {...common}>
      {mode === 'canvas' && <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="transparent" />}
      <g dangerouslySetInnerHTML={{ __html: instanceMarkup(asset, o, o.recolor, 'i' + o.id) }} />
    </g>
  )
}

export function LineView({ o, snap, mode }: { o: LineObj; snap: Snapshot; mode: RenderMode }) {
  const g = resolveLine(o, snap)
  const color = paint(o.stroke)
  const caps = [capPath(o.startCap, g.p1, g.dir1, o.strokeWidth), capPath(o.endCap, g.p2, g.dir2, o.strokeWidth)]
  return (
    <g data-id={mode === 'canvas' ? o.id : undefined} opacity={o.opacity < 1 ? o.opacity : undefined}>
      {mode === 'canvas' && (
        <path d={g.d} stroke="transparent" strokeWidth={12} fill="none" vectorEffect="non-scaling-stroke" />
      )}
      <path
        d={g.d}
        fill="none"
        stroke={color}
        strokeWidth={o.strokeWidth}
        strokeDasharray={dashArray(o.dash, o.strokeWidth)}
        strokeLinecap={o.dash === 'dotted' ? 'round' : 'butt'}
        strokeLinejoin="round"
      />
      {caps.map((c, i) =>
        c ? (
          <path
            key={i}
            d={c.d}
            fill={c.filled ? color : 'none'}
            stroke={color}
            strokeWidth={o.strokeWidth}
            strokeLinejoin="miter"
            strokeLinecap="butt"
          />
        ) : null
      )}
    </g>
  )
}

interface NodeProps {
  o: FigObject
  snap: Snapshot
  mode: RenderMode
  hidden?: ReadonlySet<string>
}

// Lines depend on the objects they're attached to, so they re-render with the snapshot;
// everything else only re-renders when its own object (or asset) changes.
const ShapeNode = memo(function ShapeNode({ o, asset, mode }: { o: FigObject; asset?: Asset; mode: RenderMode }) {
  switch (o.type) {
    case 'rect':
      return <RectView o={o} mode={mode} />
    case 'ellipse':
      return <EllipseView o={o} mode={mode} />
    case 'text':
      return <TextView o={o} mode={mode} />
    case 'icon':
      return <IconView o={o} asset={asset} mode={mode} />
    default:
      return null
  }
})

export function Node({ o, snap, mode, hidden }: NodeProps) {
  if (o.hidden || hidden?.has(o.id)) return null
  if (o.type === 'line') return <LineView o={o} snap={snap} mode={mode} />
  if (o.type === 'brush') return <BrushView o={o} asset={o.assetId ? snap.assets.get(o.assetId) : undefined} mode={mode} />
  if (o.type === 'group') {
    return (
      <g data-id={mode === 'canvas' ? o.id : undefined} opacity={o.opacity < 1 ? o.opacity : undefined}>
        {snap.children(o.id).map((c) => (
          <Node key={c.id} o={c} snap={snap} mode={mode} hidden={hidden} />
        ))}
      </g>
    )
  }
  return <ShapeNode o={o} asset={o.type === 'icon' ? snap.assets.get(o.assetId) : undefined} mode={mode} />
}

export function SceneContent({ snap, mode, hidden }: { snap: Snapshot; mode: RenderMode; hidden?: ReadonlySet<string> }) {
  return (
    <>
      {snap.children('').map((o) => (
        <Node key={o.id} o={o} snap={snap} mode={mode} hidden={hidden} />
      ))}
    </>
  )
}
