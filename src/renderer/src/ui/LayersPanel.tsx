import { useState } from 'react'
import type { Snapshot } from '../model/doc'
import { moveInto, setHidden, setLocked } from '../model/ops'
import type { FigObject, Id } from '../model/types'
import { useEditor, useSnapshot } from '../state/editor'
import { plainText } from '../text/layout'
import { Icon } from './icons'

const TYPE_LABEL: Record<FigObject['type'], string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  icon: 'Icon',
  line: 'Connector',
  brush: 'Brush',
  group: 'Group'
}

export function layerLabel(o: FigObject): string {
  if (o.name) return o.name
  if (o.type === 'text') return plainText(o.lines).split('\n')[0].slice(0, 40) || 'Text'
  return TYPE_LABEL[o.type]
}

type DropPos = 'before' | 'after' | 'inside'
const DRAG_TYPE = 'application/x-pucklet-layer'

function selectFromLayers(id: Id, additive: boolean, snap: Snapshot) {
  const s = useEditor.getState()
  const parent = snap.parentOf(id)
  if (additive && s.selection.length && s.selection.every((x) => snap.parentOf(x) === parent)) {
    s.set({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id], context: parent })
  } else {
    s.set({ selection: [id], context: parent })
  }
}

function Row({ o, depth, snap, expanded, toggle }: { o: FigObject; depth: number; snap: Snapshot; expanded: Set<Id>; toggle: (id: Id) => void }) {
  const selection = useEditor((s) => s.selection)
  const doc = useEditor((s) => s.doc)
  const [renaming, setRenaming] = useState(false)
  const [drop, setDrop] = useState<DropPos | null>(null)
  const isGroup = o.type === 'group'
  const open = expanded.has(o.id)
  // Layers are listed top-most first, so "before" in the list means "above" in paint order.
  const children = isGroup && open ? [...snap.children(o.id)].reverse() : []

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrop(null)
    const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || '[]') as Id[]
    if (!ids.length || ids.includes(o.id)) return
    if (drop === 'inside' && isGroup) {
      moveInto(doc, ids, o.id, null)
      return
    }
    const parent = snap.parentOf(o.id)
    const siblings = snap.childIdsOf(parent).filter((id) => id === o.id || !ids.includes(id))
    const i = siblings.indexOf(o.id)
    // Dropping above a row puts the objects just over it in paint order.
    const before = drop === 'before' ? siblings[i + 1] ?? null : o.id
    moveInto(doc, ids, parent, before)
  }

  return (
    <>
      <div
        className={`layer-row${selection.includes(o.id) ? ' on' : ''}${o.hidden ? ' hidden' : ''}${drop ? ' drop-' + drop : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!renaming}
        onDragStart={(e) => {
          const ids = selection.includes(o.id) ? selection : [o.id]
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const y = (e.clientY - r.top) / r.height
          setDrop(isGroup && y > 0.3 && y < 0.7 ? 'inside' : y < 0.5 ? 'before' : 'after')
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={(e) => selectFromLayers(o.id, e.shiftKey || e.metaKey, snap)}
        onDoubleClick={() => setRenaming(true)}
      >
        <button className={`twisty${isGroup ? '' : ' blank'}`} onClick={(e) => (e.stopPropagation(), toggle(o.id))} tabIndex={-1}>
          {isGroup ? (open ? '▾' : '▸') : ''}
        </button>
        <span className={`layer-kind kind-${o.type}`} />
        {renaming ? (
          <input
            className="layer-rename"
            autoFocus
            defaultValue={layerLabel(o)}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const name = e.target.value.trim()
              doc.transact((tx) => tx.update(o.id, { name: name || undefined }))
              setRenaming(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <span className="layer-name" title="Double-click to rename">
            {layerLabel(o)}
          </span>
        )}
        <button
          className={`layer-toggle${o.locked ? ' active' : ''}`}
          title={o.locked ? 'Unlock' : 'Lock'}
          onClick={(e) => (e.stopPropagation(), setLocked(doc, [o.id], !o.locked))}
        >
          {o.locked ? <Icon.lock /> : <Icon.unlock />}
        </button>
        <button
          className={`layer-toggle${o.hidden ? ' active' : ''}`}
          title={o.hidden ? 'Show' : 'Hide'}
          onClick={(e) => {
            e.stopPropagation()
            setHidden(doc, [o.id], !o.hidden)
            if (!o.hidden) useEditor.getState().select(selection.filter((x) => x !== o.id))
          }}
        >
          {o.hidden ? <Icon.eyeOff /> : <Icon.eye />}
        </button>
      </div>
      {children.map((c) => (
        <Row key={c.id} o={c} depth={depth + 1} snap={snap} expanded={expanded} toggle={toggle} />
      ))}
    </>
  )
}

export function LayersPanel() {
  const snap = useSnapshot()
  const [expanded, setExpanded] = useState<Set<Id>>(new Set())
  const toggle = (id: Id) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }
  const top = [...snap.children('')].reverse()
  return (
    <div className="layers">
      {!top.length && <p className="muted pad">No objects yet. Shapes, text and icons you add appear here, top-most first.</p>}
      {top.map((o) => (
        <Row key={o.id} o={o} depth={0} snap={snap} expanded={expanded} toggle={toggle} />
      ))}
      {top.length > 0 && <p className="muted small pad">Drag to reorder · drop onto a group to move inside · double-click to rename</p>}
    </div>
  )
}
