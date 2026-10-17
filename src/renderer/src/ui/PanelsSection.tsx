import { useState } from 'react'
import { viewportCenter } from '../library/place'
import type { LabelStyle, PanelLayout, PanelOptions } from '../model/panels'
import { addPanelLabel, addPanelLayout, DEFAULT_PANEL_OPTIONS, PANEL_LAYOUTS, reletterPanels } from '../model/panels'
import { useEditor } from '../state/editor'
import { NumberField, Row, Section } from './controls'

function LayoutThumb({ layout }: { layout: PanelLayout }) {
  const W = 40
  const H = 28
  const g = 2
  const cw = (W - g * (layout.cols + 1)) / layout.cols
  const ch = (H - g * (layout.rows + 1)) / layout.rows
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect width={W} height={H} rx={3} fill="#f3f4f6" />
      {layout.cells.map(([c, r, cs, rs], i) => (
        <rect key={i} x={g + c * (cw + g)} y={g + r * (ch + g)} width={cw * cs + g * (cs - 1)} height={ch * rs + g * (rs - 1)} rx={1.5} fill="#cbd5e1" />
      ))}
    </svg>
  )
}

const STYLES: LabelStyle[] = ['A', 'a', '(a)', 'A.', 'a)']

export function PanelsSection() {
  const doc = useEditor((s) => s.doc)
  const [opts, setOpts] = useState<PanelOptions>(DEFAULT_PANEL_OPTIONS)
  const set = (patch: Partial<PanelOptions>) => setOpts({ ...opts, ...patch })
  return (
    <Section title="Multi-panel figure">
      <div className="layout-grid">
        {PANEL_LAYOUTS.map((l) => (
          <button
            key={l.id}
            className="layout-btn"
            title={`Add ${l.name} panels`}
            onClick={() => {
              const ids = addPanelLayout(doc, l, opts)
              useEditor.getState().select(ids)
              useEditor.getState().showToast(`Added ${l.cells.length} panels. Use Layers to lock the frames if they get in the way.`)
            }}
          >
            <LayoutThumb layout={l} />
          </button>
        ))}
      </div>
      <Row label="Labels">
        <select value={opts.labelStyle} onChange={(e) => set({ labelStyle: e.target.value as LabelStyle })}>
          {STYLES.map((s) => (
            <option key={s} value={s}>
              {s} {s === 'A' ? 'B C' : s === 'a' ? 'b c' : ''}
            </option>
          ))}
        </select>
        <NumberField value={opts.labelSize} min={6} max={200} suffix="pt" onChange={(labelSize) => set({ labelSize })} />
      </Row>
      <Row label="Spacing">
        <NumberField title="Gap" value={opts.gap} min={0} max={500} onChange={(gap) => set({ gap })} />
        <NumberField title="Margin" value={opts.margin} min={0} max={500} onChange={(margin) => set({ margin })} />
      </Row>
      <label className="check small">
        <input type="checkbox" checked={opts.frames} onChange={(e) => set({ frames: e.target.checked })} />
        Draw dashed panel frames
      </label>
      <div className="btn-row">
        <button
          title="Renumber every panel label left-to-right, top-to-bottom"
          onClick={() => {
            const n = reletterPanels(doc, opts.labelStyle)
            useEditor.getState().showToast(n ? `Re-lettered ${n} panel labels` : 'No panel labels yet')
          }}
        >
          Re-letter panels
        </button>
        <button
          title="Add the next panel letter"
          onClick={() => {
            const c = viewportCenter()
            useEditor.getState().select([addPanelLabel(doc, c.x, c.y, opts.labelStyle, opts.labelSize)])
          }}
        >
          + Label
        </button>
      </div>
    </Section>
  )
}
