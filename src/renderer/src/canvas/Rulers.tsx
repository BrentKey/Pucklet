import { boundsOf } from '../model/ops'
import { useEditor, useLiveSnapshot } from '../state/editor'

export const RULER = 20

/** Tick spacing (in artboard px) that keeps labelled ticks at least ~60 screen px apart. */
function tickStep(zoom: number): number {
  const target = 60 / zoom
  const pow = 10 ** Math.floor(Math.log10(target))
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow
  return 10 * pow
}

function Ruler({ axis }: { axis: 'x' | 'y' }) {
  const view = useEditor((s) => s.view)
  const viewport = useEditor((s) => s.viewport)
  const selection = useEditor((s) => s.selection)
  const snap = useLiveSnapshot()
  const len = axis === 'x' ? viewport.w : viewport.h
  const pan = axis === 'x' ? view.panX : view.panY
  const step = tickStep(view.zoom)
  const minor = step / 5
  const start = Math.floor(-pan / view.zoom / minor) * minor
  const end = (len - pan) / view.zoom
  const ticks: { v: number; major: boolean }[] = []
  for (let v = start; v <= end; v += minor) ticks.push({ v: Math.round(v * 1000) / 1000, major: Math.abs(v / step - Math.round(v / step)) < 1e-6 })
  const sel = selection.length ? boundsOf(snap, selection) : null
  const hl = sel ? (axis === 'x' ? [sel.x, sel.x + sel.w] : [sel.y, sel.y + sel.h]) : null
  const at = (v: number) => pan + v * view.zoom
  const horiz = axis === 'x'
  return (
    <svg className={`ruler ruler-${axis}`} width={horiz ? len : RULER} height={horiz ? RULER : len}>
      {hl && (horiz ? <rect x={at(hl[0])} y={0} width={Math.max(1, at(hl[1]) - at(hl[0]))} height={RULER} className="ruler-hl" /> : <rect x={0} y={at(hl[0])} width={RULER} height={Math.max(1, at(hl[1]) - at(hl[0]))} className="ruler-hl" />)}
      {ticks.map(({ v, major }) => {
        const p = at(v)
        if (p < RULER) return null
        const size = major ? RULER * 0.55 : RULER * 0.25
        return (
          <g key={v}>
            {horiz ? <line x1={p} x2={p} y1={RULER} y2={RULER - size} /> : <line y1={p} y2={p} x1={RULER} x2={RULER - size} />}
            {major &&
              (horiz ? (
                <text x={p + 3} y={9}>
                  {v}
                </text>
              ) : (
                <text x={9} y={p + 3} transform={`rotate(-90 9 ${p + 3})`}>
                  {v}
                </text>
              ))}
          </g>
        )
      })}
    </svg>
  )
}

export function Rulers() {
  const show = useEditor((s) => s.prefs.showRulers)
  if (!show) return null
  return (
    <>
      <Ruler axis="x" />
      <Ruler axis="y" />
      <div className="ruler-corner" />
    </>
  )
}
