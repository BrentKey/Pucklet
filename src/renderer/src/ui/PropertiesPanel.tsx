import type { ReactNode } from 'react'
import { commands, duplicate } from '../app/commands'
import { licenseLabel } from '../export/export'
import { CANVAS_PRESETS, FONTS, SYMBOLS } from '../model/defaults'
import type { Snapshot } from '../model/doc'
import { center } from '../model/geometry'
import type { AlignMode } from '../model/ops'
import { align, distribute } from '../model/ops'
import { withTextSize } from '../model/transform'
import type { BoxObj, BrushKind, BrushObj, Cap, Dash, FigObject, GroupObj, IconObj, Id, LineObj, SmartSpec, TextObj } from '../model/types'
import { regenerate } from '../model/smart'
import { BRUSH_PRESETS, circlePoints, presetFor } from '../model/brush'
import { makeBrush } from '../model/defaults'
import { rectOfPoints } from '../model/geometry'
import { isBoxObj } from '../model/types'
import { useEditor, useSnapshot } from '../state/editor'
import { ColorField, IconButton, NumberField, Row, Section, Segmented } from './controls'
import { Icon } from './icons'
import { PanelsSection } from './PanelsSection'

// ---------------------------------------------------------------------------------------
// Updating helpers

function updateEach<T extends FigObject>(ids: Id[], fn: (o: T) => Partial<T> | null): void {
  const s = useEditor.getState()
  // Objects being typed into live in drafts (new text) — update those directly.
  const drafts = new Map(s.drafts)
  let draftChanged = false
  const docIds: Id[] = []
  for (const id of ids) {
    const d = drafts.get(id)
    if (d) {
      const p = fn(d as T)
      if (p) {
        drafts.set(id, { ...d, ...p } as FigObject)
        draftChanged = true
      }
    } else docIds.push(id)
  }
  if (draftChanged) s.set({ drafts })
  if (!docIds.length) return
  s.doc.transact((tx) => {
    for (const id of docIds) {
      const o = tx.snap.get(id) as T | undefined
      if (!o) continue
      const p = fn(o)
      if (p) tx.update<T>(id, p)
    }
  })
}

/** Text changes that affect size keep the box anchored according to its alignment. */
function updateText(ids: Id[], fn: (t: TextObj) => Partial<TextObj>) {
  updateEach<TextObj>(ids, (t) => {
    const next = withTextSize({ ...t, ...fn(t) })
    const dx = t.align === 'center' ? (t.w - next.w) / 2 : t.align === 'right' ? t.w - next.w : 0
    return { ...next, x: t.x + dx }
  })
}

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value)

// ---------------------------------------------------------------------------------------

const DASHES: { value: Dash; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' }
]

const CAPS: { value: Cap; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow ▶' },
  { value: 'open', label: 'Open arrow >' },
  { value: 'bar', label: 'Inhibition ⊣' },
  { value: 'dot', label: 'Dot ●' },
  { value: 'diamond', label: 'Diamond ◆' }
]

function same<T>(values: T[]): T | null {
  return values.length && values.every((v) => v === values[0]) ? values[0] : null
}

function StrokeFields({ objs }: { objs: (BoxObj | LineObj)[] }) {
  const ids = objs.map((o) => o.id)
  const stroked = objs.filter((o): o is Exclude<typeof o, TextObj | IconObj> => o.type !== 'text' && o.type !== 'icon')
  if (!stroked.length) return null
  return (
    <>
      <Row label="Stroke">
        <ColorField value={same(stroked.map((o) => o.stroke)) ?? '#000000'} allowNone onChange={(c) => updateEach(ids, () => ({ stroke: c }))} />
        <NumberField value={same(stroked.map((o) => o.strokeWidth))} min={0} max={100} step={0.5} suffix="px" onChange={(v) => updateEach(ids, () => ({ strokeWidth: v }))} />
      </Row>
      <Row label="Dash">
        <Segmented value={same(stroked.map((o) => o.dash))} options={DASHES} onChange={(dash) => updateEach(ids, () => ({ dash }))} />
      </Row>
    </>
  )
}

function GeometryFields({ o }: { o: BoxObj }) {
  const isText = o.type === 'text'
  const set = (patch: Partial<BoxObj>) => updateEach<BoxObj>([o.id], () => patch)
  return (
    <Section title="Position & size">
      <Row>
        <NumberField title="X" value={o.x} onChange={(x) => set({ x })} />
        <NumberField title="Y" value={o.y} onChange={(y) => set({ y })} />
      </Row>
      <Row>
        <NumberField
          title="W"
          value={o.w}
          min={1}
          disabled={isText}
          onChange={(w) => {
            const c = center(o)
            set({ w, x: c.x - w / 2 })
          }}
        />
        <NumberField
          title="H"
          value={o.h}
          min={1}
          disabled={isText}
          onChange={(h) => {
            const c = center(o)
            set({ h, y: c.y - h / 2 })
          }}
        />
      </Row>
      <Row>
        <NumberField title="↻" value={o.rotation} suffix="°" onChange={(rotation) => set({ rotation: ((((rotation + 180) % 360) + 360) % 360) - 180 })} />
        {o.type === 'icon' && (
          <span className="btn-group">
            <IconButton title="Flip horizontally" onClick={() => updateEach<IconObj>([o.id], (i) => ({ flipX: !i.flipX }))}>
              <Icon.flipH />
            </IconButton>
            <IconButton title="Flip vertically" onClick={() => updateEach<IconObj>([o.id], (i) => ({ flipY: !i.flipY }))}>
              <Icon.flipV />
            </IconButton>
          </span>
        )}
      </Row>
    </Section>
  )
}

function TextFields({ texts }: { texts: TextObj[] }) {
  const editing = useEditor((s) => s.editingText)
  const ids = texts.map((t) => t.id)
  const allRuns = texts.flatMap((t) => t.lines.flat())
  const all = (k: 'bold' | 'italic' | 'underline') => allRuns.length > 0 && allRuns.every((r) => r[k])
  const toggle = (k: 'bold' | 'italic' | 'underline') => {
    if (editing) return exec(k)
    const on = !all(k)
    updateText(ids, (t) => ({ lines: t.lines.map((l) => l.map((r) => ({ ...r, [k]: on || undefined }))) }))
  }
  const t0 = texts[0]
  return (
    <Section title="Text">
      <Row>
        <select
          className="grow"
          value={same(texts.map((t) => t.fontFamily)) ?? ''}
          onChange={(e) => updateText(ids, () => ({ fontFamily: e.target.value }))}
          style={{ fontFamily: t0.fontFamily }}
        >
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>
        <NumberField value={same(texts.map((t) => t.fontSize))} min={1} max={1000} suffix="pt" onChange={(fontSize) => updateText(ids, () => ({ fontSize }))} />
      </Row>
      <Row>
        <span className="btn-group">
          <IconButton title="Bold (⌘B)" active={all('bold')} onClick={() => toggle('bold')} keepTextFocus>
            <b>B</b>
          </IconButton>
          <IconButton title="Italic (⌘I)" active={all('italic')} onClick={() => toggle('italic')} keepTextFocus>
            <i>I</i>
          </IconButton>
          <IconButton title="Underline (⌘U)" active={all('underline')} onClick={() => toggle('underline')} keepTextFocus>
            <u>U</u>
          </IconButton>
          <IconButton title="Superscript (⇧⌘=) — select characters while editing" disabled={!editing} onClick={() => exec('superscript')} keepTextFocus>
            x<sup>2</sup>
          </IconButton>
          <IconButton title="Subscript (⌘=) — select characters while editing" disabled={!editing} onClick={() => exec('subscript')} keepTextFocus>
            x<sub>2</sub>
          </IconButton>
        </span>
        <ColorField
          value={same(texts.map((t) => t.color)) ?? '#000000'}
          title="Text colour"
          onChange={(c) => {
            if (editing && window.getSelection()?.toString()) exec('foreColor', c)
            else updateText(ids, (t) => ({ color: c, lines: t.lines.map((l) => l.map(({ color: _c, ...r }) => (void _c, r))) }))
          }}
        />
      </Row>
      <Row label="Align">
        <Segmented
          value={same(texts.map((t) => t.align))}
          options={[
            { value: 'left', label: '⇤', title: 'Left' },
            { value: 'center', label: '↔', title: 'Center' },
            { value: 'right', label: '⇥', title: 'Right' }
          ]}
          onChange={(align) => updateEach<TextObj>(ids, () => ({ align }))}
        />
        <NumberField title="↕" value={same(texts.map((t) => t.lineHeight))} min={0.5} max={4} step={0.05} precision={2} onChange={(lineHeight) => updateText(ids, () => ({ lineHeight }))} />
      </Row>
      <div className="symbols" title={editing ? 'Insert symbol' : 'Double-click a text box to insert symbols'}>
        {SYMBOLS.map((c) => (
          <button key={c} disabled={!editing} data-keep-text-focus onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertText', c)}>
            {c}
          </button>
        ))}
      </div>
    </Section>
  )
}

function IconFields({ icons, snap }: { icons: IconObj[]; snap: Snapshot }) {
  const asset = snap.assets.get(icons[0].assetId)
  const sameAsset = icons.every((i) => i.assetId === icons[0].assetId)
  if (!asset || !sameAsset) return null
  const ids = icons.map((i) => i.id)
  const palette = asset.palette ?? []
  return (
    <Section
      title={asset.kind === 'svg' ? 'Icon colours' : 'Image'}
      actions={
        <button
          className="link"
          title="Select every copy of this icon"
          onClick={() => useEditor.getState().select([...snap.objects.values()].filter((o) => o.type === 'icon' && o.assetId === asset.id).map((o) => o.id))}
        >
          Select all copies
        </button>
      }
    >
      {asset.kind === 'svg' && palette.length > 0 && (
        <>
          <div className="palette">
            {palette.slice(0, 24).map((c) => (
              <ColorField
                key={c}
                title={`Original ${c}`}
                value={same(icons.map((i) => i.recolor[c] ?? c)) ?? c}
                onChange={(to) => updateEach<IconObj>(ids, (i) => ({ recolor: { ...i.recolor, [c]: to } }))}
              />
            ))}
          </div>
          <button className="link" onClick={() => updateEach<IconObj>(ids, () => ({ recolor: {} }))}>
            Reset colours
          </button>
        </>
      )}
      {asset.kind === 'svg' && icons.length === 1 && (
        <button
          className="wide"
          title="Create a brush that repeats this icon along a path you can reshape"
          onClick={() => {
            const i = icons[0]
            const doc = useEditor.getState().doc
            const size = Math.min(i.w, i.h)
            const brush = {
              ...makeBrush(doc.snapshot().topZ(doc.snapshot().parentOf(i.id)), 'icon', [{ x: i.x, y: i.y + i.h / 2 }, { x: i.x + size * 6, y: i.y + i.h / 2 }], false),
              assetId: asset.id,
              spacing: i.w,
              thickness: i.h,
              smooth: true,
              ...(i.parentId ? { parentId: i.parentId } : {})
            }
            // The brush takes the icon's place.
            doc.transact((tx) => {
              tx.add({ ...brush, z: i.z })
              tx.remove(i.id)
            })
            useEditor.getState().select([brush.id])
          }}
        >
          Repeat along a path
        </button>
      )}
      {asset.source && (
        <p className="credit">
          <strong>{asset.name}</strong>
          <br />
          {asset.source.author ? `${asset.source.author} · ` : ''}
          {asset.source.library} · {licenseLabel(asset.source.license)}
        </p>
      )}
    </Section>
  )
}

function BrushFields({ brushes }: { brushes: BrushObj[] }) {
  const ids = brushes.map((b) => b.id)
  const b0 = brushes[0]
  const sameKind = brushes.every((b) => b.kind === b0.kind)
  const preset = presetFor(b0.kind)
  const gesture = { onPointerDown: () => useEditor.getState().doc.beginGesture(), onPointerUp: () => useEditor.getState().doc.endGesture() }
  return (
    <Section title="Brush">
      <Row label="Pattern">
        <select
          value={sameKind ? b0.kind : ''}
          onChange={(e) => {
            const p = presetFor(e.target.value as BrushKind)
            if (p.kind === 'icon') return
            updateEach<BrushObj>(ids, () => ({ kind: p.kind, spacing: p.spacing, thickness: p.thickness, colors: [...p.colors], assetId: undefined }))
          }}
        >
          {!sameKind && <option value="">Mixed</option>}
          {BRUSH_PRESETS.filter((p) => p.kind !== 'icon' || b0.kind === 'icon').map((p) => (
            <option key={p.kind} value={p.kind}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
      {sameKind && preset.colorNames.length > 0 && (
        <div className="brush-colors">
          {preset.colorNames.map((name, i) => (
            <span key={name} className="brush-color" title={name}>
              <ColorField
                value={b0.colors[i] ?? '#999999'}
                onChange={(c) =>
                  updateEach<BrushObj>(ids, (b) => {
                    const colors = b.colors.slice()
                    colors[i] = c
                    return { colors }
                  })
                }
              />
              <span className="small muted">{name}</span>
            </span>
          ))}
        </div>
      )}
      <Row label={b0.kind === 'dna' ? 'Turn' : 'Spacing'}>
        <NumberField value={same(brushes.map((b) => b.spacing))} min={2} max={1000} suffix="px" onChange={(spacing) => updateEach<BrushObj>(ids, () => ({ spacing }))} />
      </Row>
      <Row label="Width">
        <input
          type="range"
          min={4}
          max={200}
          value={same(brushes.map((b) => b.thickness)) ?? 40}
          {...gesture}
          onChange={(e) => updateEach<BrushObj>(ids, () => ({ thickness: Number(e.target.value) }))}
        />
        <span className="muted small">{same(brushes.map((b) => b.thickness)) ?? '—'}</span>
      </Row>
      <div className="btn-row">
        <label className="check small">
          <input type="checkbox" checked={b0.closed} onChange={(e) => updateEach<BrushObj>(ids, (b) => (b.points.length > 2 ? { closed: e.target.checked } : null))} />
          Closed loop
        </label>
        <label className="check small">
          <input type="checkbox" checked={b0.smooth} onChange={(e) => updateEach<BrushObj>(ids, () => ({ smooth: e.target.checked }))} />
          Smooth
        </label>
        {(b0.kind === 'monolayer' || b0.kind === 'dna') && (
          <label className="check small">
            <input type="checkbox" checked={b0.flip} onChange={(e) => updateEach<BrushObj>(ids, () => ({ flip: e.target.checked }))} />
            Flip
          </label>
        )}
      </div>
      <div className="btn-row">
        <button
          title="Turn this brush into a closed oval, e.g. a cell membrane"
          onClick={() =>
            updateEach<BrushObj>(ids, (b) => {
              const r = rectOfPoints(b.points)
              const rx = Math.max(r.w, 40) / 2
              const ry = Math.max(r.h, 40) / 2
              return { points: circlePoints(r.x + r.w / 2, r.y + r.h / 2, rx, ry), closed: true, smooth: true }
            })
          }
        >
          Make oval
        </button>
        <span className="muted small">Drag ● to reshape, ○ to add a point, ⌥-click ● to delete.</span>
      </div>
    </Section>
  )
}

function SmartFields({ group }: { group: GroupObj }) {
  const spec = group.smart!
  const doc = useEditor((s) => s.doc)
  const set = (patch: Partial<SmartSpec>) => regenerate(doc, group.id, { ...spec, ...patch })
  const isTimeline = spec.kind === 'timeline'
  return (
    <Section title={isTimeline ? 'Timeline' : 'Protocol steps'}>
      <textarea
        className="smart-items"
        rows={Math.min(12, Math.max(4, spec.items.length + 1))}
        defaultValue={spec.items.join('\n')}
        key={group.id}
        spellCheck
        onFocus={() => doc.beginGesture()}
        onBlur={() => doc.endGesture()}
        onChange={(e) => set({ items: e.target.value.split('\n') })}
      />
      <p className="muted small">
        One {isTimeline ? 'event' : 'step'} per line. Use “{isTimeline ? 'Day 3: Inject' : 'Title: detail'}” to add a {isTimeline ? 'time' : 'second line'}.
      </p>
      <Row label="Layout">
        <Segmented
          value={spec.direction}
          options={[
            { value: 'horizontal', label: 'Across' },
            { value: 'vertical', label: 'Down' }
          ]}
          // Steps stacked downwards need less room than steps side by side.
          onChange={(direction) => set({ direction, spacing: direction === 'vertical' ? (isTimeline ? 90 : 80) : isTimeline ? 200 : 170 })}
        />
      </Row>
      {!isTimeline && (
        <Row label="Numbers">
          <Segmented
            value={spec.numbering}
            options={[
              { value: '1', label: '1 2 3' },
              { value: 'i', label: 'i ii' },
              { value: 'a', label: 'a b' },
              { value: 'none', label: 'None' }
            ]}
            onChange={(numbering) => set({ numbering })}
          />
        </Row>
      )}
      <Row label="Colour">
        <ColorField value={spec.color} onChange={(color) => set({ color })} />
        <NumberField title="Spacing" value={spec.spacing} min={60} max={600} step={10} onChange={(spacing) => set({ spacing })} />
      </Row>
      <p className="muted small">Edits here rebuild the {isTimeline ? 'timeline' : 'steps'}; manual changes inside the group are replaced.</p>
    </Section>
  )
}

function LineFields({ lines }: { lines: LineObj[] }) {
  const ids = lines.map((l) => l.id)
  return (
    <Section title="Connector">
      <Row label="Route">
        <Segmented
          value={same(lines.map((l) => l.route))}
          options={[
            { value: 'straight', label: 'Straight' },
            { value: 'curved', label: 'Curved' },
            { value: 'elbow', label: 'Elbow' }
          ]}
          onChange={(route) => updateEach<LineObj>(ids, (l) => ({ route, bend: route === 'curved' && !l.bend ? 60 : l.bend }))}
        />
      </Row>
      <Row label="Start">
        <select value={same(lines.map((l) => l.startCap)) ?? ''} onChange={(e) => updateEach<LineObj>(ids, () => ({ startCap: e.target.value as Cap }))}>
          {CAPS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="End">
        <select value={same(lines.map((l) => l.endCap)) ?? ''} onChange={(e) => updateEach<LineObj>(ids, () => ({ endCap: e.target.value as Cap }))}>
          {CAPS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <IconButton
          title="Swap ends"
          onClick={() => updateEach<LineObj>(ids, (l) => ({ start: l.end, end: l.start, startCap: l.endCap, endCap: l.startCap, bend: -l.bend }))}
        >
          ⇄
        </IconButton>
      </Row>
      <Row label="Gap">
        <NumberField value={same(lines.map((l) => l.padding))} min={0} max={200} suffix="px" title="" onChange={(padding) => updateEach<LineObj>(ids, () => ({ padding }))} />
      </Row>
      <StrokeFields objs={lines} />
    </Section>
  )
}

function ArrangeFields({ ids, snap }: { ids: Id[]; snap: Snapshot }) {
  const multi = ids.length > 1
  const doAlign = (m: AlignMode) => {
    const { width, height } = snap.meta
    align(useEditor.getState().doc, ids, m, multi ? undefined : { x: 0, y: 0, w: width, h: height })
  }
  const btn = (m: AlignMode, title: string, icon: ReactNode) => (
    <IconButton title={`${title}${multi ? '' : ' (to canvas)'}`} onClick={() => doAlign(m)}>
      {icon}
    </IconButton>
  )
  return (
    <Section title={multi ? `Arrange ${ids.length} objects` : 'Align to canvas'}>
      <div className="btn-row">
        {btn('left', 'Align left', <Icon.alignLeft />)}
        {btn('hcenter', 'Align centers horizontally', <Icon.alignHCenter />)}
        {btn('right', 'Align right', <Icon.alignRight />)}
        {btn('top', 'Align top', <Icon.alignTop />)}
        {btn('vcenter', 'Align middles', <Icon.alignVCenter />)}
        {btn('bottom', 'Align bottom', <Icon.alignBottom />)}
      </div>
      {ids.length > 2 && (
        <div className="btn-row">
          <IconButton title="Distribute horizontally" onClick={() => distribute(useEditor.getState().doc, ids, 'h')}>
            <Icon.distH />
          </IconButton>
          <IconButton title="Distribute vertically" onClick={() => distribute(useEditor.getState().doc, ids, 'v')}>
            <Icon.distV />
          </IconButton>
        </div>
      )}
    </Section>
  )
}

function CanvasFields({ snap }: { snap: Snapshot }) {
  const { width, height, background } = snap.meta
  const doc = useEditor((s) => s.doc)
  const preset = CANVAS_PRESETS.find((p) => p.width === width && p.height === height)
  const setMeta = (patch: Partial<Snapshot['meta']>) => doc.transact((tx) => tx.setMeta(patch))
  const mm = (px: number) => `${Math.round((px / 96) * 25.4)} mm`
  return (
    <>
      <Section title="Canvas">
        <Row>
          <select className="grow" value={preset?.name ?? ''} onChange={(e) => {
            const p = CANVAS_PRESETS.find((x) => x.name === e.target.value)
            if (p) setMeta({ width: p.width, height: p.height })
          }}>
            <option value="">Custom size</option>
            {CANVAS_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
        <Row>
          <NumberField title="W" value={width} min={16} max={20000} precision={0} suffix="px" onChange={(w) => setMeta({ width: Math.round(w) })} />
          <NumberField title="H" value={height} min={16} max={20000} precision={0} suffix="px" onChange={(h) => setMeta({ height: Math.round(h) })} />
        </Row>
        <p className="muted small">
          {mm(width)} × {mm(height)} · {(width / 96).toFixed(2)} × {(height / 96).toFixed(2)} in
        </p>
        <Row label="Background">
          <ColorField value={background} allowNone onChange={(c) => setMeta({ background: c })} />
          <span className="muted small">{background === 'none' ? 'Transparent' : background}</span>
        </Row>
      </Section>
      <PanelsSection />
      <Section title="Tips">
        <ul className="tips">
          <li>Drag icons from the left panel, or drop SVG/PNG files on the canvas.</li>
          <li>Arrows (A) snap to shapes and follow them when moved. Hold ⌥ to place freely.</li>
          <li>Drag an arrow's ◆ handle to curve it.</li>
          <li>Double-click text to edit; double-click a group to edit inside it.</li>
          <li>Hold Space to pan; pinch or ⌘-scroll to zoom.</li>
        </ul>
      </Section>
    </>
  )
}

const TYPE_LABEL: Record<FigObject['type'], string> = { rect: 'Rectangle', ellipse: 'Ellipse', text: 'Text', icon: 'Icon', line: 'Connector', brush: 'Brush', group: 'Group' }

export function PropertiesPanel() {
  const snap = useSnapshot()
  const drafts = useEditor((s) => s.drafts)
  const selection = useEditor((s) => s.selection)
  const live = snap.withOverrides(drafts)
  const objs = selection.map((id) => live.get(id)).filter((o): o is FigObject => !!o)
  if (!objs.length) {
    return (
      <aside className="right-panel">
        <CanvasFields snap={snap} />
      </aside>
    )
  }
  const ids = objs.map((o) => o.id)
  const types = new Set(objs.map((o) => o.type))
  const single = objs.length === 1 ? objs[0] : null
  const locked = objs.every((o) => o.locked)
  const title = single ? single.name ?? TYPE_LABEL[single.type] : `${objs.length} objects`
  const shapes = objs.filter((o): o is Extract<FigObject, { type: 'rect' | 'ellipse' }> => o.type === 'rect' || o.type === 'ellipse')
  const texts = objs.filter((o): o is TextObj => o.type === 'text')
  const icons = objs.filter((o): o is IconObj => o.type === 'icon')
  const lines = objs.filter((o): o is LineObj => o.type === 'line')
  const brushes = objs.filter((o): o is BrushObj => o.type === 'brush')

  return (
    <aside className="right-panel">
      <div className="sel-header">
        <span className="sel-title">{title}</span>
        <span className="btn-group">
          <IconButton title="Duplicate (⌘D)" onClick={duplicate}>
            <Icon.duplicate />
          </IconButton>
          {objs.length > 1 && (
            <IconButton title="Group (⌘G)" onClick={commands['arrange.group']}>
              <Icon.group />
            </IconButton>
          )}
          {types.has('group') && (
            <IconButton title="Ungroup (⇧⌘G)" onClick={commands['arrange.ungroup']}>
              <Icon.ungroup />
            </IconButton>
          )}
          <IconButton title="Bring to front" onClick={commands['arrange.front']}>
            <Icon.front />
          </IconButton>
          <IconButton title="Send to back" onClick={commands['arrange.back']}>
            <Icon.back />
          </IconButton>
          <IconButton title={locked ? 'Unlock (⌘L)' : 'Lock (⌘L)'} active={locked} onClick={commands['arrange.lock']}>
            {locked ? <Icon.lock /> : <Icon.unlock />}
          </IconButton>
          <IconButton title="Delete (⌫)" onClick={commands['edit.delete']}>
            <Icon.trash />
          </IconButton>
        </span>
      </div>

      {locked && <p className="muted pad">Locked. Unlock to edit.</p>}
      {!locked && (
        <>
          <ArrangeFields ids={ids} snap={live} />
          {single?.type === 'group' && single.smart && <SmartFields group={single} />}
          {single && isBoxObj(single) && <GeometryFields o={single} />}
          {shapes.length > 0 && (
            <Section title={shapes.length === objs.length ? 'Style' : 'Shape style'}>
              <Row label="Fill">
                <ColorField value={same(shapes.map((o) => o.fill)) ?? '#ffffff'} allowNone onChange={(fill) => updateEach(shapes.map((o) => o.id), () => ({ fill }))} />
              </Row>
              <StrokeFields objs={shapes} />
              {shapes.every((s) => s.type === 'rect') && (
                <Row label="Corners">
                  <NumberField value={same(shapes.map((o) => (o.type === 'rect' ? o.radius : 0)))} min={0} max={1000} suffix="px" onChange={(radius) => updateEach(shapes.map((o) => o.id), () => ({ radius }))} />
                </Row>
              )}
            </Section>
          )}
          {texts.length > 0 && <TextFields texts={texts} />}
          {icons.length > 0 && <IconFields icons={icons} snap={live} />}
          {lines.length > 0 && <LineFields lines={lines} />}
          {brushes.length > 0 && <BrushFields brushes={brushes} />}
          <Section title="Layer">
            <Row label="Opacity">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={same(objs.map((o) => o.opacity)) ?? 1}
                onPointerDown={() => useEditor.getState().doc.beginGesture()}
                onPointerUp={() => useEditor.getState().doc.endGesture()}
                onChange={(e) => updateEach(ids, () => ({ opacity: Number(e.target.value) }))}
              />
              <span className="muted small">{Math.round((same(objs.map((o) => o.opacity)) ?? 1) * 100)}%</span>
            </Row>
          </Section>
        </>
      )}
    </aside>
  )
}
